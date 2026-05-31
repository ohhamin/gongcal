import { supabase } from '@/lib/supabase';

export type PushNotificationType = 'friend_request' | 'event_invite' | 'group_request';

export type CreatePushNotificationInput = {
    profileId: string;
    type: PushNotificationType;
    title: string;
    message: string;
    relatedId?: number | null;
};

// 알림 저장과 FCM 발송은 서버에서 service role / Firebase credentials로 처리합니다.
// 서버 환경변수가 비어 있어도 기존 알림 저장은 유지되도록 클라이언트 insert fallback을 둡니다.
export async function createNotificationWithPush(input: CreatePushNotificationInput) {
    const {
        data: { session },
    } = await supabase.auth.getSession();

    try {
        const response = await fetch('/api/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify(input),
        });

        if (response.ok) return;

        console.error('Notification push API failed', await response.text());
    } catch (error) {
        console.error('Notification push API failed', error);
    }

    const { error } = await supabase.from('notifications').insert({
        profile_id: input.profileId,
        type: input.type,
        title: input.title,
        message: input.message,
        related_id: input.relatedId ?? null,
    });

    if (error) console.error(error);
}
