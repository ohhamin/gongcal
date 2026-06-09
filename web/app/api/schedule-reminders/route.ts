import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { sendFcmToTokens } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

type CalendarEventRow = {
    id: number;
    title: string;
    detail: string | null;
    start_at: string;
    user_id: string;
};

type EventInviteRow = {
    event_id: number;
    profile_id: string;
    is_agree: boolean;
};

type ProfileReminderSettingRow = {
    id: string;
    schedule_30m_push_enabled: boolean | null;
};

type PushTokenRow = {
    profile_id: string;
    token: string;
};

const REMINDER_TYPE = 'schedule_before_30m';
const DEFAULT_WINDOW_BEFORE_MS = 29 * 60 * 1000;
const DEFAULT_WINDOW_AFTER_MS = 31 * 60 * 1000;

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

function isAuthorized(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;

    // 로컬 개발에서는 CRON_SECRET 없이도 호출할 수 있게 두되, 운영에서는 반드시 설정합니다.
    if (!cronSecret && process.env.NODE_ENV !== 'production') return true;
    if (!cronSecret) return false;

    const authorization = request.headers.get('authorization');
    const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
    const headerToken = request.headers.get('x-cron-secret');

    return bearerToken === cronSecret || headerToken === cronSecret;
}

function addMilliseconds(date: Date, milliseconds: number) {
    return new Date(date.getTime() + milliseconds);
}

function groupTokensByProfile(tokens: PushTokenRow[]) {
    const grouped = new Map<string, { token: string }[]>();

    tokens.forEach(({ profile_id, token }) => {
        const profileTokens = grouped.get(profile_id) ?? [];
        profileTokens.push({ token });
        grouped.set(profile_id, profileTokens);
    });

    return grouped;
}

export async function GET(request: NextRequest) {
    return POST(request);
}

export async function POST(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date();
    const windowStart = addMilliseconds(now, DEFAULT_WINDOW_BEFORE_MS);
    const windowEnd = addMilliseconds(now, DEFAULT_WINDOW_AFTER_MS);

    const { data: events, error: eventsError } = await supabaseAdmin
        .from('events')
        .select('id, title, detail, start_at, user_id')
        .gte('start_at', windowStart.toISOString())
        .lt('start_at', windowEnd.toISOString());

    if (eventsError) {
        console.error(eventsError);
        return NextResponse.json({ error: 'Failed to fetch events.' }, { status: 500 });
    }

    const eventRows = (events ?? []) as CalendarEventRow[];
    if (eventRows.length === 0) {
        return NextResponse.json({ checked: 0, sent: 0, skipped: 0 });
    }

    const eventIds = eventRows.map((event) => event.id);
    const { data: inviteRows, error: inviteError } = await supabaseAdmin
        .from('events_invite')
        .select('event_id, profile_id, is_agree')
        .in('event_id', eventIds)
        .eq('is_agree', true);

    if (inviteError) {
        console.error(inviteError);
        return NextResponse.json({ error: 'Failed to fetch event invites.' }, { status: 500 });
    }

    const acceptedInvitesByEventId = new Map<number, string[]>();
    ((inviteRows ?? []) as EventInviteRow[]).forEach((invite) => {
        const profileIds = acceptedInvitesByEventId.get(invite.event_id) ?? [];
        profileIds.push(invite.profile_id);
        acceptedInvitesByEventId.set(invite.event_id, profileIds);
    });

    const candidatePairs = eventRows.flatMap((event) => {
        // 일정 소유자 + 초대 수락자만 30분 전 알림 대상입니다.
        const targetProfileIds = new Set([event.user_id, ...(acceptedInvitesByEventId.get(event.id) ?? [])]);
        return Array.from(targetProfileIds).map((profileId) => ({ event, profileId }));
    });
    const targetProfileIds = Array.from(new Set(candidatePairs.map((pair) => pair.profileId)));

    const { data: enabledProfiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, schedule_30m_push_enabled')
        .in('id', targetProfileIds)
        .eq('schedule_30m_push_enabled', true);

    if (profilesError) {
        console.error(profilesError);
        return NextResponse.json({ error: 'Failed to fetch profile reminder settings.' }, { status: 500 });
    }

    const enabledProfileIds = new Set(((enabledProfiles ?? []) as ProfileReminderSettingRow[]).map((profile) => profile.id));
    const enabledPairs = candidatePairs.filter((pair) => enabledProfileIds.has(pair.profileId));

    if (enabledPairs.length === 0) {
        return NextResponse.json({ checked: eventRows.length, sent: 0, skipped: candidatePairs.length });
    }

    const { data: pushTokens, error: pushTokenError } = await supabaseAdmin
        .from('push_tokens')
        .select('profile_id, token')
        .in('profile_id', Array.from(enabledProfileIds))
        .is('disabled_at', null);

    if (pushTokenError) {
        console.error(pushTokenError);
        return NextResponse.json({ error: 'Failed to fetch push tokens.' }, { status: 500 });
    }

    const tokensByProfileId = groupTokensByProfile((pushTokens ?? []) as PushTokenRow[]);
    let sent = 0;
    let skipped = candidatePairs.length - enabledPairs.length;
    let failureCount = 0;

    for (const { event, profileId } of enabledPairs) {
        const tokens = tokensByProfileId.get(profileId) ?? [];
        if (tokens.length === 0) {
            skipped += 1;
            continue;
        }

        // 먼저 로그를 선점해 CRON 재시도/동시 실행 시 같은 일정 푸시가 중복 발송되지 않게 합니다.
        const { error: logError } = await supabaseAdmin
            .from('schedule_push_logs')
            .insert({
                schedule_id: event.id,
                profile_id: profileId,
                type: REMINDER_TYPE,
            });

        if (logError) {
            if (logError.code === '23505') {
                skipped += 1;
                continue;
            }

            console.error(logError);
            failureCount += 1;
            continue;
        }

        try {
            const push = await sendFcmToTokens(
                {
                    id: `${event.id}:${profileId}:30m`,
                    profile_id: profileId,
                    type: REMINDER_TYPE,
                    title: event.title,
                    message: event.detail?.trim() || '30분 뒤 일정이 시작됩니다.',
                    related_id: event.id,
                },
                tokens,
                {
                    path: '/calendar',
                    data: {
                        scheduleId: String(event.id),
                    },
                },
            );

            sent += push.successCount;
            failureCount += push.failureCount;
        } catch (error) {
            console.error(error);
            failureCount += tokens.length;
        }
    }

    return NextResponse.json({ checked: eventRows.length, sent, skipped, failureCount });
}
