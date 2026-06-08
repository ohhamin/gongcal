'use client';

import Image from 'next/image';
import { useState } from 'react';

import OurcalSplash from '@/components/OurcalSplash';
import { supabase } from '@/lib/supabase';

type OAuthProvider = 'kakao' | 'google';

export default function LoginPage() {
    const [signingProvider, setSigningProvider] = useState<OAuthProvider | null>(null);

    const handleOAuthLogin = async (provider: OAuthProvider) => {
        if (signingProvider) return;
        setSigningProvider(provider);

        try {
            await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                    ...(provider === 'kakao' ? { scopes: 'profile_nickname' } : {}),
                },
            });
        } finally {
            setSigningProvider(null);
        }
    };

    return (
        <main className="fixed inset-0 flex h-screen w-screen items-center justify-center overflow-hidden bg-[var(--oc-bg)] px-5 text-[var(--oc-text)]">
            <div className="pointer-events-none absolute -left-16 top-8 h-36 w-36 rounded-full bg-[var(--oc-tint)] blur-3xl" />
            <div className="pointer-events-none absolute -right-14 bottom-20 h-40 w-40 rounded-full bg-blue-100/70 blur-3xl" />

            <div className="relative mx-auto flex max-h-screen w-full max-w-sm flex-col justify-center py-[clamp(10px,2vh,24px)]">
                <section className="mb-[clamp(12px,3vh,28px)] text-center">
                    <div className="mx-auto grid h-[clamp(64px,10vh,88px)] w-[clamp(64px,10vh,88px)] place-items-center rounded-[24px] bg-[var(--oc-primary)] shadow-[0_14px_34px_rgba(30,58,138,0.32)]">
                        <Image src="/logo_white_256.png" alt="OURCAL" width={52} height={52} priority />
                    </div>
                    <h1 className="mt-[clamp(12px,2.4vh,24px)] text-[clamp(24px,4vh,30px)] font-extrabold tracking-[-0.05em]">우리캘린더</h1>
                    <p className="mt-1.5 text-[clamp(12px,1.9vh,14px)] leading-[1.55] tracking-[-0.01em] text-[var(--oc-text-secondary)]">
                        우리만의 일정을 함께 보고,
                        <br />초대와 약속을 가볍게 관리해요.
                    </p>
                </section>

                <section className="rounded-[24px] border border-[var(--oc-divider)] bg-white p-[clamp(12px,2vh,18px)] shadow-[var(--oc-elevation)]">
                    <div className="mb-[clamp(12px,2vh,20px)] rounded-2xl bg-[var(--oc-surface-2)] px-4 py-[clamp(9px,1.7vh,12px)]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--oc-primary)]">Start with</p>
                        <p className="mt-1 text-[clamp(12px,1.9vh,14px)] font-semibold tracking-[-0.02em] text-[var(--oc-text-secondary)]">소셜 계정으로 바로 시작하세요.</p>
                    </div>

                    <div className="space-y-[clamp(8px,1.6vh,12px)]">
                        <button
                            className="flex h-[clamp(42px,6.4vh,50px)] w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] px-4 text-[15px] font-extrabold tracking-[-0.02em] text-[#191919] shadow-[0_6px_18px_rgba(25,25,25,0.08)] transition active:scale-[0.99] disabled:opacity-60"
                            onClick={() => handleOAuthLogin('kakao')}
                            disabled={Boolean(signingProvider)}
                        >
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#191919] text-xs font-black text-[#FEE500]">K</span>
                            카카오로 시작하기
                        </button>
                        <button
                            className="flex h-[clamp(42px,6.4vh,50px)] w-full items-center justify-center gap-2 rounded-2xl border border-[var(--oc-divider-strong)] bg-white px-4 text-[15px] font-extrabold tracking-[-0.02em] text-[var(--oc-text)] shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                            onClick={() => handleOAuthLogin('google')}
                            disabled={Boolean(signingProvider)}
                        >
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--oc-surface-2)] text-xs font-black text-[var(--oc-primary)]">G</span>
                            Google로 시작하기
                        </button>
                    </div>
                </section>

                <p className="mt-[clamp(12px,2.8vh,24px)] text-center text-[10.5px] leading-4 tracking-[-0.01em] text-[var(--oc-text-tertiary)]">
                    로그인하면 OURCAL의 서비스 이용약관과 개인정보 처리방침에 동의한 것으로 간주됩니다.
                </p>
            </div>

            {signingProvider && (
                <div className="fixed inset-0 z-20 bg-white/95 backdrop-blur-sm">
                    <OurcalSplash message={`${signingProvider === 'kakao' ? '카카오' : 'Google'} 로그인을 준비하는 중입니다.`} compact />
                </div>
            )}
        </main>
    );
}
