'use client';

import { useRouter } from 'next/navigation';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';

import GroupSelector from '@/components/GroupSelector';

export default function Home() {
    const router = useRouter();

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
