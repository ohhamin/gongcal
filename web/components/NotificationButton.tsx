'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/useCurrentProfile';

const HIDDEN_PREFIXES = ['/login', '/auth', '/setup-profile', '/notifications'];

export default function NotificationButton() {
    const pathname = usePathname();
    const myProfileQuery = useMyProfile();
    const profileId = myProfileQuery.data?.id;

    const isHiddenPage = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    const unreadQuery = useQuery({
        // 페이지를 이동할 때마다 DB를 다시 조회해 알림 페이지에서 읽음 처리한 상태가 즉시 반영되게 합니다.
        queryKey: ['notifications', 'unread', profileId, pathname],
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
        enabled: Boolean(profileId) && !isHiddenPage,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
    });

    if (isHiddenPage) {
        return null;
    }

    return (
        <Link
            href="/notifications"
            className="fixed top-3 right-3 z-50 flex h-7 w-7 items-center justify-center rounded-full bg-white text-base shadow-md ring-1 ring-black/10"
            title="알림"
            aria-label="알림"
        >
            <span aria-hidden="true">🔔</span>
            {unreadQuery.data && <span className="absolute top-0.5 left-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white" aria-hidden="true" />}
        </Link>
    );
}
