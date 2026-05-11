'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import FullCalendar from '@fullcalendar/react';
import { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';

import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { EventResizeDoneArg } from '@fullcalendar/interaction';

import { supabase } from '@/lib/supabase';

type Props = {
    params: Promise<{
        date: string;
    }>;
};

type CalendarEvent = {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    user_id: string;
};

type Person = {
    id: string;
    nickname: string | null;
};

type FriendshipRow = {
    requester_id: string;
    addressee_id: string;
    requester: Person;
    addressee: Person;
};

export default function DayPage({ params }: Props) {
    const router = useRouter();
    const [people, setPeople] = useState<Person[]>([]);
    const { date } = use(params);

    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [open, setOpen] = useState(false);

    const [title, setTitle] = useState('');

    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [myUserId, setMyUserId] = useState<string | null>(null);

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
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
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

    // 사용자 조회
    const fetchVisiblePeople = useCallback(async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return [];

        setMyUserId(user.id);

        const { data: myProfile } = await supabase.from('profiles').select('id, nickname').eq('id', user.id).single();

        const { data: friendships } = await supabase
            .from('friendships')
            .select(
                `
    *,
    requester:profiles!friendships_requester_id_fkey (
      id,
      nickname
    ),
    addressee:profiles!friendships_addressee_id_fkey (
      id,
      nickname
    )
  `,
            )
            .eq('status', 'accepted')
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

        const friends =
            (friendships as FriendshipRow[] | null)?.map((friendship) => {
                const isRequester = friendship.requester_id === user.id;

                return isRequester ? friendship.addressee : friendship.requester;
            }) || [];

        return [myProfile, ...friends].filter(Boolean) as Person[];
    }, []);

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

    const handleSaveEvent = async () => {
        const start = new Date(`${date}T${startTime}`);
        const end = new Date(`${date}T${endTime}`);
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;
        const trimmedTitle = title.trim();

        if (trimmedTitle.length < 1) {
            alert('일정 내용을 입력해주세요.');
            return;
        }

        if (trimmedTitle.length > 50) {
            alert('일정은 50자 이하만 가능합니다.');
            return;
        }

        if (hasOverlap(start, end)) {
            alert('이미 해당 시간에 일정이 있습니다.');
            return;
        }
        if (start >= end) {
            alert('종료 시간은 시작 시간보다 늦어야 합니다.');
            return;
        }

        // 수정
        if (selectedEventId) {
            const { error } = await supabase
                .from('events')
                .update({
                    title: trimmedTitle,
                    start_at: start.toISOString(),
                    end_at: end.toISOString(),
                })
                .eq('id', Number(selectedEventId));

            if (error) {
                console.error(error);
                return;
            }
        }

        // 생성
        else {
            const { error } = await supabase.from('events').insert({
                title: trimmedTitle,
                start_at: start.toISOString(),
                end_at: end.toISOString(),
                user_id: user.id,
            });

            if (error) {
                console.error(error);
                return;
            }
        }

        // 초기화
        setOpen(false);

        setTitle('');

        setSelectedEventId(null);

        fetchEvents();
    };

    const handleEventClick = (info: EventClickArg) => {
        const event = info.event;

        setSelectedEventId(event.id);

        setTitle(event.title);

        if (!event.start || !event.end) {
            alert('일정 시간 정보를 불러올 수 없습니다.');
            return;
        }

        setStartTime(formatTime(event.start));
        setEndTime(formatTime(event.end));

        setOpen(true);
    };

    const handleDeleteEvent = async () => {
        if (!selectedEventId) return;

        const ok = confirm('일정을 삭제할까요?');

        if (!ok) return;

        const { error } = await supabase.from('events').delete().eq('id', Number(selectedEventId));

        if (error) {
            console.error(error);
            alert('삭제 실패');
            return;
        }

        setOpen(false);

        setSelectedEventId(null);

        fetchEvents();
    };

    // 이벤트 드래그하기
    const handleDateSelect = (info: DateSelectArg) => {
        unlockScroll();

        setSelectedEventId(null);
        setTitle('');

        const start = new Date(info.start);
        const end = new Date(info.end);

        setStartTime(formatTime(start));
        setEndTime(formatTime(end));

        setOpen(true);
    };

    // 이벤트 사이즈 변환
    const handleEventResize = async (info: EventResizeDoneArg) => {
        const start = info.event.start;
        const end = info.event.end;

        if (!start || !end) {
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
            .eq('id', Number(info.event.id));

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
            .eq('id', Number(info.event.id));

        if (error) {
            console.error(error);

            info.revert();

            return;
        }

        fetchEvents();
    };

    // 첫 로딩
    useEffect(() => {
        const load = async () => {
            await fetchEvents();
        };

        load();
    }, [fetchEvents]);

    return (
        <main className="p-5">
            <div className="mb-2 flex items-center justify-end">
                <button className="rounded bg-black px-4 py-2 text-white" onClick={() => router.push('/calendar')}>
                    캘린더
                </button>
            </div>
            <div className="flex items-center justify-center">
                <h1 className="mb-5 text-2xl font-bold">{date}</h1>
            </div>

            <div className="w-full">
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
                            className="flex h-7 text-xs items-start justify-center border-b pr-2 text-xs text-gray-500"
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
                                    .map((event) => ({
                                        id: String(event.id),
                                        title: event.title,
                                        start: event.start_at,
                                        end: event.end_at,
                                        backgroundColor: colors[index],
                                        borderColor: colors[index],
                                    }))}
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
                                eventClick={person.id === myUserId ? handleEventClick : undefined}
                                eventResize={person.id === myUserId ? handleEventResize : undefined}
                                eventDrop={person.id === myUserId ? handleEventDrop : undefined}
                                displayEventTime={false}
                            />
                        </div>
                    ))}
                </div>
            </div>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                        <h2 className="mb-4 text-xl font-bold">일정 추가</h2>

                        <div className="mb-3">
                            <p className="mb-1 text-sm">일정 내용</p>

                            <input
                                className="w-full rounded border p-2"
                                value={title}
                                maxLength={50}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                            <div
                                className={`mt-1 text-right text-xs ${
                                    title.trim().length >= 45 ? 'text-red-500' : 'text-gray-500'
                                }`}
                            >
                                {title.trim().length} / 50
                            </div>
                        </div>

                        <div className="mb-3">
                            <p className="mb-1 text-sm">시작 시간</p>

                            <input
                                type="time"
                                step="3600"
                                className="w-full rounded border p-2"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </div>

                        <div className="mb-5">
                            <p className="mb-1 text-sm">종료 시간</p>

                            <input
                                type="time"
                                step="3600"
                                className="w-full rounded border p-2"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                            />
                        </div>

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
                                <button className="rounded bg-gray-200 px-4 py-2" onClick={() => setOpen(false)}>
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
