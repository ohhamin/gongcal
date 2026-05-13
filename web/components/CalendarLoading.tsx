type Props = {
    message?: string;
};

export default function CalendarLoading({ message = '캘린더를 불러오는 중입니다.' }: Props) {
    return (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border bg-white p-8 text-gray-600">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
            <p className="text-sm font-semibold">{message}</p>
        </div>
    );
}
