export type TimeValue = string; // "HH:MM" e.g. "09:30", "24:00"

export const START_TIME_SLOTS: TimeValue[] = Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2);
    const minute = i % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${minute}`;
});

export const END_TIME_SLOTS: TimeValue[] = [
    ...Array.from({ length: 47 }, (_, i) => {
        const totalMinutes = (i + 1) * 30;
        const hour = Math.floor(totalMinutes / 60);
        const minute = totalMinutes % 60;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }),
    '24:00',
];

export function timeToMinutes(time: TimeValue): number {
    if (time === '24:00') return 24 * 60;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

export function formatDisplayTime(time: TimeValue): string {
    if (time === '24:00') return '자정';
    const [hourStr, minuteStr] = time.split(':');
    const hour = parseInt(hourStr, 10);
    if (hour < 12) {
        const displayHour = hour === 0 ? 12 : hour;
        return `오전 ${displayHour}:${minuteStr}`;
    }
    const displayHour = hour === 12 ? 12 : hour - 12;
    return `오후 ${displayHour}:${minuteStr}`;
}

export function getDurationLabel(start: TimeValue, end: TimeValue): string {
    const diff = timeToMinutes(end) - timeToMinutes(start);
    if (diff <= 0) return '';
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    if (hours === 0) return `${minutes}분`;
    if (minutes === 0) return `${hours}시간`;
    return `${hours}시간 ${minutes}분`;
}

export function formatEndTimeWithDuration(start: TimeValue, end: TimeValue): string {
    const timeStr = formatDisplayTime(end);
    const duration = getDurationLabel(start, end);
    if (!duration) return timeStr;
    return `${timeStr} (${duration})`;
}

export function getValidEndSlots(startTime: TimeValue): TimeValue[] {
    const startMin = timeToMinutes(startTime);
    return END_TIME_SLOTS.filter((slot) => timeToMinutes(slot) > startMin);
}

export function dateToTimeValue(date: Date): TimeValue {
    const hours = date.getHours();
    const rawMinutes = date.getMinutes();
    const roundedMinutes = rawMinutes < 15 ? 0 : rawMinutes < 45 ? 30 : 60;
    if (roundedMinutes === 60) {
        const nextHour = hours + 1;
        if (nextHour >= 24) return '24:00';
        return `${String(nextHour).padStart(2, '0')}:00`;
    }
    return `${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
}

export function timeValueToDate(dateStr: string, time: TimeValue): Date {
    if (time === '24:00') return new Date(`${dateStr}T23:59:59`);
    return new Date(`${dateStr}T${time}:00`);
}

export function isAllDayEvent(startAt: string, endAt: string): boolean {
    const start = new Date(startAt);
    const end = new Date(endAt);
    return start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 23 && end.getMinutes() === 59;
}
