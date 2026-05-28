type Props = {
    message?: string;
};

const loadingDays = ['월', '화', '수', '목', '금'];

export default function CalendarLoading({ message = '캘린더를 불러오는 중입니다.' }: Props) {
    return (
        <div
            className="relative flex min-h-[420px] overflow-hidden rounded-[2rem] border border-rose-100 bg-gradient-to-br from-rose-50 via-white to-sky-50 p-8 text-gray-700 shadow-sm"
            role="status"
            aria-live="polite"
        >
            <div className="pointer-events-none absolute -left-10 top-8 h-28 w-28 rounded-full bg-pink-200/40 blur-2xl" />
            <div className="pointer-events-none absolute -right-8 bottom-6 h-32 w-32 rounded-full bg-sky-200/50 blur-2xl" />
            <div className="pointer-events-none absolute right-10 top-10 animate-bounce text-2xl" aria-hidden="true">
                ✨
            </div>

            <div className="relative mx-auto flex w-full max-w-sm flex-col items-center justify-center text-center">
                <div className="relative mb-5 flex h-28 w-28 items-center justify-center">
                    <div className="absolute inset-0 animate-pulse rounded-[2rem] bg-white shadow-lg shadow-rose-100" />
                    <div className="absolute -top-2 left-6 h-5 w-3 rounded-full bg-rose-300" />
                    <div className="absolute -top-2 right-6 h-5 w-3 rounded-full bg-rose-300" />
                    <div className="relative grid h-20 w-20 grid-cols-3 gap-1 rounded-2xl border border-rose-100 bg-white p-3 shadow-inner">
                        {Array.from({ length: 9 }).map((_, index) => (
                            <span
                                key={index}
                                className={`rounded-md ${index === 4 ? 'animate-ping bg-rose-300' : 'bg-rose-100'} ${index === 8 ? 'bg-sky-200' : ''}`}
                            />
                        ))}
                    </div>
                    <div className="absolute -bottom-1 right-1 flex h-10 w-10 animate-bounce items-center justify-center rounded-full bg-amber-100 text-xl shadow-md" aria-hidden="true">
                        🐾
                    </div>
                </div>

                <p className="text-base font-bold text-gray-800">{message}</p>
                <p className="mt-2 text-sm text-gray-500">친구들의 일정을 폭신하게 정리하는 중이에요.</p>

                <div className="mt-5 flex gap-2" aria-hidden="true">
                    {loadingDays.map((day, index) => (
                        <span
                            key={day}
                            className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-rose-400 shadow-sm shadow-rose-100 ${
                                index % 2 === 0 ? 'animate-bounce' : 'animate-pulse'
                            }`}
                        >
                            {day}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
