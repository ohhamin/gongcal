'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/useCurrentProfile';

type NotificationType = 'event_invite' | 'friend_request' | 'group_request' | string;

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
    group_request: '그룹 초대',
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
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always',
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

            await queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
        };

        markUnreadAsRead();
    }, [notifications, profileId, queryClient]);

    return (
        <main className="min-h-screen bg-[var(--oc-bg)] px-[5vw] pt-4 text-[var(--oc-text)]">
            <div className="mb-5 flex items-center gap-3">
                <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-xl font-bold shadow-sm ring-1 ring-[var(--oc-divider)]" onClick={() => router.back()} aria-label="이전 페이지로 이동">
                    ‹
                </button>
                <div>
                    <h1 className="text-2xl font-extrabold tracking-[-0.04em]">알림</h1>
                    <p className="mt-1 text-xs tracking-[-0.01em] text-[var(--oc-text-secondary)]">초대와 요청을 한눈에 확인해요.</p>
                </div>
            </div>

            <div className="space-y-3 pb-6">
                {notificationsQuery.isLoading && <p className="rounded-2xl border border-[var(--oc-divider)] bg-white p-5 text-sm text-[var(--oc-text-secondary)] shadow-sm">알림을 불러오는 중입니다.</p>}

                {notificationsQuery.isError && <p className="rounded-2xl border border-red-100 bg-white p-5 text-sm font-semibold text-red-500 shadow-sm">알림을 불러오지 못했습니다.</p>}

                {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 && (
                    <div className="rounded-2xl border border-[var(--oc-divider)] bg-white p-8 text-center shadow-sm">
                        <p className="text-sm font-bold text-[var(--oc-text)]">알림이 없습니다.</p>
                        <p className="mt-1 text-xs text-[var(--oc-text-secondary)]">새로운 초대가 오면 여기에 표시됩니다.</p>
                    </div>
                )}

                {notifications.map((notification) => (
                    <div key={notification.id} className="relative flex gap-3 rounded-2xl border border-[var(--oc-divider)] bg-white p-4 shadow-[0_1px_2px_rgba(11,15,31,0.04)]">
                        {!notification.is_read && <span className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-hidden="true" />}
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--oc-tint)] text-sm font-extrabold text-[var(--oc-primary)]" aria-hidden="true">
                            {(TYPE_LABEL[notification.type] || notification.type).slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                                <span className="rounded-full bg-[var(--oc-surface-2)] px-2 py-1 text-[11px] font-bold text-[var(--oc-text-secondary)]">
                                    {TYPE_LABEL[notification.type] || notification.type}
                                </span>
                            </div>
                            <p className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-[var(--oc-text)]">{notification.title}</p>
                            {notification.message && <p className="mt-1 text-sm leading-5 text-[var(--oc-text-secondary)]">{notification.message}</p>}
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}
