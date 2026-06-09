'use client';

import { appAlert } from '@/components/AppDialogProvider';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';

declare global {
    interface Window {
        OurcalNative?: {
            postMessage: (message: string) => void;
        };
    }
}

async function requestNotificationPermission() {
    if (typeof window === 'undefined') return;

    if (window.OurcalNative?.postMessage) {
        window.OurcalNative.postMessage(JSON.stringify({ type: 'requestNotificationPermission' }));
        return;
    }

    if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }
}

export default function PermissionsPage() {
    const router = useRouter();
    const [notificationChecked, setNotificationChecked] = useState(true);
    const [saving, setSaving] = useState(false);

    const handleContinue = async () => {
        setSaving(true);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            router.push('/login');
            return;
        }

        if (notificationChecked) {
            try {
                await requestNotificationPermission();
            } catch (error) {
                // 선택 권한이므로 실패해도 가입 진행은 막지 않습니다.
                console.warn('Notification permission request failed', error);
            }
        }

        const { error } = await supabase
            .from('profiles')
            .update({
                permissions_onboarding_completed: true,
                schedule_30m_push_enabled: notificationChecked,
            })
            .eq('id', user.id);

        setSaving(false);

        if (error) {
            console.error(error);
            await appAlert('권한 설정 저장 실패');
            return;
        }

        router.push('/calendar');
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50 px-5">
            <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-sm ring-1 ring-black/5">
                <p className="mb-2 text-xs font-bold tracking-[0.08em] text-[var(--oc-primary)]">APP PERMISSIONS</p>
                <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-[var(--oc-text)]">앱 접근 권한 안내</h1>
                <p className="mt-2 text-sm leading-5 text-[var(--oc-text-secondary)]">
                    OURCAL 사용에 필요한 권한을 확인해주세요. 알림은 선택 권한이며, 허용하지 않아도 앱을 사용할 수 있습니다.
                </p>

                <section className="mt-6 rounded-2xl border border-[var(--oc-divider)] bg-[var(--oc-surface-2)] p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                        <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 accent-[var(--oc-primary)]"
                            checked={notificationChecked}
                            onChange={(event) => setNotificationChecked(event.target.checked)}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-[var(--oc-text)]">알림 권한 <span className="font-medium text-[var(--oc-text-secondary)]">(선택)</span></span>
                            <span className="mt-1 block text-xs leading-5 text-[var(--oc-text-secondary)]">
                                친구 요청, 일정 초대, 일정 시작 전 리마인더를 푸시 알림으로 받을 수 있습니다.
                            </span>
                        </span>
                    </label>
                </section>

                <p className="mt-4 text-[11px] leading-4 text-[var(--oc-text-tertiary)]">
                    체크한 상태로 계속하면 기기의 알림 허용 팝업이 표시됩니다. 나중에 설정 페이지에서도 일정 30분 전 알림을 켜고 끌 수 있습니다.
                </p>

                <button
                    className="mt-6 w-full rounded-2xl bg-black py-3.5 text-sm font-bold text-white disabled:bg-gray-300"
                    onClick={handleContinue}
                    disabled={saving}
                >
                    {saving ? '저장 중...' : '계속하기'}
                </button>
            </div>
        </main>
    );
}
