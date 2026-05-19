'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import { DateSelectArg, EventClickArg } from '@fullcalendar/core';

import CalendarLoading from '@/components/CalendarLoading';
import GroupSelector from '@/components/GroupSelector';
import TimeSelect from '@/components/TimeSelect';
import { normalizeProfile, Profile } from '@/lib/groups';
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
};

type MyInvitedEventRpcRow = CalendarEvent & {
    invite_profile_id: string;
    invite_is_agree: boolean;
};

type Person = Profile;

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
const PENDING_INVITE_COLOR = '#F97316';
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
    const [year, month, day] = dateStr.split('-');
    return `${year}년 ${parseInt(month, 10)}월 ${parseInt(day, 10)}일`;
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
    return isMyOwnedEvent(event) || isMyInviteEvent(event);
}

function getOwnerName(event: CalendarEvent, ownerNameById: Map<string, string>): string {
    return ownerNameById.get(event.user_id) || '이름 없음';
}

function getEventDisplayTitle(event: CalendarEvent, ownerNameById: Map<string, string>): string {
    return event.is_hidden && !canSeeEventDetail(event) ? `🔒${getOwnerName(event, ownerNameById)}` : event.title;
}

function getEventBaseColor(event: CalendarEvent): string {
    if (isMyOwnedEvent(event) || isAcceptedMyInvite(event)) return MY_EVENT_COLOR;
    if (isPendingMyInvite(event)) return PENDING_INVITE_COLOR;
    return GROUP_EVENT_COLOR;
}

function getStartMinutes(event: CalendarEvent): number {
    const start = new Date(event.start_at);
    return start.getHours() * 60 + start.getMinutes();
}

function getOwnershipSortRank(event: CalendarEvent): number {
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
    const [holidayByDate, setHolidayByDate] = useState<Record<string, HolidayInfo>>({});
    const calendarContainerRef = useRef<HTMLDivElement | null>(null);
    const calendarRef = useRef<FullCalendar | null>(null);
    const dragStartDateRef = useRef<string | null>(null);
    const isRangeDraggingRef = useRef(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        dragStartDateRef.current = null;
        isRangeDraggingRef.current = false;
        calendarRef.current?.getApi().unselect();
        setDragRange(null);
    };

    const handleCalendarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const dateStr = getDateFromPointer(event.clientX, event.clientY);
        if (!dateStr) return;

        dragStartDateRef.current = dateStr;
        longPressTimerRef.current = setTimeout(() => {
            isRangeDraggingRef.current = true;
            setDragRange({ start: dateStr, end: dateStr });
        }, 250);
    };

    const handleCalendarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isRangeDraggingRef.current || !dragStartDateRef.current) return;
        event.preventDefault();

        const dateStr = getDateFromPointer(event.clientX, event.clientY);
        if (!dateStr) return;

        setDragRange(normalizeDateRange(dragStartDateRef.current, dateStr));
    };

    const handleCalendarPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        if (!isRangeDraggingRef.current || !dragStartDateRef.current) {
            clearRangeDrag();
            return;
        }

        event.preventDefault();
        const endDateStr = getDateFromPointer(event.clientX, event.clientY) || dragStartDateRef.current;
        const selectedRange = normalizeDateRange(dragStartDateRef.current, endDateStr);
        clearRangeDrag();
        openCreateForm(selectedRange.start, selectedRange.end, true);
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
        setPeople(visiblePeople);
        setFilterPeople(visiblePeople);
        setSelectedMemberIds((prev) => {
            const visibleIds = visiblePeople.map((person) => person.id);
            const next = new Set<string>();

            visibleIds.forEach((id) => {
                if (filterPeople.length === 0 || prev.has(id)) next.add(id);
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
    }, [visibleRange, fetchVisiblePeople, currentUserQuery.data?.id, profileQuery.data?.id, filterPeople.length, sortCalendarEvents]);

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

    const getEventsForDate = (dateStr: string): CalendarEvent[] => {
        return events
            .filter((event) => {
                const dayStart = new Date(`${dateStr}T00:00:00`);
                const dayEnd = new Date(`${dateStr}T23:59:59`);
                return new Date(event.start_at) <= dayEnd && new Date(event.end_at) >= dayStart;
            })
            .sort(compareCalendarEvents);
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
        openCreateForm(selectedStart, selectedEnd, true);
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
        if (error) { console.error(error); alert('친구 검색 실패'); return; }
        type FriendshipSearchRow = { requester_id: string; addressee_id: string; requester: Person | Person[] | null; addressee: Person | Person[] | null; };
        const friends = ((data || []) as FriendshipSearchRow[]).map((row) => normalizeProfile(row.requester_id === myUserId ? row.addressee : row.requester)).filter(Boolean) as Person[];
        setFriendSearchResults(friends.filter((friend) => !keyword || (friend.nickname || '').includes(keyword)).sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '')));
    };

    const addInviteAttendee = (profile: Person) => {
        if (attendees.some((attendee) => attendee.profile_id === profile.id)) { alert('이미 추가된 사용자에요'); return; }
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

        const { error } = await supabase.from('notifications').insert(
            newInviteProfileIds.map((profileId) => ({
                profile_id: profileId,
                type: 'event_invite',
                title: '일정 초대',
                message: '새로운 일정이 초대가 되었어요.',
                related_id: eventId,
            })),
        );

        // 알림 저장 실패가 일정 저장 자체를 막으면 사용성이 나빠지므로 best-effort로만 처리합니다.
        if (error) console.error(error);
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
            alert('일정 제목을 입력해주세요.');
            return;
        }

        if (trimmedTitle.length > EVENT_TITLE_MAX_LENGTH) {
            alert(`일정 제목은 ${EVENT_TITLE_MAX_LENGTH}자 이하만 가능합니다.`);
            return;
        }

        if (trimmedDetail.length > EVENT_DETAIL_MAX_LENGTH) {
            alert(`세부내용은 ${EVENT_DETAIL_MAX_LENGTH}자 이하만 가능합니다.`);
            return;
        }

        if (start >= end) {
            alert('종료 시간은 시작 시간보다 늦어야 합니다.');
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
            alert(`일정 저장 실패. 변경사항을 롤백했습니다.\n${message}`);
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

        const ok = confirm('일정을 삭제할까요?');
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
            alert('삭제 실패');
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
            alert('댓글을 불러오지 못했습니다.');
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
        setPopupDate(info.dateStr);
    };

    const handleEventClick = (info: EventClickArg) => {
        info.jsEvent.preventDefault();

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
        const ok = confirm('초대를 받으시겠습니까?'); if (!ok) return;

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
            if (error) { console.error(error); alert('초대 수락 실패'); return; }
        }

        await refreshInviteAfterResponse();
    };

    const handleCancelInvite = async () => {
        if (!detailEvent || !myUserId) return;
        const ok = confirm(detailEvent.invite_is_agree ? '참석을 취소하시겠습니까?' : '초대를 받지 않으시겠습니까?'); if (!ok) return;

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
            if (error) { console.error(error); alert('초대 취소 실패'); return; }
        }

        await refreshInviteAfterResponse();
    };

    const handleCreateComment = async () => {
        if (!detailEvent) return;

        const trimmedComment = commentInput.trim();
        if (!trimmedComment) {
            alert('댓글 내용을 입력해주세요.');
            return;
        }
        if (trimmedComment.length > COMMENT_MAX_LENGTH) {
            alert(`댓글은 ${COMMENT_MAX_LENGTH}자 이하만 가능합니다.`);
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
            alert('댓글 등록 실패');
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
            alert('댓글 내용을 입력해주세요.');
            return;
        }
        if (trimmedComment.length > COMMENT_MAX_LENGTH) {
            alert(`댓글은 ${COMMENT_MAX_LENGTH}자 이하만 가능합니다.`);
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
            alert('댓글 수정 실패');
            return;
        }

        handleCancelEditComment();
        fetchComments(detailEvent.id);
    };

    const handleDeleteComment = async (comment: CommentRow) => {
        if (!detailEvent || comment.profile_id !== myUserId) return;

        const ok = confirm('댓글을 삭제할까요?');
        if (!ok) return;

        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', comment.id)
            .eq('events_id', comment.events_id)
            .eq('profile_id', myUserId);

        if (error) {
            console.error(error);
            alert('댓글 삭제 실패');
            return;
        }

        if (editingCommentId === comment.id) {
            handleCancelEditComment();
        }
        fetchComments(detailEvent.id);
    };

    const ownerNameById = new Map(people.map((p) => [p.id, p.nickname || '이름 없음']));
    const isGroupFilterEnabled = masterFilterMode === MASTER_FILTER_GROUP;

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

    const calendarEvents = sortCalendarEvents(filteredEvents).flatMap((event) => {
        const baseColor = getEventBaseColor(event);
        const color = event.is_hidden ? `${baseColor}${HIDDEN_EVENT_COLOR_ALPHA}` : baseColor;
        const orderStartAt = getStartMinutes(event);
        const orderOwnerRank = getOwnershipSortRank(event);

        return getDateStringsInRange(event.start_at, event.end_at).map((dateStr) => ({
            id: `${event.id}:${dateStr}`,
            title: getEventDisplayTitle(event, ownerNameById),
            start: dateStr,
            allDay: true,
            orderPriority: getDisplayPriority(event),
            orderStartAt,
            backgroundColor: color,
            borderColor: color,
            extendedProps: {
                originalEventId: String(event.id),
                displayDate: dateStr,
                isHidden: event.is_hidden,
                userId: event.user_id,
                ownerName: getOwnerName(event, ownerNameById),
                isOwner: isMyOwnedEvent(event),
                isMyInvite: isMyInviteEvent(event),
                orderPriority: getDisplayPriority(event),
                orderStartAt,
                orderOwnerRank,
                orderTitle: event.title,
            },
        }));
    });

    const popupEvents = popupDate ? getEventsForDate(popupDate).filter(isEventVisibleByMemberFilter) : [];

    return (
        <div
            className="flex flex-col bg-white"
            style={{ height: 'calc(87.5vh - 4rem)' }}
        >
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3 px-1 pb-1">
                <h1 className="text-xl font-bold">우리캘린더</h1>
                <div className="flex flex-col items-end gap-2">
                    <GroupSelector
                        onChange={() => {
                            setIsCalendarLoading(true);
                            setPopupDate(null);
                            setDetailEvent(null);
                            setIsFormOpen(false);
                            setMasterFilterMode(MASTER_FILTER_GROUP);
                            setSelectedMemberIds(new Set());
                            setIsMemberFilterOpen(false);
                        }}
                    />
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-full border bg-gray-100 p-0.5 text-sm" aria-label="일정 표시 범위 선택">
                            <button
                                className={`rounded-full px-2 py-1 ${!isGroupFilterEnabled ? 'bg-white shadow' : 'text-gray-500'}`}
                                aria-label="내 일정만 보기"
                                onClick={() => {
                                    setMasterFilterMode(MASTER_FILTER_MY_ONLY);
                                    setIsMemberFilterOpen(false);
                                }}
                            >
                                👤
                            </button>
                            <button
                                className={`rounded-full px-2 py-1 ${isGroupFilterEnabled ? 'bg-white shadow' : 'text-gray-500'}`}
                                aria-label="그룹 일정 함께 보기"
                                onClick={() => setMasterFilterMode(MASTER_FILTER_GROUP)}
                            >
                                👥
                            </button>
                        </div>
                        <div className="relative">
                            <button
                                className="rounded border bg-white px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-400"
                                disabled={!isGroupFilterEnabled}
                                onClick={() => setIsMemberFilterOpen((prev) => !prev)}
                            >
                                멤버 {selectedMemberIds.size}/{filterPeople.length}
                            </button>
                            {isMemberFilterOpen && (
                                <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border bg-white p-2 shadow-lg">
                                    {filterPeople.length === 0 ? (
                                        <p className="px-2 py-1 text-xs text-gray-500">멤버가 없습니다.</p>
                                    ) : (
                                        filterPeople.map((person) => {
                                            const checked = selectedMemberIds.has(person.id);

                                            return (
                                                <label key={person.id} className="flex items-center justify-between gap-3 rounded px-2 py-1 text-sm hover:bg-gray-50">
                                                    <span className="truncate">{person.id === myUserId ? '나' : person.nickname || '이름 없음'}</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={checked}
                                                        disabled={!isGroupFilterEnabled}
                                                        className={`h-5 w-9 rounded-full p-0.5 transition ${
                                                            checked ? 'bg-blue-600' : 'bg-gray-300'
                                                        } disabled:opacity-40`}
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            toggleMemberFilter(person.id);
                                                        }}
                                                    >
                                                        <span
                                                            className={`block h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-4' : 'translate-x-0'}`}
                                                        />
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
            </div>

            <div
                ref={calendarContainerRef}
                className="relative min-h-0 flex-1"
                onPointerDown={handleCalendarPointerDown}
                onPointerMove={handleCalendarPointerMove}
                onPointerUp={handleCalendarPointerUp}
                onPointerCancel={clearRangeDrag}
                onPointerLeave={(event) => {
                    if (!isRangeDraggingRef.current) clearRangeDrag();
                    else handleCalendarPointerMove(event);
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
                            headerToolbar={{ start: 'prev', center: 'title', end: 'next' }}
                            height="100%"
                            expandRows={true}
                            fixedWeekCount={true}
                            events={calendarEvents}
                            dateClick={handleDateClick}
                            eventClick={handleEventClick}
                            selectable={true}
                            selectMirror={true}
                            unselectAuto={true}
                            longPressDelay={250}
                            selectLongPressDelay={250}
                            eventLongPressDelay={250}
                            select={openCreateFormFromSelect}
                            dayMaxEvents={3}
                            dayCellClassNames={(arg) => {
                                const dateStr = formatLocalDateString(arg.date);
                                const classNames: string[] = [];

                                if (arg.date.getDay() === 0 || arg.date.getDay() === 6) classNames.push('ourcal-weekend');
                                if (holidayByDate[dateStr]) classNames.push('ourcal-holiday');
                                if (dragRange && dateStr >= dragRange.start && dateStr <= dragRange.end) classNames.push('ourcal-range-selected');

                                return classNames;
                            }}
                            dayCellContent={(arg) => {
                                const dateStr = formatLocalDateString(arg.date);
                                const holiday = holidayByDate[dateStr];
                                const isRedDay = Boolean(holiday) || arg.date.getDay() === 0 || arg.date.getDay() === 6;

                                return (
                                    <div className="ourcal-day-cell-content">
                                        {holiday && (
                                            <span className="ourcal-holiday-name" title={holiday.dateName}>
                                                {holiday.dateName}
                                            </span>
                                        )}
                                        <span className={isRedDay ? 'ourcal-red-day-number' : undefined}>{arg.date.getDate()}</span>
                                    </div>
                                );
                            }}
                            moreLinkContent={(args) => `+${args.num}`}
                            moreLinkClick={(arg) => {
                                setPopupDate(formatLocalDateString(arg.date));
                                return 'none';
                            }}
                            datesSet={(arg) => {
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
                            }}
                            dayHeaderFormat={{ weekday: 'short' }}
                            displayEventTime={false}
                            eventDisplay="block"
                            eventOrderStrict={true}
                            eventOrder="orderPriority,orderStartAt,orderOwnerRank,orderTitle"
                            eventContent={(arg) => {
                                const isOwner = Boolean(arg.event.extendedProps.isOwner);
                                const isHidden = Boolean(arg.event.extendedProps.isHidden);
                                const ownerName = String(arg.event.extendedProps.ownerName || '');
                                const shouldShowOwnerName = !isOwner && !isHidden && ownerName.length > 0;

                                return (
                                    <div className="truncate text-[10px] font-semibold leading-none">
                                        <span>{arg.event.title}</span>
                                        {shouldShowOwnerName && <span className="ml-1 opacity-80">{ownerName}</span>}
                                    </div>
                                );
                            }}
                        />

                        {isCalendarLoading && (
                            <div className="absolute inset-0 z-10 bg-white">
                                <CalendarLoading />
                            </div>
                        )}
                    </>
                )}
            </div>

            {popupDate && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={() => setPopupDate(null)}>
                    <div className="flex h-[65vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex shrink-0 items-center justify-between border-b p-4">
                            <h2 className="text-lg font-bold">{formatPopupDate(popupDate)}</h2>
                            <button
                                className="rounded bg-gray-200 px-3 py-1 text-sm"
                                onClick={() => setPopupDate(null)}
                            >
                                닫기
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-4">
                            {popupEvents.length === 0 ? (
                                <p className="py-8 text-center text-sm text-gray-500">일정이 없습니다.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {popupEvents.map((event) => {
                                        const isOwner = isMyOwnedEvent(event);
                                        const isHiddenFromMe = event.is_hidden && !canSeeEventDetail(event);
                                        const color = getEventBaseColor(event);
                                        const ownerName = getOwnerName(event, ownerNameById);
                                        const displayTitle = getEventDisplayTitle(event, ownerNameById);
                                        const commentCount = commentCountByEventId[String(event.id)] || 0;

                                        return (
                                            <li key={event.id}>
                                                <div className="flex items-center gap-2 rounded-lg border p-3">
                                                    <button
                                                        className={`flex min-w-0 flex-1 items-center gap-3 text-left ${
                                                            isHiddenFromMe ? 'cursor-default' : 'hover:bg-gray-50'
                                                        }`}
                                                        onClick={() => {
                                                            if (isHiddenFromMe) return;
                                                            handleListEventClick(event);
                                                        }}
                                                    >
                                                        <span
                                                            className="h-3 w-3 shrink-0 rounded-full"
                                                            style={{ backgroundColor: color }}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-semibold">{displayTitle}</p>
                                                            <p className="text-xs text-gray-500">
                                                                {formatEventTimeLabel(event)}
                                                                {!isOwner && ownerName && !isHiddenFromMe ? ` · ${ownerName}` : ''}
                                                            </p>
                                                        </div>
                                                    </button>
                                                    {canShowPopupCommentCount(event) && (
                                                        <span className="shrink-0 text-xs font-semibold text-gray-500" aria-label={`댓글 ${commentCount}개`}>
                                                            📝{commentCount}
                                                        </span>
                                                    )}
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

                        <div className="shrink-0 border-t p-4">
                            <button
                                className="w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white"
                                onClick={() => openCreateForm(popupDate)}
                            >
                                일정 추가
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {detailEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDetailEvent(null)}>
                    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <h2 className="text-xl font-bold">{detailEvent.title}</h2>

                            <div className="flex gap-2">
                                {detailEvent.user_id === myUserId && (
                                    <button
                                        className="rounded bg-gray-900 px-3 py-1 text-sm text-white"
                                        onClick={handleEditFromDetail}
                                    >
                                        수정
                                    </button>
                                )}
                                {detailEvent.invite_profile_id === myUserId && !detailEvent.invite_is_agree && (
                                    <>
                                        <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white" onClick={handleAcceptInvite}>참석하기</button>
                                        <button className="rounded bg-red-500 px-3 py-1 text-sm text-white" onClick={handleCancelInvite}>참석거절</button>
                                    </>
                                )}
                                {detailEvent.invite_profile_id === myUserId && detailEvent.invite_is_agree && (
                                    <button className="rounded bg-red-500 px-3 py-1 text-sm text-white" onClick={handleCancelInvite}>참석취소</button>
                                )}
                                <button
                                    className="rounded bg-gray-200 px-3 py-1 text-sm"
                                    onClick={() => {
                                        setDetailEvent(null);
                                        handleCancelEditComment();
                                    }}
                                >
                                    닫기
                                </button>
                            </div>
                        </div>

                        <p className="mb-4 text-sm text-gray-500">
                            {detailEvent.is_allday
                                ? `하루 종일 · ${formatDateTimeText(detailEvent.start_at)} - ${formatDateTimeText(detailEvent.end_at)}`
                                : `${formatDateTimeText(detailEvent.start_at)} - ${formatDateTimeText(detailEvent.end_at)}`}
                        </p>

                        <div className="mb-5 whitespace-pre-wrap rounded border bg-gray-50 p-3 text-sm text-gray-700">
                            {detailEvent.detail || '세부내용이 없습니다.'}
                        </div>

                        <div className="mb-5 rounded border p-3">
                            <p className="mb-2 text-sm font-semibold">참석자 명단</p>
                            <div className="h-[15vh] space-y-2 overflow-y-auto pr-1">
                                {attendees.map((attendee) => {
                                    const statusText = attendee.isOwner ? '소유자' : attendee.is_agree ? '참석예정' : '초대중';

                                    return (
                                        <div key={attendee.profile_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded border p-2 text-xs">
                                            <p className="truncate font-semibold">{attendee.nickname || '이름 없음'}</p>
                                            <p className="shrink-0 text-gray-500">{statusText}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mb-5 flex gap-2">
                            <input
                                className="flex-1 rounded border p-2 text-sm"
                                placeholder="댓글을 입력하세요"
                                value={commentInput}
                                maxLength={COMMENT_MAX_LENGTH}
                                onChange={(e) => setCommentInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleCreateComment();
                                    }
                                }}
                            />
                            <button
                                className="rounded bg-black px-4 py-2 text-sm text-white"
                                onClick={handleCreateComment}
                            >
                                등록
                            </button>
                        </div>
                        <div className="-mt-4 mb-5 text-right text-xs text-gray-500">
                            {commentInput.trim().length} / {COMMENT_MAX_LENGTH}
                        </div>

                        <div className="h-[20vh] space-y-3 overflow-y-auto pr-1">
                            {comments.length === 0 && (
                                <p className="text-sm text-gray-500">아직 댓글이 없습니다.</p>
                            )}

                            {comments.map((comment) => {
                                const isMyComment = comment.profile_id === myUserId;
                                const isEditing = editingCommentId === comment.id;

                                return (
                                    <div key={comment.id} className="rounded border p-3">
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold">
                                                    {comment.profile?.nickname || '이름 없음'}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {formatDateTimeText(comment.created_at)}
                                                </p>
                                            </div>

                                            {isMyComment && !isEditing && (
                                                <div className="flex gap-2 text-xs">
                                                    <button
                                                        className="text-gray-600"
                                                        onClick={() => handleStartEditComment(comment)}
                                                    >
                                                        수정
                                                    </button>
                                                    <button
                                                        className="text-red-500"
                                                        onClick={() => handleDeleteComment(comment)}
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {isEditing ? (
                                            <div className="mt-2">
                                                <textarea
                                                    className="min-h-20 w-full resize-y rounded border p-2 text-sm"
                                                    value={editingCommentInput}
                                                    maxLength={COMMENT_MAX_LENGTH}
                                                    onChange={(e) => setEditingCommentInput(e.target.value)}
                                                />
                                                <div className="mt-1 text-right text-xs text-gray-500">
                                                    {editingCommentInput.trim().length} / {COMMENT_MAX_LENGTH}
                                                </div>
                                                <div className="mt-2 flex justify-end gap-2">
                                                    <button
                                                        className="rounded bg-gray-200 px-3 py-1 text-xs"
                                                        onClick={handleCancelEditComment}
                                                    >
                                                        취소
                                                    </button>
                                                    <button
                                                        className="rounded bg-black px-3 py-1 text-xs text-white"
                                                        onClick={() => handleUpdateComment(comment)}
                                                    >
                                                        저장
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="whitespace-pre-wrap text-sm text-gray-700">
                                                {comment.contents}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <button
                className="fixed right-5 bottom-20 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-black text-2xl font-bold text-white shadow-lg"
                aria-label="일정 추가"
                onClick={() => openCreateForm()}
            >
                +
            </button>

            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closeForm}>
                    <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h2 className="mb-4 text-xl font-bold">{selectedEventId ? '일정 수정' : '일정 추가'}</h2>

                        <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                            <div className="space-y-3">
                                <div>
                                    <p className="mb-1 text-sm">일정 제목</p>
                                    <input
                                        className="w-full rounded border p-2"
                                        value={title}
                                        maxLength={EVENT_TITLE_MAX_LENGTH}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                    <div className={`mt-1 text-right text-xs ${title.trim().length >= 45 ? 'text-red-500' : 'text-gray-500'}`}>
                                        {title.trim().length} / {EVENT_TITLE_MAX_LENGTH}
                                    </div>
                                </div>

                                <div>
                                    <p className="mb-1 text-sm">세부일정</p>
                                    <input
                                        className="w-full rounded border p-2"
                                        value={detail}
                                        maxLength={EVENT_DETAIL_MAX_LENGTH}
                                        onChange={(e) => setDetail(e.target.value)}
                                    />
                                    <div className={`mt-1 text-right text-xs ${detail.trim().length >= 450 ? 'text-red-500' : 'text-gray-500'}`}>
                                        {detail.trim().length} / {EVENT_DETAIL_MAX_LENGTH}
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-h-0 flex-col rounded border p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">참석자</p>
                                    <button className="rounded bg-black px-3 py-1 text-xs text-white" onClick={() => setIsInviteSearchOpen(true)}>초대</button>
                                </div>
                                <div className="h-[15vh] min-h-0 space-y-2 overflow-y-auto pr-1">
                                    {attendees.map((attendee) => {
                                        const statusText = attendee.isOwner ? '소유자' : attendee.is_agree ? '참석예정' : '초대중';
                                        const canCancelInvite = !attendee.isOwner && (!selectedEventId || detailEvent?.user_id === myUserId);

                                        return (
                                            <div key={attendee.profile_id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded border p-2 text-xs">
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

                        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-end">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <p className="mb-1 text-sm">시작 날짜</p>
                                    <input type="date" className="w-full rounded border p-2 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                                </div>
                                <div>
                                    <p className="mb-1 text-sm">시작 시간</p>
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
                                    <p className="mb-1 text-sm">종료 날짜</p>
                                    <input type="date" className="w-full rounded border p-2 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                                </div>
                                <div>
                                    <p className="mb-1 text-sm">종료 시간</p>
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

                        <div className="mb-5 flex items-center justify-between gap-3 text-sm">
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={isAllDay} onChange={(e) => handleAllDayChange(e.target.checked)} />
                                하루 종일
                            </label>

                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={!isHidden} onChange={(e) => setIsHidden(!e.target.checked)} />
                                    상세 일정 함께 보기
                                </label>
                                <div className="relative inline-flex">
                                    {isVisibilityTooltipOpen && (
                                        <div className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-center text-xs text-white shadow-lg">
                                            구성원에게는 시간만 노출되고 &apos;🔒&apos;로 표시됩니다.
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] font-bold text-gray-600"
                                        aria-label="상세 일정 함께 보기 안내"
                                        onClick={showVisibilityTooltip}
                                    >
                                        ?
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                {selectedEventId && detailEvent?.user_id === myUserId && (
                                    <button className="rounded bg-red-500 px-4 py-2 text-white" onClick={handleDeleteEvent}>삭제</button>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button className="rounded bg-gray-200 px-4 py-2" onClick={closeForm}>취소</button>
                                <button className="rounded bg-black px-4 py-2 text-white" onClick={handleSaveEvent}>{selectedEventId ? '수정' : '저장'}</button>
                            </div>
                        </div>

                        {isInviteSearchOpen && (
                            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setIsInviteSearchOpen(false)}>
                                <div className="flex h-[70vh] w-full max-w-md flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                                    <div className="mb-4 flex items-center justify-between">
                                        <h3 className="text-lg font-bold">친구 찾기</h3>
                                        <button className="rounded bg-gray-200 px-3 py-1 text-sm" onClick={() => setIsInviteSearchOpen(false)}>닫기</button>
                                    </div>
                                    <div className="mb-3 flex gap-2">
                                        <input
                                            className="min-w-0 flex-1 rounded border p-2 text-sm"
                                            placeholder="닉네임 검색"
                                            value={friendSearchKeyword}
                                            onChange={(e) => setFriendSearchKeyword(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') searchInviteFriends(); }}
                                        />
                                        <button className="rounded bg-black px-4 py-2 text-sm text-white" disabled={isFriendSearching} onClick={searchInviteFriends}>검색</button>
                                    </div>
                                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                                        {friendSearchResults.length === 0 && <p className="rounded border p-4 text-sm text-gray-500">검색 결과가 없습니다.</p>}
                                        {friendSearchResults.map((profile) => (
                                            <button key={profile.id} className="flex w-full items-center justify-between rounded border p-3 text-left hover:bg-gray-50" onClick={() => addInviteAttendee(profile)}>
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
