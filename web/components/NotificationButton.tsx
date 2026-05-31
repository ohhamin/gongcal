'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/useCurrentProfile';

type Props = {
    className?: string;
};

export default function NotificationButton({ className }: Props) {
    const myProfileQuery = useMyProfile();
    const profileId = myProfileQuery.data?.id;

    const unreadQuery = useQuery({
        // 페이지를 이동할 때마다 DB를 다시 조회해 알림 페이지에서 읽음 처리한 상태가 즉시 반영되게 합니다.
        queryKey: ['notifications', 'unread', profileId],
        queryFn: async () => {
            if (!profileId) return false;

            const { data, error } = await supabase
                .from('notifications')
                .select('id')
                .eq('profile_id', profileId)
                .eq('is_read', false)
                .limit(1);

            if (error) {
                console.error(error);
                return false;
            }

            return (data || []).length > 0;
        },
        enabled: Boolean(profileId),
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
    });

    return (
        <Link
            href="/notifications"
            className={className || 'relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--oc-surface-2)] text-base ring-1 ring-[var(--oc-divider)]'}
            title="알림"
            aria-label="알림"
        >
            <span aria-hidden="true">🔔</span>
            {unreadQuery.data && <span className="absolute top-1 left-1 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white" aria-hidden="true" />}
        </Link>
    );
}
