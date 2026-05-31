'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/useCurrentProfile';

const NATIVE_FCM_TOKEN_STORAGE_KEY = 'ourcal:fcm-token';
const NATIVE_FCM_TOKEN_EVENT = 'ourcal:fcm-token-updated';

type NativeFcmTokenPayload = {
    token?: string;
    platform?: string;
    appVersion?: string;
    deviceLabel?: string;
    updatedAt?: string;
};

function normalizePlatform(platform: string | undefined) {
    if (platform === 'android' || platform === 'ios' || platform === 'web') {
        return platform;
    }

    return 'unknown';
}

function readNativeFcmTokenSnapshot() {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(NATIVE_FCM_TOKEN_STORAGE_KEY) ?? '';
}

function parseNativeFcmToken(raw: string) {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as NativeFcmTokenPayload;
        return parsed.token ? parsed : null;
    } catch {
        return null;
    }
}

function subscribeNativeFcmToken(onStoreChange: () => void) {
    window.addEventListener(NATIVE_FCM_TOKEN_EVENT, onStoreChange);
    window.addEventListener('storage', onStoreChange);

    return () => {
        window.removeEventListener(NATIVE_FCM_TOKEN_EVENT, onStoreChange);
        window.removeEventListener('storage', onStoreChange);
    };
}

export default function PushTokenRegistrar() {
    const { data: profile } = useMyProfile();
    const nativeTokenRaw = useSyncExternalStore(
        subscribeNativeFcmToken,
        readNativeFcmTokenSnapshot,
        () => '',
    );
    const nativeToken = parseNativeFcmToken(nativeTokenRaw);

    useEffect(() => {
        const registerToken = async () => {
            if (!profile?.id || !nativeToken?.token) return;

            const { error } = await supabase.from('push_tokens').upsert(
                {
                    profile_id: profile.id,
                    token: nativeToken.token,
                    platform: normalizePlatform(nativeToken.platform),
                    app_version: nativeToken.appVersion ?? null,
                    device_label: nativeToken.deviceLabel ?? null,
                    disabled_at: null,
                    last_seen_at: new Date().toISOString(),
                },
                { onConflict: 'token' },
            );

            if (error) {
                // 푸시 토큰 등록 실패가 앱 사용 자체를 막으면 안 됩니다.
                console.warn('FCM token registration failed', error);
            }
        };

        void registerToken();
    }, [nativeToken, profile?.id]);

    return null;
}
