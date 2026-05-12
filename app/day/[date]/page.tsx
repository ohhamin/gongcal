'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';

import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { EventResizeDoneArg } from '@fullcalendar/interaction';

import CalendarLoading from '@/components/CalendarLoading';
import GroupSelector from '@/components/GroupSelector';
import { normalizeProfile, Profile } from '@/lib/groups';
import { supabase } from '@/lib/supabase';
import { useCurrentUser, useMyProfile } from '@/lib/useCurrentProfile';

type Props = {
    params: Promise<{
        date: string;
    }>;
};

type CalendarEvent = {
    id: string;
    title: string;
    detail: string | null;
    start_at: string;
    end_at: string;
    user_id: string;
    is_hidden: boolean;
};

type Person = Profile;

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

const HIDDEN_EVENT_TITLE = '일정 있음';
// 8자리 hex의 99는 약 60% opacity입니다. 숨김 일정은 내용 대신 존재 여부만 보여줍니다.
const HIDDEN_EVENT_COLOR_ALPHA = '99';
const EVENT_TITLE_MAX_LENGTH = 50;
const EVENT_DETAIL_MAX_LENGTH = 500;
const COMMENT_MAX_LENGTH = 100;

export default function DayPage({ params }: Props) {
    const router = useRouter();
    const [people, setPeople] = useState<Person[]>([]);
    const { date } = use(params);
    const currentUserQuery = useCurrentUser();
    const profileQuery = useMyProfile();

    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isCalendarLoading, setIsCalendarLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

    const [title, setTitle] = useState('');
    const [detail, setDetail] = useState('');

    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [isHidden, setIsHidden] = useState(false);
    const [myUserId, setMyUserId] = useState<string | null>(null);
    const [comments, setComments] = useState<CommentRow[]>([]);
    const [commentInput, setCommentInput] = useState('');
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    const [editingCommentInput, setEditingCommentInput] = useState('');

    const colors = ['#3B82F6', '#d6a212ff', '#10B981', '#EF4444'];

    const timeSlots = Array.from({ length: 48 }, (_, i) => {
        const hour = Math.floor(i / 2);
        const minute = i % 2 === 0 ? '00' : '30';

        return `${String(hour).padStart(2, '0')}:${minute}`;
    });

    const lockScroll = () => {
        document.body.style.overflow = 'hidden';
    };

    const unlockScroll = () => {
        document.body.style.overflow = '';
    };

    // 날짜 변환
    const formatTime = (targetDate: Date) => {
        return targetDate.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    };

    const formatDateTime = (value: string | null) => {
        if (!value) return '';

        const targetDate = new Date(value);
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        const hour = String(targetDate.getHours()).padStart(2, '0');
        const minute = String(targetDate.getMinutes()).padStart(2, '0');

        return `${year}.${month}.${day} ${hour}:${minute}`;
    };

    const formatEventDateTimeRange = (event: CalendarEvent) => {
        return `${formatDateTime(event.start_at)} - ${formatDateTime(event.end_at)}`;
    };

    //날짜가 겹친지 확인하는 함수
    const hasOverlap = (start: Date, end: Date) => {
        return events.some((event) => {
            if (event.user_id !== myUserId) {
                return false;
            }

            if (selectedEventId && String(event.id) === selectedEventId) {
                return false;
            }

            const existingStart = new Date(event.start_at);
            const existingEnd = new Date(event.end_at);

            return start < existingEnd && end > existingStart;
        });
    };

    const resetForm = () => {
        setTitle('');
        setDetail('');
        setStartTime('');
        setEndTime('');
        setSelectedEventId(null);
        setIsHidden(false);
    };

    const openEventForm = (event: CalendarEvent | null, start?: Date, end?: Date) => {
        if (event) {
            setSelectedEventId(String(event.id));
            setTitle(event.title);
            setDetail(event.detail || '');
            setStartTime(formatTime(new Date(event.start_at)));
            setEndTime(formatTime(new Date(event.end_at)));
            setIsHidden(event.is_hidden);
        } else {
            resetForm();

            if (start && end) {
                setStartTime(formatTime(start));
                setEndTime(formatTime(end));
            }
        }

        setIsFormOpen(true);
    };

    // 사용자 조회: TanStack Query에 캐시된 내 프로필을 기준으로 표시 대상을 계산합니다.
    const fetchVisiblePeople = useCallback(async () => {
        const myProfile = profileQuery.data;

        if (!currentUserQuery.data || !myProfile) {
            return [];
        }

        setMyUserId(currentUserQuery.data.id);

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

    // 일정 조회
    const fetchEvents = useCallback(async () => {
        const visiblePeople = await fetchVisiblePeople();

        setPeople(visiblePeople);

        const peopleIds = visiblePeople.map((person) => person.id);

        if (peopleIds.length === 0) {
            setEvents([]);
            return;
        }

        const startDate = new Date(`${date}T00:00:00`);
        const endDate = new Date(`${date}T23:59:59`);

        const { data, error } = await supabase
            .from('events')
            .select('*')
            .in('user_id', peopleIds)
            .gte('start_at', startDate.toISOString())
            .lte('start_at', endDate.toISOString());

        if (error) {
            console.error(error);
            return;
        }

        setEvents(data || []);
    }, [date, fetchVisiblePeople]);

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

    const handleSaveEvent = async () => {
        const start = new Date(`${date}T${startTime}`);
        const end = new Date(`${date}T${endTime}`);
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
        if (hasOverlap(start, end)) {
            alert('이미 해당 시간에 일정이 있습니다.');
            return;
        }

        const eventPayload = {
            title: trimmedTitle,
            detail: trimmedDetail || null,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            is_hidden: isHidden,
        };

        // 수정
        if (selectedEventId) {
            const { error } = await supabase.from('events').update(eventPayload).eq('id', Number(selectedEventId)).eq('user_id', user.id);

            if (error) {
                console.error(error);
                return;
            }
        }

        // 생성
        else {
            const { error } = await supabase.from('events').insert({
                ...eventPayload,
                user_id: user.id,
            });

            if (error) {
                console.error(error);
                return;
            }
        }

        setIsFormOpen(false);
        resetForm();
        setDetailEvent(null);

        fetchEvents();
    };

    const handleEventClick = async (info: EventClickArg) => {
        const selectedEvent = events.find((event) => String(event.id) === info.event.id);

        if (!selectedEvent) return;

        const isOwner = selectedEvent.user_id === myUserId;

        if (!isOwner && selectedEvent.is_hidden) {
            return;
        }

        setDetailEvent(selectedEvent);
        setCommentInput('');
        setEditingCommentId(null);
        setEditingCommentInput('');
        await fetchComments(selectedEvent.id);
    };

    const handleDeleteEvent = async () => {
        if (!selectedEventId || !myUserId) return;

        const ok = confirm('일정을 삭제할까요?');

        if (!ok) return;

        // comments FK에 cascade가 없으므로, 일정 삭제 전에 연결 댓글을 먼저 정리합니다.
        const { error: commentDeleteError } = await supabase.from('comments').delete().eq('events_id', Number(selectedEventId));

        if (commentDeleteError) {
            console.error(commentDeleteError);
            alert('댓글 삭제 실패');
            return;
        }

        const { error } = await supabase.from('events').delete().eq('id', Number(selectedEventId)).eq('user_id', myUserId);

        if (error) {
            console.error(error);
            alert('삭제 실패');
            return;
        }

        setIsFormOpen(false);
        setDetailEvent(null);
        resetForm();

        fetchEvents();
    };

    const handleEditFromDetail = () => {
        if (!detailEvent || detailEvent.user_id !== myUserId) return;

        openEventForm(detailEvent);
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

    // 이벤트 드래그하기
    const handleDateSelect = (info: DateSelectArg) => {
        unlockScroll();
        openEventForm(null, new Date(info.start), new Date(info.end));
    };

    // 이벤트 사이즈 변환
    const handleEventResize = async (info: EventResizeDoneArg) => {
        const start = info.event.start;
        const end = info.event.end;

        if (!start || !end) {
            info.revert();
            return;
        }

        if (!myUserId) {
            info.revert();
            return;
        }

        // 겹침 체크
        const overlap = events.some((event) => {
            if (event.user_id !== myUserId) {
                return false;
            }

            if (String(event.id) === info.event.id) {
                return false;
            }

            const existingStart = new Date(event.start_at);
            const existingEnd = new Date(event.end_at);

            return start < existingEnd && end > existingStart;
        });

        if (overlap) {
            alert('시간이 겹칩니다.');

            info.revert();

            return;
        }

        const { error } = await supabase
            .from('events')
            .update({
                start_at: start.toISOString(),
                end_at: end.toISOString(),
            })
            .eq('id', Number(info.event.id))
            .eq('user_id', myUserId);

        if (error) {
            console.error(error);

            info.revert();

            return;
        }

        fetchEvents();
    };

    // 이벤트 이동 처리
    const handleEventDrop = async (info: EventDropArg) => {
        const start = info.event.start;
        const end = info.event.end;

        if (!start || !end) {
            info.revert();
            return;
        }

        if (!myUserId) {
            info.revert();
            return;
        }

        // 겹침 체크
        const overlap = events.some((event) => {
            if (event.user_id !== myUserId) {
                return false;
            }

            if (String(event.id) === info.event.id) {
                return false;
            }

            const existingStart = new Date(event.start_at);
            const existingEnd = new Date(event.end_at);

            return start < existingEnd && end > existingStart;
        });

        if (overlap) {
            alert('시간이 겹칩니다.');

            info.revert();

            return;
        }

        const { error } = await supabase
            .from('events')
            .update({
                start_at: start.toISOString(),
                end_at: end.toISOString(),
            })
            .eq('id', Number(info.event.id))
            .eq('user_id', myUserId);

        if (error) {
            console.error(error);

            info.revert();

            return;
        }

        fetchEvents();
    };

    useEffect(() => {
        if (!currentUserQuery.isLoading && !currentUserQuery.data) {
            router.push('/login');
        }
    }, [currentUserQuery.data, currentUserQuery.isLoading, router]);

    // 첫 로딩: FullCalendar 초기 렌더가 느리게 보이지 않도록 최소 1초 로딩 화면으로 가립니다.
    useEffect(() => {
        if (currentUserQuery.isLoading || profileQuery.isLoading) return;

        const load = async () => {
            const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));

            await Promise.all([fetchEvents(), minimumLoadingTime]);
            setIsCalendarLoading(false);
        };

        load();
    }, [currentUserQuery.isLoading, fetchEvents, profileQuery.isLoading]);

    return (
        <main className="p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold">{date}</h1>
                <GroupSelector onChange={fetchEvents} />
            </div>

            <div className="w-full">
                {isCalendarLoading ? (
                    <CalendarLoading />
                ) : (
                    <div
                        className="grid w-full"
                        style={{
                            gridTemplateColumns: `44px repeat(${people.length}, minmax(0, 1fr))`,
                        }}
                    >
                        <div className="h-7 border-b" />

                        {people.map((person) => (
                            <div
                                key={person.id}
                                className="flex h-7 items-start justify-center border-b pr-2 text-xs text-gray-500"
                            >
                                {person.nickname || '이름 없음'}
                            </div>
                        ))}

                        <div>
                            {timeSlots.map((time) => (
                                <div key={time} className="flex h-7 justify-end border-b pr-2 text-xs text-gray-500">
                                    {time}
                                </div>
                            ))}
                        </div>

                        {people.map((person, index) => (
                            <div key={person.id} className="min-w-0 border-l">
                            <FullCalendar
                                plugins={[timeGridPlugin, interactionPlugin]}
                                initialView="timeGridDay"
                                initialDate={date}
                                events={events
                                    .filter((event) => event.user_id === person.id)
                                    .map((event) => {
                                        const isOwner = event.user_id === myUserId;
                                        const displayTitle = event.is_hidden && !isOwner ? HIDDEN_EVENT_TITLE : event.title;
                                        const eventColor = event.is_hidden
                                            ? `${colors[index]}${HIDDEN_EVENT_COLOR_ALPHA}`
                                            : colors[index];

                                        return {
                                            id: String(event.id),
                                            title: displayTitle,
                                            start: event.start_at,
                                            end: event.end_at,
                                            backgroundColor: eventColor,
                                            borderColor: eventColor,
                                            extendedProps: {
                                                isHidden: event.is_hidden,
                                                userId: event.user_id,
                                            },
                                        };
                                    })}
                                headerToolbar={false}
                                dayHeaders={false}
                                allDaySlot={false}
                                slotDuration="00:30:00"
                                snapDuration="00:30:00"
                                slotLabelInterval="00:30:00"
                                slotLabelContent={() => ''}
                                slotMinTime="00:00:00"
                                slotMaxTime="24:00:00"
                                height="auto"
                                expandRows={false}
                                editable={person.id === myUserId}
                                selectable={person.id === myUserId}
                                select={person.id === myUserId ? handleDateSelect : undefined}
                                selectLongPressDelay={300}
                                selectAllow={() => {
                                    lockScroll();
                                    return true;
                                }}
                                eventClick={handleEventClick}
                                eventResize={person.id === myUserId ? handleEventResize : undefined}
                                eventDrop={person.id === myUserId ? handleEventDrop : undefined}
                                displayEventTime={false}
                            />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {detailEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <h2 className="text-xl font-bold">{detailEvent.title}</h2>

                            <div className="flex gap-2">
                                <button
                                    className={`rounded bg-gray-900 px-3 py-1 text-sm text-white ${
                                        detailEvent.user_id === myUserId ? '' : 'hidden'
                                    }`}
                                    onClick={handleEditFromDetail}
                                >
                                    수정
                                </button>
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

                        <p className="mb-4 text-sm text-gray-500">{formatEventDateTimeRange(detailEvent)}</p>

                        <div className="mb-5 whitespace-pre-wrap rounded border bg-gray-50 p-3 text-sm text-gray-700">
                            {detailEvent.detail || '세부내용이 없습니다.'}
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
                            <button className="rounded bg-black px-4 py-2 text-sm text-white" onClick={handleCreateComment}>
                                등록
                            </button>
                        </div>
                        <div className="-mt-4 mb-5 text-right text-xs text-gray-500">
                            {commentInput.trim().length} / {COMMENT_MAX_LENGTH}
                        </div>

                        <div className="space-y-3">
                            {comments.length === 0 && <p className="text-sm text-gray-500">아직 댓글이 없습니다.</p>}

                            {comments.map((comment) => {
                                const isMyComment = comment.profile_id === myUserId;
                                const isEditing = editingCommentId === comment.id;

                                return (
                                    <div key={comment.id} className="rounded border p-3">
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold">{comment.profile?.nickname || '이름 없음'}</p>
                                                <p className="text-xs text-gray-400">{formatDateTime(comment.created_at)}</p>
                                            </div>

                                            {isMyComment && !isEditing && (
                                                <div className="flex gap-2 text-xs">
                                                    <button className="text-gray-600" onClick={() => handleStartEditComment(comment)}>
                                                        수정
                                                    </button>
                                                    <button className="text-red-500" onClick={() => handleDeleteComment(comment)}>
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
                                                    <button className="rounded bg-gray-200 px-3 py-1 text-xs" onClick={handleCancelEditComment}>
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
                                            <p className="whitespace-pre-wrap text-sm text-gray-700">{comment.contents}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
                        <h2 className="mb-4 text-xl font-bold">{selectedEventId ? '일정 수정' : '일정 추가'}</h2>

                        <div className="mb-3">
                            <p className="mb-1 text-sm">일정 제목</p>

                            <input
                                className="w-full rounded border p-2"
                                value={title}
                                maxLength={EVENT_TITLE_MAX_LENGTH}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                            <div
                                className={`mt-1 text-right text-xs ${
                                    title.trim().length >= 45 ? 'text-red-500' : 'text-gray-500'
                                }`}
                            >
                                {title.trim().length} / {EVENT_TITLE_MAX_LENGTH}
                            </div>
                        </div>

                        <div className="mb-3">
                            <p className="mb-1 text-sm">세부내용</p>

                            <textarea
                                className="min-h-28 w-full resize-y rounded border p-2"
                                value={detail}
                                maxLength={EVENT_DETAIL_MAX_LENGTH}
                                onChange={(e) => setDetail(e.target.value)}
                            />
                            <div
                                className={`mt-1 text-right text-xs ${
                                    detail.trim().length >= 450 ? 'text-red-500' : 'text-gray-500'
                                }`}
                            >
                                {detail.trim().length} / {EVENT_DETAIL_MAX_LENGTH}
                            </div>
                        </div>

                        <div className="mb-3">
                            <p className="mb-1 text-sm">시작 시간</p>

                            <input
                                type="time"
                                step="1800"
                                className="w-full rounded border p-2"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </div>

                        <div className="mb-3">
                            <p className="mb-1 text-sm">종료 시간</p>

                            <input
                                type="time"
                                step="1800"
                                className="w-full rounded border p-2"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                            />
                        </div>

                        <label className="mb-5 flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={isHidden}
                                onChange={(e) => setIsHidden(e.target.checked)}
                            />
                            친구에게 숨기기
                        </label>

                        <div className="flex items-center justify-between">
                            <div>
                                {selectedEventId && (
                                    <button
                                        className="rounded bg-red-500 px-4 py-2 text-white"
                                        onClick={handleDeleteEvent}
                                    >
                                        삭제
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    className="rounded bg-gray-200 px-4 py-2"
                                    onClick={() => {
                                        setIsFormOpen(false);
                                        resetForm();
                                    }}
                                >
                                    취소
                                </button>

                                <button className="rounded bg-black px-4 py-2 text-white" onClick={handleSaveEvent}>
                                    {selectedEventId ? '수정' : '저장'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
