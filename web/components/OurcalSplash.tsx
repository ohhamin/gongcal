import Icon from '@/components/Icon';

type Props = {
    message?: string;
    compact?: boolean;
};

export default function OurcalSplash({ message = '함께 쓰는 우리만의 캘린더', compact = false }: Props) {
    return (
        <div
            className={`relative flex ${compact ? 'min-h-full' : 'min-h-screen'} flex-col items-center justify-center overflow-hidden bg-[var(--oc-bg)] text-center text-[var(--oc-text)]`}
            role="status"
            aria-live="polite"
        >
            <div className="pointer-events-none absolute left-8 top-16 h-28 w-28 rounded-full bg-[var(--oc-tint)] blur-3xl" />
            <div className="pointer-events-none absolute bottom-14 right-6 h-32 w-32 rounded-full bg-blue-100/70 blur-3xl" />

            <div className="animate-[ourcal-splash-pop_700ms_cubic-bezier(.2,.9,.3,1.2)_both]">
                <div className="relative h-[88px] w-[88px] rounded-[22px] bg-[var(--oc-primary)] shadow-[0_12px_32px_rgba(30,58,138,0.35)]">
                    <div className="absolute left-4 top-3 h-2 w-14 rounded-full bg-white/55" />
                    <div className="absolute left-4 top-7 h-6 w-6 rounded-md bg-white" />
                    <div className="absolute left-11 top-7 h-2 w-7 rounded-full bg-white/70" />
                    <div className="absolute left-11 top-10 h-2 w-5 rounded-full bg-white/40" />
                    <div className="absolute bottom-4 left-4 h-3.5 w-14 rounded-full bg-white/85" />
                    <div className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--oc-primary)] shadow-md">
                        <Icon name="calendarFill" size={18} color="currentColor" />
                    </div>
                </div>
            </div>

            <div className="mt-7 animate-[ourcal-splash-rise_700ms_cubic-bezier(.2,.9,.3,1)_120ms_both]">
                <h1 className="text-[26px] font-bold tracking-[-0.04em]">우리캘린더</h1>
                <p className="mt-2 text-[13px] tracking-[-0.01em] text-[var(--oc-text-secondary)]">{message}</p>
            </div>

            <div className="mt-8 flex gap-2" aria-hidden="true">
                {['일', '월', '화', '수', '목'].map((day, index) => (
                    <span
                        key={day}
                        className={`grid h-8 w-8 place-items-center rounded-full bg-[var(--oc-surface-2)] text-xs font-bold text-[var(--oc-primary)] ${
                            index % 2 === 0 ? 'animate-bounce' : 'animate-pulse'
                        }`}
                    >
                        {day}
                    </span>
                ))}
            </div>

            {!compact && <p className="absolute bottom-16 text-[11px] tracking-[-0.01em] text-[var(--oc-text-tertiary)]">v 1.0.0 · ourcal team</p>}
        </div>
    );
}
