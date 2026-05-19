'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/useCurrentProfile';

type NotificationType = 'event_invite' | 'friend_request' | string;

type NotificationItem = {
    id: number;
    type: NotificationType;
    title: string;
    message: string | null;
    is_read: boolean;
    related_id: number | null;
    created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
    event_invite: '일정 초대',
    friend_request: '친구 요청',
};

export default function NotificationsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const myProfileQuery = useMyProfile();
    const profileId = myProfileQuery.data?.id;

    const notificationsQuery = useQuery({
        queryKey: ['notifications', 'list', profileId],
        queryFn: async () => {
            if (!profileId) return [];

            const { data, error } = await supabase
                .from('notifications')
                .select('id, type, title, message, is_read, related_id, created_at')
                .eq('profile_id', profileId)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            return (data || []) as NotificationItem[];
        },
        enabled: Boolean(profileId),
    });

    const notifications = useMemo(() => notificationsQuery.data || [], [notificationsQuery.data]);

    useEffect(() => {
        if (!profileId || !notifications.some((notification) => !notification.is_read)) return;

        const markUnreadAsRead = async () => {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('profile_id', profileId)
                .eq('is_read', false);

            if (error) {
                console.error(error);
                return;
            }

            queryClient.setQueryData<NotificationItem[]>(['notifications', 'list', profileId], (current) => {
                return current?.map((notification) => ({ ...notification, is_read: true })) || current;
            });
            await queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
        };

        markUnreadAsRead();
    }, [notifications, profileId, queryClient]);

    return (
        <main className="min-h-screen bg-gray-50">
            <div className="mb-5 flex items-center gap-3">
                <button className="rounded-full bg-white px-4 py-2 text-xl shadow-sm ring-1 ring-black/10" onClick={() => router.back()} aria-label="이전 페이지로 이동">
                    &lt;
                </button>
                <h1 className="text-2xl font-bold">알림</h1>
            </div>

            <div className="space-y-3">
                {notificationsQuery.isLoading && <p className="rounded-xl border bg-white p-4 text-sm text-gray-500">알림을 불러오는 중입니다.</p>}

                {notificationsQuery.isError && <p className="rounded-xl border bg-white p-4 text-sm text-red-500">알림을 불러오지 못했습니다.</p>}

                {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 && (
                    <p className="rounded-xl border bg-white p-4 text-sm text-gray-500">알림이 없습니다.</p>
                )}

                {notifications.map((notification) => (
                    <div key={notification.id} className="relative grid grid-cols-[2fr_8fr] gap-3 rounded-xl border bg-white p-4 shadow-sm">
                        {!notification.is_read && <span className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />}
                        <div className="flex items-center justify-center rounded-lg bg-gray-100 px-2 py-3 text-center text-xs font-semibold text-gray-600">
                            {TYPE_LABEL[notification.type] || notification.type}
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{notification.title}</p>
                            {notification.message && <p className="mt-1 text-sm text-gray-500">{notification.message}</p>}
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}
