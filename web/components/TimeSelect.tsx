'use client';

import { formatDisplayTime, formatEndTimeWithDuration, type TimeValue } from '@/lib/timeSlots';

interface TimeSelectProps {
    value: TimeValue;
    slots: TimeValue[];
    onChange: (value: TimeValue) => void;
    startTime?: TimeValue;
    disabled?: boolean;
    placeholder?: string;
}

export default function TimeSelect({ value, slots, onChange, startTime, disabled, placeholder }: TimeSelectProps) {
    return (
        <select
            className="w-full rounded-xl border border-[var(--oc-divider-strong)] bg-white p-2.5 text-sm outline-none transition focus:border-[var(--oc-primary)] disabled:cursor-not-allowed disabled:bg-[var(--oc-surface-2)] disabled:text-[var(--oc-text-tertiary)]"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        >
            {placeholder && <option value="" disabled>{placeholder}</option>}
            {slots.map((slot) => (
                <option key={slot} value={slot}>
                    {startTime !== undefined ? formatEndTimeWithDuration(startTime, slot) : formatDisplayTime(slot)}
                </option>
            ))}
        </select>
    );
}
