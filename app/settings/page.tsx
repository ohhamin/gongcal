'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const handleLogout = async () => {
        const ok = confirm('로그아웃할까요?');

        if (!ok) return;

        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error(error);
            alert('로그아웃 실패');
            return;
        }

        queryClient.clear();
        router.push('/login');
    };

    return (
        <main className="relative min-h-[520px] rounded-2xl bg-white p-5 shadow">
            <h1 className="mb-4 text-2xl font-bold">설정</h1>
            <p className="text-gray-700">설정 페이지입니다.</p>

            <button className="absolute right-5 bottom-5 rounded bg-red-500 px-4 py-2 text-white" onClick={handleLogout}>
                로그아웃
            </button>
        </main>
    );
}
