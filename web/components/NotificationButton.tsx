'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/useCurrentProfile';

const HIDDEN_PREFIXES = ['/login', '/auth', '/setup-profile'];

export default function NotificationButton() {
    const pathname = usePathname();
    const myProfileQuery = useMyProfile();
    const profileId = myProfileQuery.data?.id;

    const unreadQuery = useQuery({
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
        enabled: Boolean(profileId),
        staleTime: 1000 * 10,
    });

    if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return null;
    }

    return (
        <Link
            href="/notifications"
            className="fixed top-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl shadow-md ring-1 ring-black/10"
            title="알림"
            aria-label="알림"
        >
            <span aria-hidden="true">🔔</span>
            {unreadQuery.data && <span className="absolute top-1 left-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-hidden="true" />}
        </Link>
    );
}
