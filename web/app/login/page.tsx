'use client';

import { supabase } from '@/lib/supabase';

export default function LoginPage() {
    const handleKakaoLogin = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'kakao',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                scopes: 'profile_nickname',
            },
        });
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow">
                <h1 className="mb-6 text-center text-3xl font-bold">OURCAL</h1>

                <button className="mt-3 w-full rounded-lg bg-black py-3 text-white" onClick={handleKakaoLogin}>
                    카카오로 시작하기
                </button>
            </div>
        </main>
    );
}
