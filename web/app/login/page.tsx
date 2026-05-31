'use client';

import { supabase } from '@/lib/supabase';

type OAuthProvider = 'kakao' | 'google';

export default function LoginPage() {
    const handleOAuthLogin = async (provider: OAuthProvider) => {
        await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                ...(provider === 'kakao' ? { scopes: 'profile_nickname' } : {}),
            },
        });
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow">
                <h1 className="mb-6 text-center text-3xl font-bold">OURCAL</h1>

                <div className="space-y-3">
                    <button
                        className="w-full rounded-lg bg-[#FEE500] py-3 font-semibold text-[#191919] transition hover:brightness-95"
                        onClick={() => handleOAuthLogin('kakao')}
                    >
                        카카오로 시작하기
                    </button>
                    <button
                        className="w-full rounded-lg border border-gray-200 bg-white py-3 font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
                        onClick={() => handleOAuthLogin('google')}
                    >
                        Google로 시작하기
                    </button>
                </div>
            </div>
        </main>
    );
}
