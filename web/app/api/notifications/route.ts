import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { sendFcmToTokens } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

type NotificationType = 'friend_request' | 'event_invite' | 'group_request';

type NotificationRequestBody = {
    profileId?: string;
    type?: NotificationType;
    title?: string;
    message?: string;
    relatedId?: number | null;
};

type NotificationRow = {
    id: number;
    profile_id: string;
    type: NotificationType;
    title: string;
    message: string;
    related_id: number | null;
};

const ALLOWED_TYPES = new Set<NotificationType>(['friend_request', 'event_invite', 'group_request']);

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase admin credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

function badRequest(message: string) {
    return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
    const authorization = request.headers.get('authorization');
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;

    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as NotificationRequestBody | null;

    if (!body?.profileId) return badRequest('profileId is required.');
    if (!body.type || !ALLOWED_TYPES.has(body.type)) return badRequest('Unsupported notification type.');
    if (!body.title?.trim()) return badRequest('title is required.');
    if (!body.message?.trim()) return badRequest('message is required.');

    const supabaseAdmin = getSupabaseAdmin();
    const {
        data: { user },
        error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: notification, error: notificationError } = await supabaseAdmin
        .from('notifications')
        .insert({
            profile_id: body.profileId,
            type: body.type,
            title: body.title.trim(),
            message: body.message.trim(),
            related_id: body.relatedId ?? null,
        })
        .select('id, profile_id, type, title, message, related_id')
        .single<NotificationRow>();

    if (notificationError || !notification) {
        console.error(notificationError);
        return NextResponse.json({ error: 'Failed to create notification.' }, { status: 500 });
    }

    const { data: pushTokens, error: pushTokenError } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('profile_id', notification.profile_id)
        .is('disabled_at', null);

    if (pushTokenError) {
        console.error(pushTokenError);
        return NextResponse.json({ notificationId: notification.id, push: { successCount: 0, failureCount: 0 } });
    }

    try {
        const push = await sendFcmToTokens(notification, pushTokens || []);
        return NextResponse.json({ notificationId: notification.id, push });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ notificationId: notification.id, push: { successCount: 0, failureCount: 0 } });
    }
}
