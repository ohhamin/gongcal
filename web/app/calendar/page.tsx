'use client';

import { appAlert, appConfirm } from '@/components/AppDialogProvider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { flushSync } from 'react-dom';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import { DateSelectArg, DatesSetArg, EventClickArg } from '@fullcalendar/core';

import CalendarLoading from '@/components/CalendarLoading';
import GroupSelector from '@/components/GroupSelector';
import Icon from '@/components/Icon';
import NotificationButton from '@/components/NotificationButton';
import TimeSelect from '@/components/TimeSelect';
import { normalizeProfile, Profile } from '@/lib/groups';
import { createNotificationWithPush } from '@/lib/pushNotifications';
import { supabase } from '@/lib/supabase';
import {
    START_TIME_SLOTS,
    dateToTimeValue,
    getValidEndSlots,
    isAllDayEvent,
    timeValueToDate,
    type TimeValue,
} from '@/lib/timeSlots';
import { useCurrentUser, useMyProfile } from '@/lib/useCurrentProfile';

type EventInvite = {
    event_id: number;
    profile_id: string;
    is_agree: boolean;
};

type EventAttendee = {
    profile_id: string;
    nickname: string | null;
    is_agree: boolean;
    isOwner: boolean;
};

type InviteAttendeeRpcRow = {
    event_id: number;
    profile_id: string;
    nickname: string | null;
    is_agree: boolean;
};

type CalendarEvent = {
    id: string;
    title: string;
    detail: string | null;
    start_at: string;
    end_at: string;
    user_id: string;
    is_hidden: boolean;
    is_allday: boolean;
    display_profile_id?: string;
    display_relation?: 'my_owner' | 'my_invite_pending' | 'my_invite_accepted' | 'other_owner' | 'other_invite_accepted';
    invite_profile_id?: string;
    invite_is_agree?: boolean;
    is_holiday?: boolean;
};

type MyInvitedEventRpcRow = CalendarEvent & {
    invite_profile_id: string;
    invite_is_agree: boolean;
};

type Person = Profile;

const RANGE_SELECT_DELAY_MS = 650;
const RANGE_HAPTIC_DELAY_MS = 1000;

type HolidayInfo = {
    dateName: string;
};

type GroupMemberRow = {
    profile_id: string;
    profile: Person | Person[] | null;
};

type CommentRow = {
    id: number;
    events_id: number;
    profile_id: string;
    contents: string | null;
    created_at: string | null;
    profile: Person | null;
};

type CommentQueryRow = Omit<CommentRow, 'profile'> & {
    profile: Person | Person[] | null;
};

const MY_EVENT_COLOR = '#3B82F6';
const GROUP_EVENT_COLOR = '#10B981';
const PENDING_INVITE_COLOR = GROUP_EVENT_COLOR;
// 8자리 hex의 99는 약 60% opacity입니다. 숨김 일정은 내용 대신 존재 여부만 보여줍니다.
const HIDDEN_EVENT_COLOR_ALPHA = '99';
const EVENT_TITLE_MAX_LENGTH = 50;
const EVENT_DETAIL_MAX_LENGTH = 500;
const COMMENT_MAX_LENGTH = 100;
const DEFAULT_START_TIME: TimeValue = '09:00';
const DEFAULT_END_TIME: TimeValue = '22:00';
const MASTER_FILTER_MY_ONLY = 'my-only';
const MASTER_FILTER_GROUP = 'group';

function formatLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatLocdate(locdate: string): string | null {
    const normalized = locdate.trim();
    if (!/^\d{8}$/.test(normalized)) return null;
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
}

function parseHolidayXml(xmlText: string): Record<string, HolidayInfo> {
    const documentXml = new DOMParser().parseFromString(xmlText, 'text/xml');
    const holidays: Record<string, HolidayInfo> = {};

    documentXml.querySelectorAll('item').forEach((item) => {
        const dateName = item.querySelector('dateName')?.textContent?.trim();
        const locdate = item.querySelector('locdate')?.textContent?.trim();
        if (!dateName || !locdate) return;

        const dateKey = formatLocdate(locdate);
        if (!dateKey) return;

        holidays[dateKey] = { dateName };
    });

    return holidays;
}

function formatPopupDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(year, month - 1, day).getDay()];
    return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

function formatMonthNavLabel(date: Date): string {
    return `${date.getFullYear()}. ${date.getMonth() + 1}`;
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function getTodayString(): string {
    return formatLocalDateString(new Date());
}

function formatEventTimeLabel(event: CalendarEvent): string {
    return event.is_allday ? '하루 종일' : `${formatHourMinute(event.start_at)} - ${formatHourMinute(event.end_at)}`;
}

function isSameDate(start: string, end: string): boolean {
    return start === end;
}

function getDisplayPriority(event: CalendarEvent): number {
    if (event.is_holiday) return 0;
    if (event.is_allday) return 1;
    // 미수락 초대는 사용자가 확인/수락해야 하므로 같은 날짜의 친구 일정 노출보다 앞에 둡니다.
    if (event.display_relation === 'my_invite_pending') return 2;
    return 3;
}

function getDisplayRelationRank(event: CalendarEvent): number {
    if (event.display_relation === 'my_owner') return 1;
    if (event.display_relation === 'my_invite_pending' || event.display_relation === 'my_invite_accepted') return 2;
    if (event.display_relation === 'other_owner') return 3;
    return 4;
}

function isMyOwnedEvent(event: CalendarEvent): boolean {
    return event.display_relation === 'my_owner';
}

function isPendingMyInvite(event: CalendarEvent): boolean {
    return event.display_relation === 'my_invite_pending';
}

function isAcceptedMyInvite(event: CalendarEvent): boolean {
    return event.display_relation === 'my_invite_accepted';
}

function isMyInviteEvent(event: CalendarEvent): boolean {
    return isPendingMyInvite(event) || isAcceptedMyInvite(event);
}

function canSeeEventDetail(event: CalendarEvent): boolean {
    if (event.is_holiday) return false;
    return isMyOwnedEvent(event) || isMyInviteEvent(event);
}

function getOwnerName(event: CalendarEvent, ownerNameById: Map<string, string>): string {
    if (event.is_holiday) return '공휴일';
    return ownerNameById.get(event.user_id) || '이름 없음';
}

function getEventDisplayTitle(event: CalendarEvent, ownerNameById: Map<string, string>): string {
    return event.is_hidden && !canSeeEventDetail(event) ? `🔒${getOwnerName(event, ownerNameById)}` : event.title;
}

function getEventBaseColor(event: CalendarEvent): string {
    if (event.is_holiday) return 'rgba(220, 38, 38, 0.6)';
    if (isMyOwnedEvent(event) || isAcceptedMyInvite(event)) return MY_EVENT_COLOR;
    if (isPendingMyInvite(event)) return PENDING_INVITE_COLOR;
    return GROUP_EVENT_COLOR;
}

function getStartMinutes(event: CalendarEvent): number {
    const start = new Date(event.start_at);
    return start.getHours() * 60 + start.getMinutes();
}

function getOwnershipSortRank(event: CalendarEvent): number {
    if (event.is_holiday) return -1;
    return isMyOwnedEvent(event) ? 0 : 1;
}

function compareCalendarEvents(a: CalendarEvent, b: CalendarEvent): number {
    const priorityDiff = getDisplayPriority(a) - getDisplayPriority(b);
    if (priorityDiff !== 0) return priorityDiff;

    const startDiff = getStartMinutes(a) - getStartMinutes(b);
    if (startDiff !== 0) return startDiff;

    const ownershipDiff = getOwnershipSortRank(a) - getOwnershipSortRank(b);
    if (ownershipDiff !== 0) return ownershipDiff;

    return a.title.localeCompare(b.title, 'ko');
}

function getDateStringsInRange(startAt: string, endAt: string): string[] {
    const startDateStr = formatLocalDateString(new Date(startAt));
    const endDateStr = formatLocalDateString(new Date(endAt));
    const dates: string[] = [];
    const cursor = new Date(`${startDateStr}T00:00:00`);

    // 긴 일정도 월간 캘린더에서는 이어진 막대가 아니라 날짜별 단일 칸으로 렌더링합니다.
    // 같은 DB row를 여러 표시 인스턴스로 펼치므로 클릭/삭제는 원본 일정 하나에 연결됩니다.
    for (let guard = 0; formatLocalDateString(cursor) <= endDateStr && guard < 370; guard += 1) {
        dates.push(formatLocalDateString(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
}

function formatHourMinute(value: string): string {
    const d = new Date(value);
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
}

function formatDateTimeText(value: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hour}:${minute}`;
}

export default function CalendarPage() {
    const router = useRouter();
    const currentUserQuery = useCurrentUser();
    const profileQuery = useMyProfile();

    const [people, setPeople] = useState<Person[]>([]);
    const [filterPeople, setFilterPeople] = useState<Person[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [commentCountByEventId, setCommentCountByEventId] = useState<Record<string, number>>({});
    const [masterFilterMode, setMasterFilterMode] = useState<typeof MASTER_FILTER_MY_ONLY | typeof MASTER_FILTER_GROUP>(MASTER_FILTER_GROUP);
    const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
    const [isMemberFilterOpen, setIsMemberFilterOpen] = useState(false);
    const memberFilterRef = useRef<HTMLDivElement | null>(null);
    const previousGroupIdRef = useRef<number | null | undefined>(undefined);
    const [myUserId, setMyUserId] = useState<string | null>(null);
    const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);
    const [isCalendarLoading, setIsCalendarLoading] = useState(true);

    const [popupDate, setPopupDate] = useState<string | null>(null);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [startDate, setStartDate] = useState(getTodayString());
    const [endDate, setEndDate] = useState(getTodayString());
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [detail, setDetail] = useState('');
    const [startTime, setStartTime] = useState<TimeValue>(DEFAULT_START_TIME);
    const [endTime, setEndTime] = useState<TimeValue>(DEFAULT_END_TIME);
    const [isAllDay, setIsAllDay] = useState(false);
    const prevStartTimeRef = useRef<TimeValue>(DEFAULT_START_TIME);
    const prevEndTimeRef = useRef<TimeValue>(DEFAULT_END_TIME);
    const [isHidden, setIsHidden] = useState(true);
    const [isVisibilityTooltipOpen, setIsVisibilityTooltipOpen] = useState(false);
    const visibilityTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [attendees, setAttendees] = useState<EventAttendee[]>([]);
    const [isInviteSearchOpen, setIsInviteSearchOpen] = useState(false);
    const [friendSearchKeyword, setFriendSearchKeyword] = useState('');
    const [friendSearchResults, setFriendSearchResults] = useState<Person[]>([]);
    const [isFriendSearching, setIsFriendSearching] = useState(false);
    const [dragRange, setDragRange] = useState<{ start: string; end: string } | null>(null);
    const [pendingRange, setPendingRange] = useState<{ start: string; end: string } | null>(null);
    const [holidayByDate, setHolidayByDate] = useState<Record<string, HolidayInfo>>({});
    const [calendarMonthDate, setCalendarMonthDate] = useState(() => {
        if (typeof window !== 'undefined') {
            const widgetMonth = new URLSearchParams(window.location.search).get('widgetMonth');
            if (/^\d{4}-\d{2}$/.test(widgetMonth || '')) {
                const [year, month] = widgetMonth!.split('-').map(Number);
                return new Date(year, month - 1, 1);
            }
        }
        return new Date();
    });
    const calendarContainerRef = useRef<HTMLDivElement | null>(null);
    const calendarRef = useRef<FullCalendar | null>(null);
    const dragStartDateRef = useRef<string | null>(null);
    const isRangeDraggingRef = useRef(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hapticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestRangePointRef = useRef<{ x: number; y: number } | null>(null);
    const swipeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
    const touchSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const hasSwipeIntentRef = useRef(false);
    const hasTouchSwipeIntentRef = useRef(false);
    const shouldSuppressNextClickRef = useRef(false);

    const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
    const [comments, setComments] = useState<CommentRow[]>([]);
    const [commentInput, setCommentInput] = useState('');
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    const [editingCommentInput, setEditingCommentInput] = useState('');

    useEffect(() => {
        return () => {
            if (visibilityTooltipTimerRef.current) clearTimeout(visibilityTooltipTimerRef.current);
        };
    }, []);

    const showVisibilityTooltip = () => {
        setIsVisibilityTooltipOpen(true);
        if (visibilityTooltipTimerRef.current) clearTimeout(visibilityTooltipTimerRef.current);
        visibilityTooltipTimerRef.current = setTimeout(() => {
            setIsVisibilityTooltipOpen(false);
            visibilityTooltipTimerRef.current = null;
        }, 2000);
    };

    useEffect(() => {
        if (!currentUserQuery.isLoading && !currentUserQuery.data) {
            router.push('/login');
        }
    }, [currentUserQuery.data, currentUserQuery.isLoading, router]);

    useEffect(() => {
        const widgetMonth = new URLSearchParams(window.location.search).get('widgetMonth');
        if (!/^\d{4}-\d{2}$/.test(widgetMonth || '')) return;

        const [year, month] = widgetMonth!.split('-').map(Number);
        calendarRef.current?.getApi().gotoDate(new Date(year, month - 1, 1));
    }, []);

    useEffect(() => {
        if (!isMemberFilterOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!memberFilterRef.current?.contains(event.target as Node)) setIsMemberFilterOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isMemberFilterOpen]);

    useEffect(() => {
        let isCanceled = false;

        const loadHolidays = async () => {
            try {
                const response = await fetch('/holiday.xml', { cache: 'force-cache' });
                if (!response.ok) return;

                const xmlText = await response.text();
                if (!isCanceled) setHolidayByDate(parseHolidayXml(xmlText));
            } catch (error) {
                console.error(error);
            }
        };

        loadHolidays();

        return () => {
            isCanceled = true;
        };
    }, []);

    const sortCalendarEvents = useCallback((items: CalendarEvent[]) => {
        return [...items].sort(compareCalendarEvents);
    }, []);

    const closeForm = () => {
        setIsFormOpen(false);
        setPendingRange(null);
        setIsInviteSearchOpen(false);
        setFriendSearchKeyword('');
        setFriendSearchResults([]);
        resetForm();
    };

    const normalizeDateRange = (startDateStr: string, endDateStr: string) => {
        return startDateStr <= endDateStr
            ? { start: startDateStr, end: endDateStr }
            : { start: endDateStr, end: startDateStr };
    };

    const getDateFromPointer = (clientX: number, clientY: number): string | null => {
        const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
        const dayCell = target?.closest('[data-date]');
        return dayCell?.getAttribute('data-date') || null;
    };

    const clearRangeDrag = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (hapticTimerRef.current) {
            clearTimeout(hapticTimerRef.current);
            hapticTimerRef.current = null;
        }
        dragStartDateRef.current = null;
        latestRangePointRef.current = null;
        isRangeDraggingRef.current = false;
        calendarRef.current?.getApi().unselect();
        setDragRange(null);
    };

    const startRangeLongPressTimer = (clientX: number, clientY: number) => {
        if (pendingRange || longPressTimerRef.current || isRangeDraggingRef.current) return;

        const dateStr = getDateFromPointer(clientX, clientY);
        if (!dateStr) return;

        dragStartDateRef.current = dateStr;
        latestRangePointRef.current = { x: clientX, y: clientY };
        longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null;
            if (hasSwipeIntentRef.current || hasTouchSwipeIntentRef.current) return;
            const latestPoint = latestRangePointRef.current;
            const latestDateStr = latestPoint ? getDateFromPointer(latestPoint.x, latestPoint.y) : null;
            isRangeDraggingRef.current = true;
            setDragRange(normalizeDateRange(dateStr, latestDateStr || dateStr));
        }, RANGE_SELECT_DELAY_MS);

        hapticTimerRef.current = setTimeout(() => {
            hapticTimerRef.current = null;
            if (!isRangeDraggingRef.current || hasSwipeIntentRef.current || hasTouchSwipeIntentRef.current) return;
            try {
                navigator.vibrate?.(15);
            } catch {
                // Vibration is best-effort and unavailable on some browsers/WebViews.
            }
        }, RANGE_HAPTIC_DELAY_MS);
    };

    const finishRangeDrag = (clientX: number, clientY: number) => {
        if (!isRangeDraggingRef.current || !dragStartDateRef.current) return false;

        const endDateStr = getDateFromPointer(clientX, clientY) || dragStartDateRef.current;
        const selectedRange = normalizeDateRange(dragStartDateRef.current, endDateStr);
        clearRangeDrag();
        setPopupDate(null);
        setPendingRange(selectedRange);
        return true;
    };

    const handleCalendarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (pendingRange) return;

        if (event.pointerType !== 'mouse') {
            swipeStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
            hasSwipeIntentRef.current = false;
            return;
        }

        startRangeLongPressTimer(event.clientX, event.clientY);
    };

    const handleCalendarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        latestRangePointRef.current = { x: event.clientX, y: event.clientY };
        const swipeStart = swipeStartRef.current;
        if (swipeStart && swipeStart.pointerId === event.pointerId && !isRangeDraggingRef.current) {
            const deltaX = event.clientX - swipeStart.x;
            const deltaY = event.clientY - swipeStart.y;

            // Horizontal swipe should navigate months, not accidentally start range selection.
            if (Math.abs(deltaX) > 16 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
                hasSwipeIntentRef.current = true;
                if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                }
                if (hapticTimerRef.current) {
                    clearTimeout(hapticTimerRef.current);
                    hapticTimerRef.current = null;
                }
                event.preventDefault();
            }
        }

        if (!isRangeDraggingRef.current || !dragStartDateRef.current) return;
        event.preventDefault();

        const dateStr = getDateFromPointer(event.clientX, event.clientY);
        if (!dateStr) return;

        setDragRange(normalizeDateRange(dragStartDateRef.current, dateStr));
    };

    const suppressSyntheticClick = () => {
        shouldSuppressNextClickRef.current = true;
        window.setTimeout(() => {
            shouldSuppressNextClickRef.current = false;
        }, 350);
    };

    const navigateBySwipeDelta = (deltaX: number) => {
        suppressSyntheticClick();
        if (deltaX < 0) goToNextMonth();
        else goToPreviousMonth();
        setPopupDate(null);
        clearRangeDrag();
    };

    const handleCalendarPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        const swipeStart = swipeStartRef.current;
        swipeStartRef.current = null;

        if (swipeStart && swipeStart.pointerId === event.pointerId && hasSwipeIntentRef.current && !isRangeDraggingRef.current) {
            const deltaX = event.clientX - swipeStart.x;
            const deltaY = event.clientY - swipeStart.y;
            const isHorizontalSwipe = Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

            hasSwipeIntentRef.current = false;
            if (isHorizontalSwipe) {
                event.preventDefault();
                navigateBySwipeDelta(deltaX);
                return;
            }
        }
        hasSwipeIntentRef.current = false;

        if (!isRangeDraggingRef.current || !dragStartDateRef.current) {
            clearRangeDrag();
            return;
        }

        event.preventDefault();
        finishRangeDrag(event.clientX, event.clientY);
    };

    const handleCalendarTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0];
        if (!touch || pendingRange) return;
        touchSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        hasTouchSwipeIntentRef.current = false;
        startRangeLongPressTimer(touch.clientX, touch.clientY);
    };

    const handleCalendarTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
        const touchStart = touchSwipeStartRef.current;
        const touch = event.touches[0];
        if (!touchStart || !touch) return;
        latestRangePointRef.current = { x: touch.clientX, y: touch.clientY };

        if (isRangeDraggingRef.current && dragStartDateRef.current) {
            const dateStr = getDateFromPointer(touch.clientX, touch.clientY);
            if (dateStr) setDragRange(normalizeDateRange(dragStartDateRef.current, dateStr));
            event.preventDefault();
            return;
        }

        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
            hasTouchSwipeIntentRef.current = true;
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
            if (hapticTimerRef.current) {
                clearTimeout(hapticTimerRef.current);
                hapticTimerRef.current = null;
            }
            event.preventDefault();
        }
    };

    const handleCalendarTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
        const touchStart = touchSwipeStartRef.current;
        const touch = event.changedTouches[0];
        touchSwipeStartRef.current = null;

        if (!touch) {
            hasTouchSwipeIntentRef.current = false;
            return;
        }

        if (isRangeDraggingRef.current) {
            event.preventDefault();
            swipeStartRef.current = null;
            hasSwipeIntentRef.current = false;
            hasTouchSwipeIntentRef.current = false;
            finishRangeDrag(touch.clientX, touch.clientY);
            return;
        }

        if (!touchStart || !hasTouchSwipeIntentRef.current) {
            hasTouchSwipeIntentRef.current = false;
            return;
        }

        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        const isHorizontalSwipe = Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
        hasTouchSwipeIntentRef.current = false;

        if (!isHorizontalSwipe) return;
        event.preventDefault();
        swipeStartRef.current = null;
        hasSwipeIntentRef.current = false;
        navigateBySwipeDelta(deltaX);
    };


    // 대표 그룹의 수락 멤버 목록을 계산합니다. 그룹이 없으면 본인만 반환합니다.
    const fetchVisiblePeople = useCallback(async (): Promise<Person[]> => {
        const myProfile = profileQuery.data;

        if (!currentUserQuery.data || !myProfile) {
            return [];
        }

        setMyUserId(myProfile.id);

        if (!myProfile.main_group_id) {
            return [myProfile as Person];
        }

        const { data: groupMembers, error: groupError } = await supabase
            .from('groups')
            .select(
                `
                profile_id,
                profile:profiles!groups_profile_id_fkey (
                    id,
                    nickname
                )
            `,
            )
            .eq('id', myProfile.main_group_id)
            .eq('is_accepted', true)
            .order('profile_id', { ascending: true });

        if (groupError) {
            console.error(groupError);
            return [myProfile as Person];
        }

        const visiblePeople = ((groupMembers || []) as GroupMemberRow[])
            .map((member) => normalizeProfile(member.profile))
            .filter(Boolean) as Person[];

        return visiblePeople.length > 0 ? visiblePeople : [myProfile as Person];
    }, [currentUserQuery.data, profileQuery.data]);

    const fetchEvents = useCallback(async () => {
        if (!visibleRange) return;

        const currentUserId = currentUserQuery.data?.id;
        const currentProfileId = profileQuery.data?.id;
        const visiblePeople = await fetchVisiblePeople();
        const hasGroupChanged = previousGroupIdRef.current !== profileQuery.data?.main_group_id;
        previousGroupIdRef.current = profileQuery.data?.main_group_id;

        setPeople(visiblePeople);
        setFilterPeople(visiblePeople);
        setSelectedMemberIds((prev) => {
            const visibleIds = visiblePeople.map((person) => person.id);
            if (hasGroupChanged || filterPeople.length === 0) return new Set(visibleIds);

            const next = new Set<string>();
            visibleIds.forEach((id) => {
                if (prev.has(id)) next.add(id);
            });

            if (next.size === prev.size && Array.from(next).every((id) => prev.has(id))) return prev;
            return next;
        });
        const peopleIds = visiblePeople.map((p) => p.id);
        const inviteProfileIds = Array.from(new Set([...peopleIds, currentProfileId].filter(Boolean)));

        if (peopleIds.length === 0 || !currentUserId || !currentProfileId) {
            setEvents([]);
            setPeople([]);
            setFilterPeople([]);
            setCommentCountByEventId({});
            return;
        }

        const { data: ownedRows, error: ownedError } = await supabase
            .from('events')
            .select('*')
            .in('user_id', peopleIds)
            .lt('start_at', visibleRange.end.toISOString())
            .gte('end_at', visibleRange.start.toISOString());

        if (ownedError) {
            console.error(ownedError);
            return;
        }

        const inviteEventById = new Map<string, CalendarEvent>();
        let normalizedInviteRows: EventInvite[] = [];
        const { data: myInvitedRows, error: myInvitedError } = await supabase.rpc('get_my_invited_events', {
            p_range_start: visibleRange.start.toISOString(),
            p_range_end: visibleRange.end.toISOString(),
        });

        if (!myInvitedError) {
            normalizedInviteRows = ((myInvitedRows || []) as MyInvitedEventRpcRow[]).map((row) => {
                inviteEventById.set(String(row.id), {
                    id: String(row.id),
                    title: row.title,
                    detail: row.detail,
                    start_at: row.start_at,
                    end_at: row.end_at,
                    user_id: row.user_id,
                    is_hidden: row.is_hidden,
                    is_allday: row.is_allday,
                });

                return {
                    event_id: Number(row.id),
                    profile_id: row.invite_profile_id,
                    is_agree: row.invite_is_agree,
                };
            });
        } else {
            console.error(myInvitedError);

            const { data: inviteRows, error: inviteError } = await supabase
                .from('events_invite')
                .select('event_id, profile_id, is_agree')
                .in('profile_id', inviteProfileIds);

            if (inviteError) {
                console.error(inviteError);
                return;
            }

            const inviteEventIds = Array.from(new Set(((inviteRows || []) as EventInvite[]).map((invite) => invite.event_id)));
            const { data: inviteEventRows, error: inviteEventError } = inviteEventIds.length > 0
                ? await supabase
                    .from('events')
                    .select('*')
                    .in('id', inviteEventIds)
                    .lt('start_at', visibleRange.end.toISOString())
                    .gte('end_at', visibleRange.start.toISOString())
                : { data: [], error: null };

            if (inviteEventError) {
                console.error(inviteEventError);
                return;
            }

            ((inviteEventRows || []) as CalendarEvent[]).forEach((event) => {
                inviteEventById.set(String(event.id), event);
            });
            normalizedInviteRows = ((inviteRows || []) as EventInvite[]).filter((invite) => {
                if (!inviteEventById.has(String(invite.event_id))) return false;
                if (invite.profile_id === currentProfileId) return true;
                return invite.is_agree;
            });
        }

        const rank = (event: CalendarEvent) => getDisplayRelationRank(event);
        const merged = new Map<string, CalendarEvent>();

        ((ownedRows || []) as CalendarEvent[]).forEach((event) => {
            merged.set(String(event.id), {
                ...event,
                id: String(event.id),
                display_profile_id: event.user_id,
                display_relation: event.user_id === currentProfileId ? 'my_owner' : 'other_owner',
            });
        });

        normalizedInviteRows.forEach((invite) => {
            const event = inviteEventById.get(String(invite.event_id));
            if (!event) return;
            const isMe = invite.profile_id === currentProfileId;
            const normalized: CalendarEvent = {
                ...event,
                id: String(event.id),
                display_profile_id: invite.profile_id,
                display_relation: isMe ? (invite.is_agree ? 'my_invite_accepted' : 'my_invite_pending') : 'other_invite_accepted',
                invite_profile_id: invite.profile_id,
                invite_is_agree: invite.is_agree,
            };
            const current = merged.get(String(event.id));
            if (!current || rank(normalized) < rank(current)) merged.set(String(event.id), normalized);
        });

        const mergedEvents = Array.from(merged.values());
        const knownProfileIds = new Set(visiblePeople.map((person) => person.id));
        const missingOwnerIds = Array.from(new Set(mergedEvents.map((event) => event.user_id)))
            .filter((ownerId) => !knownProfileIds.has(ownerId));

        if (missingOwnerIds.length > 0) {
            const { data: ownerProfiles, error: ownerProfileError } = await supabase
                .from('profiles')
                .select('id, nickname')
                .in('id', missingOwnerIds);

            if (ownerProfileError) {
                console.error(ownerProfileError);
            } else {
                setPeople([...visiblePeople, ...((ownerProfiles || []) as Person[])]);
            }
        }

        const eventIds = mergedEvents.map((event) => Number(event.id)).filter(Number.isFinite);
        const nextCommentCountByEventId: Record<string, number> = {};

        if (eventIds.length > 0) {
            const { data: commentRows, error: commentCountError } = await supabase
                .from('comments')
                .select('events_id')
                .in('events_id', eventIds);

            if (commentCountError) {
                console.error(commentCountError);
            } else {
                ((commentRows || []) as Array<{ events_id: number }>).forEach((comment) => {
                    const eventId = String(comment.events_id);
                    nextCommentCountByEventId[eventId] = (nextCommentCountByEventId[eventId] || 0) + 1;
                });
            }
        }

        setCommentCountByEventId(nextCommentCountByEventId);
        setEvents(sortCalendarEvents(mergedEvents));
    }, [visibleRange, fetchVisiblePeople, currentUserQuery.data?.id, profileQuery.data?.id, profileQuery.data?.main_group_id, filterPeople.length, sortCalendarEvents]);

    // 첫 로딩 + 그룹/범위 변경 시 일정 재조회
    useEffect(() => {
        if (currentUserQuery.isLoading || profileQuery.isLoading) return;
        if (!visibleRange) return;

        let isCanceled = false;

        const load = async () => {
            setIsCalendarLoading(true);

            const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 600));
            await Promise.all([fetchEvents(), minimumLoadingTime]);

            if (!isCanceled) {
                setIsCalendarLoading(false);
            }
        };

        load();

        return () => {
            isCanceled = true;
        };
    }, [
        currentUserQuery.isLoading,
        profileQuery.isLoading,
        profileQuery.data?.main_group_id,
        visibleRange,
        fetchEvents,
    ]);

    const createHolidayEvent = (dateStr: string, holiday: HolidayInfo): CalendarEvent => ({
        id: `holiday:${dateStr}`,
        title: holiday.dateName,
        detail: null,
        start_at: `${dateStr}T00:00:00`,
        end_at: `${dateStr}T23:59:59`,
        user_id: '__holiday__',
        is_hidden: false,
        is_allday: true,
        is_holiday: true,
    });

    const getEventsForDate = (dateStr: string): CalendarEvent[] => {
        const dayStart = new Date(`${dateStr}T00:00:00`);
        const dayEnd = new Date(`${dateStr}T23:59:59`);
        const dayEvents = events.filter((event) => new Date(event.start_at) <= dayEnd && new Date(event.end_at) >= dayStart);
        const holiday = holidayByDate[dateStr];
        return (holiday ? [createHolidayEvent(dateStr, holiday), ...dayEvents] : dayEvents).sort(compareCalendarEvents);
    };

    const resetForm = () => {
        setTitle('');
        setDetail('');
        setStartTime(DEFAULT_START_TIME);
        setEndTime(DEFAULT_END_TIME);
        const today = getTodayString();
        setStartDate(today);
        setEndDate(today);
        setIsAllDay(false);
        setSelectedEventId(null);
        setIsHidden(true);
        if (profileQuery.data) {
            setAttendees([{ profile_id: profileQuery.data.id, nickname: profileQuery.data.nickname, is_agree: true, isOwner: true }]);
        } else {
            setAttendees([]);
        }
    };

    const openCreateForm = (dateStr = getTodayString(), targetEndDate = dateStr, allDay = false) => {
        setPendingRange(null);
        resetForm();
        setStartDate(dateStr);
        setEndDate(targetEndDate);

        if (allDay) {
            setStartTime('00:00');
            setEndTime('24:00');
            setIsAllDay(true);
        }

        setIsFormOpen(true);
    };

    const openCreateFormFromSelect = (info: DateSelectArg) => {
        info.view.calendar.unselect();
        setDragRange(null);
        const selectedStart = formatLocalDateString(info.start);
        const selectedEnd = formatLocalDateString(addDays(info.end, -1));
        setPopupDate(null);
        setPendingRange(normalizeDateRange(selectedStart, selectedEnd));
    };

    const openEditForm = (event: CalendarEvent) => {
        setSelectedEventId(String(event.id));
        setStartDate(formatLocalDateString(new Date(event.start_at)));
        setEndDate(formatLocalDateString(new Date(event.end_at)));
        setTitle(event.title);
        setDetail(event.detail || '');
        const allDay = event.is_allday || isAllDayEvent(event.start_at, event.end_at);
        setIsAllDay(allDay);
        if (allDay) {
            setStartTime('00:00');
            setEndTime('24:00');
        } else {
            setStartTime(dateToTimeValue(new Date(event.start_at)));
            setEndTime(dateToTimeValue(new Date(event.end_at)));
        }
        setIsHidden(event.is_hidden);
        setAttendees([{ profile_id: event.user_id, nickname: ownerNameById.get(event.user_id) || '이름 없음', is_agree: true, isOwner: true }]);
        void loadEventAttendees(String(event.id), event.user_id);
        setIsFormOpen(true);
    };

    const handleAllDayChange = (checked: boolean) => {
        if (checked) {
            prevStartTimeRef.current = startTime;
            prevEndTimeRef.current = endTime;
            setStartTime('00:00');
            setEndTime('24:00');
        } else {
            setStartTime(prevStartTimeRef.current || DEFAULT_START_TIME);
            setEndTime(prevEndTimeRef.current || DEFAULT_END_TIME);
        }
        setIsAllDay(checked);
    };

    const loadEventAttendees = async (eventId: string, ownerId: string) => {
        const ownerAttendee: EventAttendee = {
            profile_id: ownerId,
            nickname: ownerNameById.get(ownerId) || '이름 없음',
            is_agree: true,
            isOwner: true,
        };

        const { data: rpcRows, error: rpcError } = await supabase.rpc('get_event_invite_attendees', {
            p_event_id: Number(eventId),
        });

        if (!rpcError) {
            const inviteAttendees = ((rpcRows || []) as InviteAttendeeRpcRow[]).map((row) => ({
                profile_id: row.profile_id,
                nickname: row.nickname || '이름 없음',
                is_agree: row.is_agree,
                isOwner: false,
            }));

            // 참석자 목록은 events_invite.event_id 기준으로 매번 재구성합니다. 저장된 초대는 수락 여부와 무관하게 모두 노출합니다.
            setAttendees([ownerAttendee, ...inviteAttendees]);
            return;
        }

        console.error(rpcError);

        const { data, error } = await supabase
            .from('events_invite')
            .select('event_id, profile_id, is_agree')
            .eq('event_id', Number(eventId))
            .order('profile_id', { ascending: true });

        if (error) {
            console.error(error);
            setAttendees([ownerAttendee]);
            return;
        }

        const inviteRows = (data || []) as EventInvite[];
        const invitedProfileIds = Array.from(new Set(inviteRows.map((row) => row.profile_id)));
        const profileNameById = new Map<string, string | null>();

        if (invitedProfileIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, nickname')
                .in('id', invitedProfileIds);

            if (profilesError) {
                console.error(profilesError);
            } else {
                ((profiles || []) as Person[]).forEach((profile) => {
                    profileNameById.set(profile.id, profile.nickname);
                });
            }
        }

        const inviteAttendees = inviteRows.map((row) => ({
            profile_id: row.profile_id,
            nickname: profileNameById.get(row.profile_id) || '이름 없음',
            is_agree: row.is_agree,
            isOwner: false,
        }));

        setAttendees([ownerAttendee, ...inviteAttendees]);
    };

    const searchInviteFriends = async () => {
        if (!myUserId) return;
        const keyword = friendSearchKeyword.trim();
        setIsFriendSearching(true);
        const { data, error } = await supabase
            .from('friendships')
            .select(`requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey (id, nickname), addressee:profiles!friendships_addressee_id_fkey (id, nickname)`)
            .eq('status', 'accepted')
            .or(`requester_id.eq.${myUserId},addressee_id.eq.${myUserId}`);
        setIsFriendSearching(false);
        if (error) { console.error(error); await appAlert('친구 검색 실패'); return; }
        type FriendshipSearchRow = { requester_id: string; addressee_id: string; requester: Person | Person[] | null; addressee: Person | Person[] | null; };
        const friends = ((data || []) as FriendshipSearchRow[]).map((row) => normalizeProfile(row.requester_id === myUserId ? row.addressee : row.requester)).filter(Boolean) as Person[];
        setFriendSearchResults(friends.filter((friend) => !keyword || (friend.nickname || '').includes(keyword)).sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '')));
    };

    const addInviteAttendee = async (profile: Person) => {
        if (attendees.some((attendee) => attendee.profile_id === profile.id)) { await appAlert('이미 추가된 사용자에요'); return; }
        setAttendees((prev) => [...prev, { profile_id: profile.id, nickname: profile.nickname, is_agree: false, isOwner: false }]);
        setIsInviteSearchOpen(false); setFriendSearchKeyword(''); setFriendSearchResults([]);
    };

    const removeInviteAttendee = (profileId: string) => {
        setAttendees((prev) => prev.filter((attendee) => attendee.isOwner || attendee.profile_id !== profileId));
    };

    const rollbackSavedEvent = async ({
        savedEventId,
        previousEvent,
        previousInvites,
    }: {
        savedEventId: number | null;
        previousEvent: CalendarEvent | null;
        previousInvites: EventInvite[];
    }) => {
        if (!savedEventId) return;

        if (!previousEvent) {
            await supabase.from('events_invite').delete().eq('event_id', savedEventId);
            await supabase.from('events').delete().eq('id', savedEventId);
            return;
        }

        await supabase
            .from('events')
            .update({
                title: previousEvent.title,
                detail: previousEvent.detail,
                start_at: previousEvent.start_at,
                end_at: previousEvent.end_at,
                is_hidden: previousEvent.is_hidden,
                is_allday: previousEvent.is_allday,
            })
            .eq('id', savedEventId);

        await supabase.from('events_invite').delete().eq('event_id', savedEventId);
        if (previousInvites.length > 0) {
            await supabase.from('events_invite').insert(previousInvites);
        }
    };

    const saveEventWithClientRollback = async ({
        userId,
        eventPayload,
        invitePayload,
    }: {
        userId: string;
        eventPayload: {
            title: string;
            detail: string | null;
            start_at: string;
            end_at: string;
            is_hidden: boolean;
            is_allday: boolean;
        };
        invitePayload: Array<{ profile_id: string; is_agree: boolean }>;
    }) => {
        const previousEvent = selectedEventId
            ? events.find((event) => String(event.id) === selectedEventId) || null
            : null;
        let previousInvites: EventInvite[] = [];
        let savedEventId = selectedEventId ? Number(selectedEventId) : null;

        try {
            if (selectedEventId) {
                const { data: previousInviteRows, error: previousInviteError } = await supabase
                    .from('events_invite')
                    .select('event_id, profile_id, is_agree')
                    .eq('event_id', Number(selectedEventId));

                if (previousInviteError) throw previousInviteError;
                previousInvites = (previousInviteRows || []) as EventInvite[];

                const { error: updateError } = await supabase
                    .from('events')
                    .update(eventPayload)
                    .eq('id', Number(selectedEventId))
                    .eq('user_id', userId);

                if (updateError) throw updateError;

                const { error: deleteInviteError } = await supabase
                    .from('events_invite')
                    .delete()
                    .eq('event_id', Number(selectedEventId));

                if (deleteInviteError) throw deleteInviteError;
            } else {
                const { data, error } = await supabase
                    .from('events')
                    .insert({ ...eventPayload, user_id: userId })
                    .select('id')
                    .single();

                if (error) throw error;
                savedEventId = data?.id ? Number(data.id) : null;
            }

            if (!savedEventId) throw new Error('저장된 일정 ID를 확인하지 못했습니다.');

            if (invitePayload.length > 0) {
                const { error: inviteError } = await supabase.from('events_invite').insert(
                    invitePayload.map((invite) => ({ ...invite, event_id: savedEventId })),
                );

                if (inviteError) throw inviteError;
            }

            return savedEventId;
        } catch (error) {
            await rollbackSavedEvent({ savedEventId, previousEvent, previousInvites });
            throw error;
        }
    };

    const createEventInviteNotifications = async (
        eventId: number,
        invitePayload: Array<{ profile_id: string; is_agree: boolean }>,
        previousInviteProfileIds: Set<string>,
    ) => {
        const newInviteProfileIds = invitePayload
            .map((invite) => invite.profile_id)
            .filter((profileId, index, profileIds) => !previousInviteProfileIds.has(profileId) && profileIds.indexOf(profileId) === index);

        if (newInviteProfileIds.length === 0) return;

        await Promise.all(
            newInviteProfileIds.map((profileId) =>
                createNotificationWithPush({
                    profileId,
                    type: 'event_invite',
                    title: '일정 초대',
                    message: '새로운 일정이 초대가 되었어요.',
                    relatedId: eventId,
                }),
            ),
        );
    };

    const handleSaveEvent = async () => {
        if (!startDate || !endDate) return;

        const start = timeValueToDate(startDate, startTime);
        const end = timeValueToDate(endDate, endTime);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const trimmedTitle = title.trim();
        const trimmedDetail = detail.trim();

        if (trimmedTitle.length < 1) {
            await appAlert('일정 제목을 입력해주세요.');
            return;
        }

        if (trimmedTitle.length > EVENT_TITLE_MAX_LENGTH) {
            await appAlert(`일정 제목은 ${EVENT_TITLE_MAX_LENGTH}자 이하만 가능합니다.`);
            return;
        }

        if (trimmedDetail.length > EVENT_DETAIL_MAX_LENGTH) {
            await appAlert(`세부내용은 ${EVENT_DETAIL_MAX_LENGTH}자 이하만 가능합니다.`);
            return;
        }

        if (start >= end) {
            await appAlert('종료 시간은 시작 시간보다 늦어야 합니다.');
            return;
        }

        const eventPayload = {
            title: trimmedTitle,
            detail: trimmedDetail || null,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            is_hidden: isHidden,
            is_allday: isAllDay,
        };

        const invitePayload = attendees
            .filter((attendee) => !attendee.isOwner)
            .map((attendee) => ({ profile_id: attendee.profile_id, is_agree: attendee.is_agree }));

        let savedEventIdForNotifications: number | null = null;
        const previousInviteProfileIds = new Set<string>();

        try {
            if (selectedEventId) {
                const { data: previousInviteRows, error: previousInviteError } = await supabase
                    .from('events_invite')
                    .select('profile_id')
                    .eq('event_id', Number(selectedEventId));

                if (previousInviteError) throw previousInviteError;
                (previousInviteRows || []).forEach((invite) => previousInviteProfileIds.add(String(invite.profile_id)));
            }

            // DB 함수가 배포되어 있으면 events/events_invite 저장을 실제 단일 트랜잭션으로 처리합니다.
            const { data: savedEventId, error: rpcError } = await supabase.rpc('save_event_with_invites', {
                p_event_id: selectedEventId ? Number(selectedEventId) : null,
                p_title: eventPayload.title,
                p_detail: eventPayload.detail,
                p_start_at: eventPayload.start_at,
                p_end_at: eventPayload.end_at,
                p_is_hidden: eventPayload.is_hidden,
                p_is_allday: eventPayload.is_allday,
                p_invites: invitePayload,
            });

            if (rpcError) {
                const isMissingRpc = rpcError.code === 'PGRST202' || rpcError.message.includes('save_event_with_invites');

                if (isMissingRpc && invitePayload.length === 0) {
                    // 초대가 없는 일정은 RPC가 아직 배포되지 않은 환경에서도 저장할 수 있습니다.
                    savedEventIdForNotifications = await saveEventWithClientRollback({ userId: user.id, eventPayload, invitePayload });
                } else if (isMissingRpc) {
                    throw new Error('초대 저장 RPC(save_event_with_invites)가 DB에 아직 적용되지 않았습니다. supabase/save_event_with_invites.sql을 먼저 적용해야 참석자 초대 저장이 가능합니다.');
                } else {
                    throw rpcError;
                }
            } else {
                savedEventIdForNotifications = savedEventId ? Number(savedEventId) : selectedEventId ? Number(selectedEventId) : null;
            }

            if (savedEventIdForNotifications) {
                await createEventInviteNotifications(savedEventIdForNotifications, invitePayload, previousInviteProfileIds);
            }
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : '알 수 없는 오류';
            await appAlert(`일정 저장 실패. 변경사항을 롤백했습니다.\n${message}`);
            return;
        }

        setIsFormOpen(false);
        resetForm();
        setDetailEvent(null);
        fetchEvents();
    };

    const deleteEventWithClientFallback = async (eventId: string) => {
        const ownerUserId = currentUserQuery.data?.id || myUserId;
        if (!ownerUserId) throw new Error('현재 사용자 정보를 확인할 수 없습니다.');

        const { error: commentDeleteError } = await supabase
            .from('comments')
            .delete()
            .eq('events_id', Number(eventId));

        if (commentDeleteError) throw commentDeleteError;

        const { error: inviteDeleteError } = await supabase.from('events_invite').delete().eq('event_id', Number(eventId));
        if (inviteDeleteError) throw inviteDeleteError;

        const { error: eventDeleteError } = await supabase
            .from('events')
            .delete()
            .eq('id', Number(eventId))
            .eq('user_id', ownerUserId);

        if (eventDeleteError) throw eventDeleteError;
    };

    const handleDeleteEventById = async (eventId: string) => {
        if (!myUserId) return;

        const ok = await appConfirm('일정을 삭제할까요?');
        if (!ok) return;

        try {
            const { error: rpcError } = await supabase.rpc('delete_event_cascade', {
                p_event_id: Number(eventId),
            });

            if (rpcError) {
                const isMissingRpc = rpcError.code === 'PGRST202' || rpcError.message.includes('delete_event_cascade');
                if (!isMissingRpc) throw rpcError;

                // delete_event_cascade.sql이 아직 배포되지 않은 환경에서도 기존 클라이언트 삭제 경로로 동작하게 둡니다.
                await deleteEventWithClientFallback(eventId);
            }
        } catch (error) {
            console.error(error);
            await appAlert('삭제 실패');
            return;
        }

        setIsFormOpen(false);
        setDetailEvent(null);
        resetForm();
        fetchEvents();
    };

    const handleDeleteEvent = async () => {
        if (!selectedEventId) return;
        await handleDeleteEventById(selectedEventId);
    };

    const fetchComments = useCallback(async (eventId: string) => {
        const { data, error } = await supabase
            .from('comments')
            .select(
                `
                id,
                events_id,
                profile_id,
                contents,
                created_at,
                profile:profiles!comments_profile_id_fkey (
                    id,
                    nickname
                )
            `,
            )
            .eq('events_id', Number(eventId))
            .order('created_at', { ascending: true });

        if (error) {
            console.error(error);
            await appAlert('댓글을 불러오지 못했습니다.');
            return;
        }

        const normalizedComments = ((data || []) as CommentQueryRow[]).map((comment) => ({
            ...comment,
            profile: Array.isArray(comment.profile) ? comment.profile[0] || null : comment.profile,
        }));

        setComments(normalizedComments);
    }, []);

    const openDetail = async (event: CalendarEvent) => {
        if (event.is_hidden && !canSeeEventDetail(event)) return;

        setDetailEvent(event);
        setAttendees([{ profile_id: event.user_id, nickname: ownerNameById.get(event.user_id) || '이름 없음', is_agree: true, isOwner: true }]);
        setCommentInput('');
        setEditingCommentId(null);
        setEditingCommentInput('');
        await Promise.all([
            loadEventAttendees(String(event.id), event.user_id),
            fetchComments(event.id),
        ]);
    };

    const handleDateClick = (info: DateClickArg) => {
        if (shouldSuppressNextClickRef.current || pendingRange) return;
        setPopupDate(info.dateStr);
    };

    const handleEventClick = (info: EventClickArg) => {
        info.jsEvent.preventDefault();
        if (shouldSuppressNextClickRef.current || pendingRange) return;

        // 여러 날짜에 걸친 이벤트는 실제로 누른 날짜 칸의 목록을 열어야 합니다.
        const targetElement = info.jsEvent.target as HTMLElement | null;
        const dayCell = targetElement?.closest('[data-date]');
        const clickedDate = dayCell?.getAttribute('data-date');

        setPopupDate(clickedDate || formatLocalDateString(info.event.start || new Date()));
    };

    const handleListEventClick = (event: CalendarEvent) => {
        openDetail(event);
    };

    const handleEditFromDetail = () => {
        if (!detailEvent || detailEvent.user_id !== myUserId) return;
        openEditForm(detailEvent);
    };

    const refreshInviteAfterResponse = async () => {
        setDetailEvent(null);
        setPopupDate(null);
        await fetchEvents();
    };

    const handleAcceptInvite = async () => {
        if (!detailEvent || !myUserId) return;
        const ok = await appConfirm('초대를 받으시겠습니까?'); if (!ok) return;

        const { error: rpcError } = await supabase.rpc('respond_event_invite', {
            p_event_id: Number(detailEvent.id),
            p_is_agree: true,
        });

        if (rpcError) {
            console.error(rpcError);
            const { error } = await supabase
                .from('events_invite')
                .update({ is_agree: true })
                .eq('event_id', Number(detailEvent.id))
                .eq('profile_id', myUserId);
            if (error) { console.error(error); await appAlert('초대 수락 실패'); return; }
        }

        await refreshInviteAfterResponse();
    };

    const handleCancelInvite = async () => {
        if (!detailEvent || !myUserId) return;
        const ok = await appConfirm(detailEvent.invite_is_agree ? '참석을 취소하시겠습니까?' : '초대를 받지 않으시겠습니까?'); if (!ok) return;

        const { error: rpcError } = await supabase.rpc('respond_event_invite', {
            p_event_id: Number(detailEvent.id),
            p_is_agree: false,
        });

        if (rpcError) {
            console.error(rpcError);
            const { error } = await supabase
                .from('events_invite')
                .delete()
                .eq('event_id', Number(detailEvent.id))
                .eq('profile_id', myUserId);
            if (error) { console.error(error); await appAlert('초대 취소 실패'); return; }
        }

        await refreshInviteAfterResponse();
    };

    const handleCreateComment = async () => {
        if (!detailEvent) return;

        const trimmedComment = commentInput.trim();
        if (!trimmedComment) {
            await appAlert('댓글 내용을 입력해주세요.');
            return;
        }
        if (trimmedComment.length > COMMENT_MAX_LENGTH) {
            await appAlert(`댓글은 ${COMMENT_MAX_LENGTH}자 이하만 가능합니다.`);
            return;
        }

        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.from('comments').insert({
            events_id: Number(detailEvent.id),
            profile_id: user.id,
            contents: trimmedComment,
        });

        if (error) {
            console.error(error);
            await appAlert('댓글 등록 실패');
            return;
        }

        setCommentInput('');
        fetchComments(detailEvent.id);
    };

    const handleStartEditComment = (comment: CommentRow) => {
        if (comment.profile_id !== myUserId) return;
        setEditingCommentId(comment.id);
        setEditingCommentInput(comment.contents || '');
    };

    const handleCancelEditComment = () => {
        setEditingCommentId(null);
        setEditingCommentInput('');
    };

    const handleUpdateComment = async (comment: CommentRow) => {
        if (!detailEvent || comment.profile_id !== myUserId) return;

        const trimmedComment = editingCommentInput.trim();
        if (!trimmedComment) {
            await appAlert('댓글 내용을 입력해주세요.');
            return;
        }
        if (trimmedComment.length > COMMENT_MAX_LENGTH) {
            await appAlert(`댓글은 ${COMMENT_MAX_LENGTH}자 이하만 가능합니다.`);
            return;
        }

        const { error } = await supabase
            .from('comments')
            .update({
                contents: trimmedComment,
                modified_at: new Date().toISOString(),
            })
            .eq('id', comment.id)
            .eq('events_id', comment.events_id)
            .eq('profile_id', myUserId);

        if (error) {
            console.error(error);
            await appAlert('댓글 수정 실패');
            return;
        }

        handleCancelEditComment();
        fetchComments(detailEvent.id);
    };

    const handleDeleteComment = async (comment: CommentRow) => {
        if (!detailEvent || comment.profile_id !== myUserId) return;

        const ok = await appConfirm('댓글을 삭제할까요?');
        if (!ok) return;

        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', comment.id)
            .eq('events_id', comment.events_id)
            .eq('profile_id', myUserId);

        if (error) {
            console.error(error);
            await appAlert('댓글 삭제 실패');
            return;
        }

        if (editingCommentId === comment.id) {
            handleCancelEditComment();
        }
        fetchComments(detailEvent.id);
    };

    const ownerNameById = new Map(people.map((p) => [p.id, p.nickname || '이름 없음']));
    const isGroupFilterEnabled = masterFilterMode === MASTER_FILTER_GROUP;

    const handleMasterFilterToggle = () => {
        const nextMode = isGroupFilterEnabled ? MASTER_FILTER_MY_ONLY : MASTER_FILTER_GROUP;

        flushSync(() => {
            setMasterFilterMode(nextMode);
            setSelectedMemberIds(new Set(filterPeople.map((person) => person.id)));
            if (nextMode === MASTER_FILTER_MY_ONLY) setIsMemberFilterOpen(false);
        });
    };

    const goToPreviousMonth = () => {
        calendarRef.current?.getApi().prev();
    };

    const goToNextMonth = () => {
        calendarRef.current?.getApi().next();
    };

    const handleCalendarDatesSet = (arg: DatesSetArg) => {
        const currentDate = arg.view.calendar.getDate();
        setCalendarMonthDate((prev) => {
            if (prev.getFullYear() === currentDate.getFullYear() && prev.getMonth() === currentDate.getMonth()) return prev;
            return currentDate;
        });
        setVisibleRange((prev) => {
            if (
                prev &&
                prev.start.getTime() === arg.start.getTime() &&
                prev.end.getTime() === arg.end.getTime()
            ) {
                return prev;
            }
            return { start: arg.start, end: arg.end };
        });
    };

    const toggleMemberFilter = (profileId: string) => {
        setSelectedMemberIds((prev) => {
            const next = new Set(prev);
            if (next.has(profileId)) next.delete(profileId);
            else next.add(profileId);
            return next;
        });
    };

    const getFilterProfileId = (event: CalendarEvent): string => {
        return event.display_profile_id || event.user_id;
    };

    const isEventVisibleByMemberFilter = (event: CalendarEvent): boolean => {
        const filterProfileId = getFilterProfileId(event);
        if (!isGroupFilterEnabled) return filterProfileId === myUserId;
        return selectedMemberIds.has(filterProfileId);
    };

    const filteredEvents = events.filter(isEventVisibleByMemberFilter);

    const canShowPopupCommentCount = (event: CalendarEvent): boolean => {
        return isMyOwnedEvent(event) || !event.is_hidden;
    };

    const getEndTimeSlots = () => {
        return isSameDate(startDate, endDate) ? getValidEndSlots(startTime) : START_TIME_SLOTS.concat('24:00');
    };

    const holidayEvents = Object.entries(holidayByDate).map(([dateStr, holiday]) => createHolidayEvent(dateStr, holiday));
    const visibleCalendarEvents = [...holidayEvents, ...filteredEvents];

    const calendarEvents = sortCalendarEvents(visibleCalendarEvents).flatMap((event) => {
        const baseColor = getEventBaseColor(event);
        const color = event.is_hidden ? `${baseColor}${HIDDEN_EVENT_COLOR_ALPHA}` : baseColor;
        const orderStartAt = getStartMinutes(event);
        const orderOwnerRank = getOwnershipSortRank(event);

        return getDateStringsInRange(event.start_at, event.end_at).map((dateStr) => {
            const isPendingInviteEvent = isPendingMyInvite(event);

            return {
            id: `${event.id}:${dateStr}`,
            title: getEventDisplayTitle(event, ownerNameById),
            start: dateStr,
            allDay: true,
            orderPriority: getDisplayPriority(event),
            orderStartAt,
            backgroundColor: isPendingInviteEvent ? 'transparent' : color,
            borderColor: color,
            classNames: isPendingInviteEvent ? ['ourcal-pending-invite-event'] : [],
            extendedProps: {
                originalEventId: String(event.id),
                displayDate: dateStr,
                isHidden: event.is_hidden,
                userId: event.user_id,
                ownerName: getOwnerName(event, ownerNameById),
                isHoliday: Boolean(event.is_holiday),
                isOwner: isMyOwnedEvent(event),
                isMyInvite: isMyInviteEvent(event),
                isPendingInvite: isPendingMyInvite(event),
                orderPriority: getDisplayPriority(event),
                orderStartAt,
                orderOwnerRank,
                orderTitle: event.title,
            },
        };
        });
    });

    useEffect(() => {
        const bridge = (window as unknown as { OurcalWidgetBridge?: { postMessage: (message: string) => void } }).OurcalWidgetBridge;
        if (!bridge) return;

        const year = calendarMonthDate.getFullYear();
        const month = calendarMonthDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const start = addDays(firstDay, -firstDay.getDay());
        const visibleDates = Array.from({ length: 35 }, (_, index) => formatLocalDateString(addDays(start, index)));
        const eventsByDate = new Map<string, typeof calendarEvents>();

        calendarEvents.forEach((event) => {
            const date = String(event.start || '');
            if (!visibleDates.includes(date)) return;
            eventsByDate.set(date, [...(eventsByDate.get(date) || []), event]);
        });

        const days = visibleDates.map((date) => ({
            date,
            events: (eventsByDate.get(date) || []).slice(0, 6).map((event) => ({
                title: String((!Boolean(event.extendedProps.isHoliday) && !Boolean(event.extendedProps.isOwner) && !Boolean(event.extendedProps.isMyInvite) && String(event.extendedProps.ownerName || '').length > 0) ? event.extendedProps.ownerName : event.title || '일정'),
                color: String(event.backgroundColor === 'transparent' ? event.borderColor : event.backgroundColor),
                isHoliday: Boolean(event.extendedProps.isHoliday),
                isPendingInvite: Boolean(event.extendedProps.isPendingInvite),
                isHidden: Boolean(event.extendedProps.isHidden),
                isMine: Boolean(event.extendedProps.isOwner) || Boolean(event.extendedProps.isMyInvite),
                isPrivateLocked: Boolean(event.extendedProps.isHidden) && !Boolean(event.extendedProps.isOwner) && !Boolean(event.extendedProps.isMyInvite),
            })),
        }));

        bridge.postMessage(JSON.stringify({
            version: 1,
            monthDate: formatLocalDateString(firstDay),
            generatedAt: new Date().toISOString(),
            days,
        }));
    }, [calendarEvents, calendarMonthDate]);

    const popupEvents = popupDate ? getEventsForDate(popupDate).filter((event) => event.is_holiday || isEventVisibleByMemberFilter(event)) : [];

    const isDateInPendingRange = (dateStr: string) => {
        return Boolean(pendingRange && dateStr >= pendingRange.start && dateStr <= pendingRange.end);
    };

    const formatPendingRangeLabel = (range: { start: string; end: string }) => {
        const [startYear, startMonth, startDay] = range.start.split('-').map(Number);
        const [endYear, endMonth, endDay] = range.end.split('-').map(Number);

        if (range.start === range.end) return `${startMonth}월 ${startDay}일`;
        if (startYear === endYear && startMonth === endMonth) return `${startMonth}월 ${startDay}일 – ${endDay}일`;
        return `${startMonth}/${startDay} – ${endMonth}/${endDay}`;
    };

    const getPendingRangeDayCount = (range: { start: string; end: string }) => {
        const start = new Date(`${range.start}T00:00:00`);
        const end = new Date(`${range.end}T00:00:00`);
        return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    };

    return (
        <div
            className="mx-auto flex max-w-md flex-col bg-[var(--oc-surface)] text-[var(--oc-text)]"
            style={{ height: 'calc(100dvh - var(--oc-content-top-padding) - var(--oc-nav-height) + 1px)' }}
        >
            <div className="mb-2 flex shrink-0 flex-col gap-2 px-3 pb-1">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-full text-lg text-[var(--oc-text-secondary)] transition hover:bg-[var(--oc-surface-2)]"
                            aria-label="이전 월"
                            onClick={goToPreviousMonth}
                        >
                            <Icon name="chevL" size={18} color="currentColor" />
                        </button>
                        <span className="min-w-[5.6rem] text-center text-lg font-bold tracking-[-0.02em] text-[var(--oc-text)]">
                            {formatMonthNavLabel(calendarMonthDate)}
                        </span>
                        <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-full text-lg text-[var(--oc-text-secondary)] transition hover:bg-[var(--oc-surface-2)]"
                            aria-label="다음 월"
                            onClick={goToNextMonth}
                        >
                            <Icon name="chevR" size={18} color="currentColor" />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={isGroupFilterEnabled}
                            className="relative flex rounded-full border border-[var(--oc-divider)] bg-[var(--oc-surface-2)] p-0.5 text-xs font-semibold shadow-sm"
                            aria-label="일정 표시 범위 전환"
                            onClick={handleMasterFilterToggle}
                        >
                            <span className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition ${!isGroupFilterEnabled ? 'bg-[var(--oc-primary)] text-white shadow' : 'text-[var(--oc-text-secondary)]'}`}>
                                <Icon name="user" size={14} color="currentColor" />
                                나
                            </span>
                            <span className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition ${isGroupFilterEnabled ? 'bg-[var(--oc-primary)] text-white shadow' : 'text-[var(--oc-text-secondary)]'}`}>
                                <Icon name="users" size={14} color="currentColor" />
                                그룹
                            </span>
                        </button>
                        <NotificationButton className="relative grid h-8 w-8 place-items-center rounded-full bg-[var(--oc-surface-2)] text-base ring-1 ring-[var(--oc-divider)]" />
                    </div>
                </div>
                <div className="flex items-start justify-end gap-0">
                    <GroupSelector
                        onChange={() => {
                            setIsCalendarLoading(true);
                            setPopupDate(null);
                            setDetailEvent(null);
                            setIsFormOpen(false);
                            setMasterFilterMode(MASTER_FILTER_GROUP);
                            setFilterPeople([]);
                            setSelectedMemberIds(new Set());
                            setIsMemberFilterOpen(false);
                        }}
                    />
                    <div ref={memberFilterRef} className="relative pl-3">
                        <button
                            className="h-9 rounded-xl border border-[var(--oc-divider-strong)] bg-white px-3 text-xs font-semibold text-[var(--oc-text)] shadow-sm disabled:bg-[var(--oc-surface-2)] disabled:text-[var(--oc-text-tertiary)]"
                            disabled={!isGroupFilterEnabled}
                            onClick={() => setIsMemberFilterOpen((prev) => !prev)}
                        >
                            멤버 {selectedMemberIds.size}/{filterPeople.length}
                        </button>
                        {isMemberFilterOpen && (
                            <div className="absolute right-0 z-30 mt-2 w-52 rounded-2xl border border-[var(--oc-divider)] bg-white p-2 shadow-[var(--oc-elevation)]">
                                {filterPeople.length === 0 ? (
                                    <p className="px-2 py-1 text-xs text-gray-500">멤버가 없습니다.</p>
                                ) : (
                                    filterPeople.map((person) => {
                                        const checked = selectedMemberIds.has(person.id);

                                        return (
                                            <label key={person.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm hover:bg-[var(--oc-surface-2)]">
                                                <span className="truncate">{person.id === myUserId ? '나' : person.nickname || '이름 없음'}</span>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={checked}
                                                    disabled={!isGroupFilterEnabled}
                                                    className={`h-5 w-9 rounded-full p-0.5 transition ${
                                                        checked ? 'bg-[var(--oc-primary)]' : 'bg-[var(--oc-divider-strong)]'
                                                    } disabled:opacity-40`}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        toggleMemberFilter(person.id);
                                                    }}
                                                >
                                                    <span className={`block h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
                                                </button>
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div
                ref={calendarContainerRef}
                className="relative -mx-0 min-h-0 flex-1 overflow-hidden bg-white"
                onPointerDown={handleCalendarPointerDown}
                onPointerMove={handleCalendarPointerMove}
                onPointerUp={handleCalendarPointerUp}
                onTouchStartCapture={handleCalendarTouchStart}
                onTouchMoveCapture={handleCalendarTouchMove}
                onTouchEndCapture={handleCalendarTouchEnd}
                onTouchCancelCapture={() => {
                    touchSwipeStartRef.current = null;
                    hasTouchSwipeIntentRef.current = false;
                }}
                style={{ touchAction: 'none', userSelect: 'none' }}
                onPointerCancel={() => {
                    swipeStartRef.current = null;
                    touchSwipeStartRef.current = null;
                    hasSwipeIntentRef.current = false;
                    hasTouchSwipeIntentRef.current = false;
                    clearRangeDrag();
                }}
                onPointerLeave={(event) => {
                    if (!isRangeDraggingRef.current) {
                        swipeStartRef.current = null;
                        hasSwipeIntentRef.current = false;
                        clearRangeDrag();
                    } else handleCalendarPointerMove(event);
                }}
            >
                {currentUserQuery.isLoading || profileQuery.isLoading ? (
                    <CalendarLoading />
                ) : (
                    <>
                        <FullCalendar
                            ref={calendarRef}
                            key={profileQuery.data?.main_group_id || 'personal'}
                            plugins={[dayGridPlugin, interactionPlugin]}
                            initialView="dayGridMonth"
                            initialDate={calendarMonthDate}
                            headerToolbar={false}
                            height="100%"
                            expandRows={true}
                            fixedWeekCount={true}
                            events={calendarEvents}
                            dateClick={handleDateClick}
                            eventClick={handleEventClick}
                            selectable={true}
                            selectMirror={true}
                            unselectAuto={true}
                            longPressDelay={RANGE_SELECT_DELAY_MS}
                            selectLongPressDelay={RANGE_SELECT_DELAY_MS}
                            eventLongPressDelay={RANGE_SELECT_DELAY_MS}
                            select={openCreateFormFromSelect}
                            dayMaxEvents={4}
                            dayCellClassNames={(arg) => {
                                const dateStr = formatLocalDateString(arg.date);
                                const classNames: string[] = [];

                                if (arg.date.getDay() === 0 || arg.date.getDay() === 6) classNames.push('ourcal-weekend');
                                if (holidayByDate[dateStr]) classNames.push('ourcal-holiday');
                                if ((dragRange && dateStr >= dragRange.start && dateStr <= dragRange.end) || isDateInPendingRange(dateStr)) {
                                    classNames.push('ourcal-range-selected');
                                }

                                return classNames;
                            }}
                            dayCellContent={(arg) => {
                                const dateStr = formatLocalDateString(arg.date);
                                const isRedDay = Boolean(holidayByDate[dateStr]) || arg.date.getDay() === 0 || arg.date.getDay() === 6;

                                return (
                                    <div className="ourcal-day-cell-content">
                                        <span className={isRedDay ? 'ourcal-red-day-number' : undefined}>{arg.date.getDate()}</span>
                                    </div>
                                );
                            }}
                            moreLinkContent={(args) => `+${args.num}`}
                            moreLinkClick={(arg) => {
                                setPopupDate(formatLocalDateString(arg.date));
                                return 'none';
                            }}
                            datesSet={handleCalendarDatesSet}
                            dayHeaderContent={(arg) => ['일', '월', '화', '수', '목', '금', '토'][arg.date.getDay()]}
                            displayEventTime={false}
                            eventDisplay="block"
                            eventOrderStrict={true}
                            eventOrder="orderPriority,orderStartAt,orderOwnerRank,orderTitle"
                            eventContent={(arg) => {
                                const isOwner = Boolean(arg.event.extendedProps.isOwner);
                                const isPendingInvite = Boolean(arg.event.extendedProps.isPendingInvite);
                                const ownerName = String(arg.event.extendedProps.ownerName || '');
                                const isMyInvite = Boolean(arg.event.extendedProps.isMyInvite);
                                const shouldShowOwnerName = !isOwner && !isMyInvite && ownerName.length > 0;
                                const displayTitle = shouldShowOwnerName ? ownerName : arg.event.title;

                                return (
                                    <div className="flex min-w-0 items-center text-[10px] font-semibold leading-none">
                                        <span className="min-w-0 flex-1 truncate">
                                            {displayTitle}
                                        </span>
                                        {isPendingInvite && <span className="ourcal-pending-invite-dot" aria-hidden="true" />}
                                    </div>
                                );
                            }}
                        />

                        {isCalendarLoading && (
                            <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm">
                                <CalendarLoading />
                            </div>
                        )}
                    </>
                )}
            </div>

            {pendingRange && (
                <div className="fixed right-3 left-3 z-30 flex items-center gap-3 rounded-2xl border border-[var(--oc-divider)] bg-white py-2.5 pr-2.5 pl-4 shadow-[var(--oc-elevation)]"
                    style={{ bottom: 'calc(var(--oc-nav-height) + 1rem)' }}>
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#FFF3B0] text-[#7A5B00]">
                        <Icon name="calendar" size={18} color="currentColor" />
                    </div>
                    <div className="min-w-0 flex-1 tracking-[-0.02em]">
                        <p className="truncate text-[13px] font-bold text-[var(--oc-text)]">{formatPendingRangeLabel(pendingRange)}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-[var(--oc-text-secondary)]">
                            {getPendingRangeDayCount(pendingRange)}일 선택됨 · 일정을 추가할까요?
                        </p>
                    </div>
                    <button
                        type="button"
                        className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[var(--oc-surface-2)] text-[var(--oc-text-secondary)]"
                        aria-label="범위 선택 취소"
                        onClick={() => setPendingRange(null)}
                    >
                        <span className="text-lg leading-none">×</span>
                    </button>
                    <button
                        type="button"
                        className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-[var(--oc-primary)] px-4 text-[13px] font-semibold tracking-[-0.01em] text-white shadow-[0_4px_16px_rgba(30,58,138,0.33)]"
                        onClick={() => openCreateForm(pendingRange.start, pendingRange.end, true)}
                    >
                        <Icon name="plus" size={16} color="currentColor" />
                        <span>일정 추가</span>
                    </button>
                </div>
            )}

            {popupDate && (
                <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(11,15,31,0.42)] p-0 pb-[var(--oc-nav-height)] sm:items-center sm:p-4" onClick={() => setPopupDate(null)}>
                    <div className="flex max-h-[58vh] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] bg-white" onClick={(e) => e.stopPropagation()}>
                        <div className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-full bg-[var(--oc-divider-strong)]" />
                        <div className="flex shrink-0 items-center justify-between border-b border-[var(--oc-divider)] p-4">
                            <h2 className="text-lg font-bold">{formatPopupDate(popupDate)}</h2>
                            <button
                                className="rounded-xl bg-[var(--oc-surface-2)] px-3 py-1.5 text-sm font-semibold text-[var(--oc-text-secondary)]"
                                onClick={() => setPopupDate(null)}
                            >
                                닫기
                            </button>
                        </div>

                        <div className="min-h-0 max-h-[calc(58vh-7.5rem)] overflow-y-auto">
                            {popupEvents.length === 0 ? (
                                <div className="px-5 py-9 text-center tracking-[-0.01em]">
                                    <p className="text-sm font-semibold text-[var(--oc-text-secondary)]">일정이 없습니다.</p>
                                    <p className="mt-1 text-[11px] text-[var(--oc-text-tertiary)]">이 날을 우리만의 시간으로 채워볼까요?</p>
                                    <button
                                        className="mx-auto mt-5 flex h-[50px] min-w-40 items-center justify-center gap-1.5 rounded-xl bg-[var(--oc-primary)] px-5 text-[14.5px] font-semibold tracking-[-0.01em] text-white shadow-[0_4px_18px_rgba(30,58,138,0.2)]"
                                        onClick={() => openCreateForm(popupDate)}
                                    >
                                        <Icon name="plus" size={18} color="currentColor" />
                                        <span>일정 추가</span>
                                    </button>
                                </div>
                            ) : (
                                <ul>
                                    {popupEvents.map((event) => {
                                        const isOwner = isMyOwnedEvent(event);
                                        const isHoliday = Boolean(event.is_holiday);
                                        const isPendingInvite = isPendingMyInvite(event);
                                        const isHiddenFromMe = event.is_hidden && !canSeeEventDetail(event);
                                        const color = getEventBaseColor(event);
                                        const ownerName = getOwnerName(event, ownerNameById);
                                        const displayTitle = getEventDisplayTitle(event, ownerNameById);
                                        const commentCount = commentCountByEventId[String(event.id)] || 0;

                                        return (
                                            <li key={event.id}>
                                                <div className="flex items-center gap-3 border-b border-[var(--oc-divider)] bg-white px-5 py-4">
                                                    <button
                                                        className={`flex min-w-0 flex-1 items-center gap-3 text-left ${
                                                            isHiddenFromMe || isHoliday ? 'cursor-default' : ''
                                                        }`}
                                                        onClick={() => {
                                                            if (isHiddenFromMe || isHoliday) return;
                                                            handleListEventClick(event);
                                                        }}
                                                    >
                                                        <span
                                                            className="h-2 w-2 shrink-0 rounded-full"
                                                            style={{ backgroundColor: color }}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="flex min-w-0 items-center text-sm font-semibold">
                                                                <span className="min-w-0 truncate">{displayTitle}</span>
                                                                {isPendingInvite && <span className="ourcal-pending-invite-dot" aria-hidden="true" />}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                {isHoliday ? '공휴일 · 하루 종일' : `${formatEventTimeLabel(event)}${!isOwner && ownerName && !isHiddenFromMe ? ` · ${ownerName}` : ''}`}
                                                            </p>
                                                        </div>
                                                    </button>
                                                    {!isHoliday && canShowPopupCommentCount(event) && commentCount > 0 && (
                                                        <span className="shrink-0 text-xs font-semibold text-gray-500" aria-label={`댓글 ${commentCount}개`}>
                                                            📝{commentCount}
                                                        </span>
                                                    )}
                                                    <span className="shrink-0 text-xs font-semibold text-[var(--oc-text-secondary)]">
                                                        {formatEventTimeLabel(event)}
                                                    </span>
                                                    {isOwner && (
                                                        <button
                                                            className="shrink-0 rounded bg-red-500 px-3 py-1 text-xs font-semibold text-white"
                                                            onClick={() => handleDeleteEventById(event.id)}
                                                        >
                                                            삭제
                                                        </button>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {popupEvents.length > 0 && (
                            <div className="shrink-0 bg-white px-4 pb-2 pt-3">
                                <button
                                    className="flex h-[50px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--oc-primary)] px-4 text-[14.5px] font-semibold tracking-[-0.01em] text-white shadow-[0_4px_18px_rgba(30,58,138,0.2)]"
                                    onClick={() => openCreateForm(popupDate)}
                                >
                                    <Icon name="plus" size={18} color="currentColor" />
                                    <span>일정 추가</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {detailEvent && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(11,15,31,0.42)] p-0 sm:items-center sm:p-4" onClick={() => setDetailEvent(null)}>
                    <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[var(--oc-elevation)] sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
                        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[var(--oc-divider-strong)]" />
                        <div className="border-b border-[var(--oc-divider)] px-5 pb-4 pt-3">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--oc-primary)]">Schedule detail</p>
                                    <h2 className="truncate text-xl font-extrabold tracking-[-0.03em] text-[var(--oc-text)]">{detailEvent.title}</h2>
                                </div>
                                <button
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--oc-surface-2)] text-[var(--oc-text-secondary)]"
                                    aria-label="닫기"
                                    onClick={() => {
                                        setDetailEvent(null);
                                        handleCancelEditComment();
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {detailEvent.user_id === myUserId && (
                                    <button className="rounded-xl bg-[var(--oc-text)] px-3 py-2 text-xs font-semibold text-white" onClick={handleEditFromDetail}>수정</button>
                                )}
                                {detailEvent.invite_profile_id === myUserId && !detailEvent.invite_is_agree && (
                                    <>
                                        <button className="rounded-xl bg-[var(--oc-primary)] px-3 py-2 text-xs font-semibold text-white" onClick={handleAcceptInvite}>참석하기</button>
                                        <button className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white" onClick={handleCancelInvite}>참석거절</button>
                                    </>
                                )}
                                {detailEvent.invite_profile_id === myUserId && detailEvent.invite_is_agree && (
                                    <button className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white" onClick={handleCancelInvite}>참석취소</button>
                                )}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-5">
                            <div className="mb-4 rounded-2xl border border-[var(--oc-divider)] bg-[var(--oc-surface-2)] p-4">
                                <p className="mb-1 text-xs font-bold text-[var(--oc-text-tertiary)]">시간</p>
                                <p className="text-sm font-semibold text-[var(--oc-text)]">
                                    {detailEvent.is_allday
                                        ? `하루 종일 · ${formatDateTimeText(detailEvent.start_at)} - ${formatDateTimeText(detailEvent.end_at)}`
                                        : `${formatDateTimeText(detailEvent.start_at)} - ${formatDateTimeText(detailEvent.end_at)}`}
                                </p>
                            </div>

                            <div className="mb-4 rounded-2xl border border-[var(--oc-divider)] bg-white p-4">
                                <p className="mb-2 text-xs font-bold text-[var(--oc-text-tertiary)]">세부내용</p>
                                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--oc-text-secondary)]">{detailEvent.detail || '세부내용이 없습니다.'}</p>
                            </div>

                            <div className="mb-4 rounded-2xl border border-[var(--oc-divider)] bg-white p-4">
                                <p className="mb-3 text-sm font-extrabold tracking-[-0.02em] text-[var(--oc-text)]">참석자 명단</p>
                                <div className="max-h-[16vh] space-y-2 overflow-y-auto pr-1">
                                    {attendees.map((attendee) => {
                                        const statusText = attendee.isOwner ? '소유자' : attendee.is_agree ? '참석예정' : '초대중';

                                        return (
                                            <div key={attendee.profile_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-[var(--oc-surface-2)] px-3 py-2 text-xs">
                                                <p className="truncate font-bold text-[var(--oc-text)]">{attendee.nickname || '이름 없음'}</p>
                                                <p className="shrink-0 font-semibold text-[var(--oc-text-secondary)]">{statusText}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mb-5 rounded-2xl border border-[var(--oc-divider)] bg-white p-3">
                                <div className="flex gap-2">
                                    <input
                                        className="min-w-0 flex-1 rounded-xl border border-[var(--oc-divider-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--oc-primary)]"
                                        placeholder="댓글을 입력하세요"
                                        value={commentInput}
                                        maxLength={COMMENT_MAX_LENGTH}
                                        onChange={(e) => setCommentInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreateComment();
                                        }}
                                    />
                                    <button className="rounded-xl bg-[var(--oc-text)] px-4 py-2 text-sm font-semibold text-white" onClick={handleCreateComment}>등록</button>
                                </div>
                                <div className="mt-1 text-right text-xs text-gray-500">{commentInput.trim().length} / {COMMENT_MAX_LENGTH}</div>
                            </div>

                            <div className="max-h-[22vh] space-y-3 overflow-y-auto pr-1">
                                {comments.length === 0 && <p className="rounded-2xl bg-[var(--oc-surface-2)] p-4 text-center text-sm text-[var(--oc-text-secondary)]">아직 댓글이 없습니다.</p>}

                                {comments.map((comment) => {
                                    const isMyComment = comment.profile_id === myUserId;
                                    const isEditing = editingCommentId === comment.id;

                                    return (
                                        <div key={comment.id} className="rounded-2xl border border-[var(--oc-divider)] bg-white p-3">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-bold text-[var(--oc-text)]">{comment.profile?.nickname || '이름 없음'}</p>
                                                    <p className="text-xs text-[var(--oc-text-tertiary)]">{formatDateTimeText(comment.created_at)}</p>
                                                </div>

                                                {isMyComment && !isEditing && (
                                                    <div className="flex gap-2 text-xs font-semibold">
                                                        <button className="text-[var(--oc-text-secondary)]" onClick={() => handleStartEditComment(comment)}>수정</button>
                                                        <button className="text-red-500" onClick={() => handleDeleteComment(comment)}>삭제</button>
                                                    </div>
                                                )}
                                            </div>

                                            {isEditing ? (
                                                <div className="mt-2">
                                                    <textarea
                                                        className="min-h-20 w-full resize-y rounded-xl border border-[var(--oc-divider-strong)] p-2 text-sm outline-none focus:border-[var(--oc-primary)]"
                                                        value={editingCommentInput}
                                                        maxLength={COMMENT_MAX_LENGTH}
                                                        onChange={(e) => setEditingCommentInput(e.target.value)}
                                                    />
                                                    <div className="mt-1 text-right text-xs text-gray-500">{editingCommentInput.trim().length} / {COMMENT_MAX_LENGTH}</div>
                                                    <div className="mt-2 flex justify-end gap-2">
                                                        <button className="rounded-xl bg-[var(--oc-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--oc-text-secondary)]" onClick={handleCancelEditComment}>취소</button>
                                                        <button className="rounded-xl bg-[var(--oc-text)] px-3 py-1.5 text-xs font-semibold text-white" onClick={() => handleUpdateComment(comment)}>저장</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--oc-text-secondary)]">{comment.contents}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <button
                className="fixed right-5 bottom-[calc(var(--oc-nav-height)+2vh)] z-30 flex h-[3.15rem] w-[3.15rem] items-center justify-center rounded-full bg-[var(--oc-primary)] text-[1.7rem] font-bold text-white shadow-xl shadow-blue-900/25 transition hover:bg-[var(--oc-primary-strong)]"
                aria-label="일정 추가"
                onClick={() => openCreateForm()}
            >
                +
            </button>

            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(11,15,31,0.42)] p-0 sm:items-center sm:p-4" onClick={closeForm}>
                    <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[var(--oc-elevation)] sm:rounded-[24px]" onClick={(e) => e.stopPropagation()}>
                        <div className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-full bg-[var(--oc-divider-strong)]" />
                        <div className="border-b border-[var(--oc-divider)] px-5 pb-4 pt-3">
                            <h2 className="text-xl font-extrabold tracking-[-0.03em]">{selectedEventId ? '일정 수정' : '일정 추가'}</h2>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                            <div className="space-y-3">
                                <div>
                                    <p className="mb-1.5 text-sm font-bold text-[var(--oc-text-secondary)]">일정 제목</p>
                                    <input
                                        className="w-full rounded-xl border border-[var(--oc-divider-strong)] p-3 outline-none focus:border-[var(--oc-primary)]"
                                        value={title}
                                        maxLength={EVENT_TITLE_MAX_LENGTH}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                    <div className={`mt-1 text-right text-xs ${title.trim().length >= 45 ? 'text-red-500' : 'text-gray-500'}`}>
                                        {title.trim().length} / {EVENT_TITLE_MAX_LENGTH}
                                    </div>
                                </div>

                                <div>
                                    <p className="mb-1.5 text-sm font-bold text-[var(--oc-text-secondary)]">세부일정</p>
                                    <input
                                        className="w-full rounded-xl border border-[var(--oc-divider-strong)] p-3 outline-none focus:border-[var(--oc-primary)]"
                                        value={detail}
                                        maxLength={EVENT_DETAIL_MAX_LENGTH}
                                        onChange={(e) => setDetail(e.target.value)}
                                    />
                                    <div className={`mt-1 text-right text-xs ${detail.trim().length >= 450 ? 'text-red-500' : 'text-gray-500'}`}>
                                        {detail.trim().length} / {EVENT_DETAIL_MAX_LENGTH}
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-h-0 flex-col rounded-2xl border border-[var(--oc-divider)] bg-[var(--oc-surface-2)] p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">참석자</p>
                                    <button className="rounded-xl bg-[var(--oc-text)] px-3 py-1.5 text-xs font-semibold text-white" onClick={() => setIsInviteSearchOpen(true)}>초대</button>
                                </div>
                                <div className="h-[15vh] min-h-0 space-y-2 overflow-y-auto pr-1">
                                    {attendees.map((attendee) => {
                                        const statusText = attendee.isOwner ? '소유자' : attendee.is_agree ? '참석예정' : '초대중';
                                        const canCancelInvite = !attendee.isOwner && (!selectedEventId || detailEvent?.user_id === myUserId);

                                        return (
                                            <div key={attendee.profile_id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl border border-[var(--oc-divider)] bg-white p-2 text-xs">
                                                <p className="truncate font-semibold">{attendee.nickname || '이름 없음'}</p>
                                                <p className="shrink-0 text-gray-500">{statusText}</p>
                                                {canCancelInvite && (
                                                    <button className="shrink-0 text-red-500" onClick={() => removeInviteAttendee(attendee.profile_id)}>초대취소</button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <label className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-[var(--oc-text-secondary)]">
                            <input className="accent-[var(--oc-primary)]" type="checkbox" checked={isAllDay} onChange={(e) => handleAllDayChange(e.target.checked)} />
                            하루 종일
                        </label>

                        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-end">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <p className="mb-1.5 text-sm font-bold text-[var(--oc-text-secondary)]">시작 날짜</p>
                                    <input type="date" className="w-full rounded-xl border border-[var(--oc-divider-strong)] p-2.5 text-sm outline-none focus:border-[var(--oc-primary)]" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                                </div>
                                <div>
                                    <p className="mb-1.5 text-sm font-bold text-[var(--oc-text-secondary)]">시작 시간</p>
                                    <TimeSelect
                                        value={startTime}
                                        slots={START_TIME_SLOTS}
                                        onChange={(val) => {
                                            setStartTime(val);
                                            const validEnds = isSameDate(startDate, endDate) ? getValidEndSlots(val) : START_TIME_SLOTS.concat('24:00');
                                            if (!validEnds.includes(endTime)) setEndTime(validEnds[0] ?? '');
                                        }}
                                        disabled={isAllDay}
                                    />
                                </div>
                            </div>

                            <div className="hidden pb-3 text-sm text-gray-400 md:block">-</div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <p className="mb-1.5 text-sm font-bold text-[var(--oc-text-secondary)]">종료 날짜</p>
                                    <input type="date" className="w-full rounded-xl border border-[var(--oc-divider-strong)] p-2.5 text-sm outline-none focus:border-[var(--oc-primary)]" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                                </div>
                                <div>
                                    <p className="mb-1.5 text-sm font-bold text-[var(--oc-text-secondary)]">종료 시간</p>
                                    <TimeSelect
                                        value={endTime}
                                        slots={getEndTimeSlots()}
                                        onChange={setEndTime}
                                        startTime={startTime}
                                        disabled={isAllDay}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mb-5 rounded-2xl border border-[var(--oc-divider)] bg-[var(--oc-surface-2)] p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div className="relative min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-semibold text-[var(--oc-text)]">공개 설정</p>
                                        <button
                                            type="button"
                                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--oc-divider-strong)] text-[10px] font-bold text-[var(--oc-text-secondary)]"
                                            aria-label="공개 설정 안내"
                                            onClick={showVisibilityTooltip}
                                        >
                                            ?
                                        </button>
                                    </div>
                                    {isVisibilityTooltipOpen && (
                                        <div className="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl bg-[var(--oc-text)] px-3 py-2 text-xs leading-relaxed text-white shadow-[var(--oc-elevation)]">
                                            일정은 다른 멤버의 캘린더에도 함께 표시됩니다. 공개는 제목과 세부 내용을 함께 볼 수 있고, 비공개는 일정 있음으로만 보여요.
                                        </div>
                                    )}
                                </div>
                                <div className="relative grid shrink-0 grid-cols-2 rounded-full border border-[var(--oc-divider)] bg-white p-0.5 text-xs font-bold">
                                    <span className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full transition ${!isHidden ? 'left-0.5 bg-[var(--oc-primary)] shadow-sm' : 'left-[50%] bg-[var(--oc-surface-2)]'}`} />
                                    <button
                                        type="button"
                                        className={`relative z-10 rounded-full px-3 py-1.5 transition ${!isHidden ? 'text-white' : 'text-[var(--oc-text-secondary)]'}`}
                                        onClick={() => setIsHidden(false)}
                                    >
                                        공개
                                    </button>
                                    <button
                                        type="button"
                                        className={`relative z-10 rounded-full px-3 py-1.5 transition ${isHidden ? 'text-[var(--oc-text)]' : 'text-[var(--oc-text-secondary)]'}`}
                                        onClick={() => setIsHidden(true)}
                                    >
                                        비공개
                                    </button>
                                </div>
                            </div>
                            <p className="mt-2 text-[11.5px] leading-5 tracking-[-0.01em] text-[var(--oc-text-secondary)]">
                                {!isHidden ? '멤버 모두 제목과 세부 일정을 볼 수 있어요.' : '멤버는 ‘일정 있음’으로만 볼 수 있고, 상세는 나만 볼 수 있어요.'}
                            </p>
                        </div>

                        </div>
                        <div className="flex shrink-0 items-center justify-between border-t border-[var(--oc-divider)] bg-white px-5 py-3">
                            <div>
                                {selectedEventId && detailEvent?.user_id === myUserId && (
                                    <button className="rounded-xl bg-red-500 px-4 py-2 font-bold text-white" onClick={handleDeleteEvent}>삭제</button>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button className="rounded-xl bg-[var(--oc-surface-2)] px-5 py-2.5 font-semibold text-[var(--oc-text-secondary)]" onClick={closeForm}>취소</button>
                                <button className="rounded-xl bg-[var(--oc-primary)] px-6 py-2.5 font-bold text-white shadow-lg shadow-blue-900/20" onClick={handleSaveEvent}>{selectedEventId ? '수정' : '저장'}</button>
                            </div>
                        </div>

                        {isInviteSearchOpen && (
                            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(11,15,31,0.42)] p-0 sm:items-center sm:p-4" onClick={() => setIsInviteSearchOpen(false)}>
                                <div className="flex h-[58vh] w-full max-w-md flex-col rounded-t-[24px] bg-white p-5 shadow-[var(--oc-elevation)] sm:rounded-[24px]" onClick={(e) => e.stopPropagation()}>
                                    <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--oc-divider-strong)]" />
                                    <div className="mb-4 flex items-center justify-between">
                                        <h3 className="text-lg font-bold">친구 찾기</h3>
                                        <button className="rounded-xl bg-[var(--oc-surface-2)] px-3 py-1.5 text-sm font-semibold text-[var(--oc-text-secondary)]" onClick={() => setIsInviteSearchOpen(false)}>닫기</button>
                                    </div>
                                    <div className="mb-3 flex gap-2">
                                        <input
                                            className="min-w-0 flex-1 rounded-xl border border-[var(--oc-divider-strong)] p-3 text-sm outline-none focus:border-[var(--oc-primary)]"
                                            placeholder="닉네임 검색"
                                            value={friendSearchKeyword}
                                            onChange={(e) => setFriendSearchKeyword(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') searchInviteFriends(); }}
                                        />
                                        <button className="rounded-xl bg-[var(--oc-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={isFriendSearching} onClick={searchInviteFriends}>검색</button>
                                    </div>
                                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                                        {friendSearchResults.length === 0 && <p className="rounded-2xl border border-[var(--oc-divider)] p-4 text-center text-sm text-[var(--oc-text-secondary)]">검색 결과가 없습니다.</p>}
                                        {friendSearchResults.map((profile) => (
                                            <button key={profile.id} className="flex w-full items-center justify-between rounded-2xl border border-[var(--oc-divider)] p-3 text-left hover:bg-[var(--oc-surface-2)]" onClick={() => addInviteAttendee(profile)}>
                                                <span className="font-semibold">{profile.nickname || '이름 없음'}</span>
                                                <span className="text-xs text-gray-500">추가</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
