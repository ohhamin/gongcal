'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';

import { supabase } from '@/lib/supabase';

export default function Home() {
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) router.push('/login');
        });
    }, [router]);

    const handleDateClick = (info: DateClickArg) => {
        router.push(`/day/${info.dateStr}`);
    };

    return (
        <div className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-5 flex items-center justify-between">
                <h1 className="text-2xl font-bold">우리캘린더</h1>

                <button className="rounded bg-black px-4 py-2 text-white" onClick={() => router.push('/friends')}>
                    친구
                </button>
            </div>
            <main className="p-5">
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
            </main>
        </div>
    );
}
