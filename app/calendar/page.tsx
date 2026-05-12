'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';

import CalendarLoading from '@/components/CalendarLoading';
import GroupSelector from '@/components/GroupSelector';
import { useCurrentUser } from '@/lib/useCurrentProfile';

export default function Home() {
    const router = useRouter();
    const currentUserQuery = useCurrentUser();
    const [isCalendarLoading, setIsCalendarLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setIsCalendarLoading(false), 1000);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!currentUserQuery.isLoading && !currentUserQuery.data) {
            router.push('/login');
        }
    }, [currentUserQuery.data, currentUserQuery.isLoading, router]);

    const handleDateClick = (info: DateClickArg) => {
        router.push(`/day/${info.dateStr}`);
    };

    return (
        <div className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-5 flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold">우리캘린더</h1>
                <GroupSelector />
            </div>
            <main className="p-5">
                {isCalendarLoading || currentUserQuery.isLoading ? (
                    <CalendarLoading />
                ) : (
                    <FullCalendar
                        plugins={[dayGridPlugin, interactionPlugin]}
                        initialView="dayGridMonth"
                        headerToolbar={{
                            left: 'prev,next',
                            center: 'title',
                            right: '',
                        }}
                        height="auto"
                        contentHeight="auto"
                        dateClick={handleDateClick}
                        expandRows={true}
                    />
                )}
            </main>
        </div>
    );
}
