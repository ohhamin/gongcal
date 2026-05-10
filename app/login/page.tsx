'use client';

import { supabase } from '@/lib/supabase';

export default function LoginPage() {
    const handleGoogleLogin = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow">
                <h1 className="mb-6 text-center text-3xl font-bold">Gong Calendar</h1>

                <button className="w-full rounded-lg bg-black py-3 text-white" onClick={handleGoogleLogin}>
                    Google 로그인
                </button>
            </div>
        </main>
    );
}
