import OurcalSplash from '@/components/OurcalSplash';

type Props = {
    message?: string;
};

export default function CalendarLoading({ message = '캘린더를 불러오는 중입니다.' }: Props) {
    return (
        <div className="h-full min-h-[360px] bg-[var(--oc-bg)]">
            <OurcalSplash message={message} compact />
        </div>
    );
}
