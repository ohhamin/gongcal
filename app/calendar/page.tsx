'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';

import CalendarLoading from '@/components/CalendarLoading';
import GroupSelector from '@/components/GroupSelector';
import { supabase } from '@/lib/supabase';

export default function Home() {
    const router = useRouter();
    const [isCalendarLoading, setIsCalendarLoading] = useState(true);

    useEffect(() => {
        const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));
        const authCheck = supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) router.push('/login');
        });

        Promise.all([minimumLoadingTime, authCheck]).finally(() => setIsCalendarLoading(false));
    }, [router]);

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
                {isCalendarLoading ? (
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
