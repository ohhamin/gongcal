'use client';

import { appAlert } from '@/components/AppDialogProvider';
import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';

export default function SetupProfilePage() {
    const router = useRouter();

    const [nickname, setNickname] = useState('');

    const handleSave = async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        if (nickname.length < 1) {
            await appAlert('닉네임을 입력해주세요.');
            return;
        }

        if (nickname.length > 5) {
            await appAlert('닉네임은 5자 이하만 가능합니다.');
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .update({
                nickname,
            })
            .eq('id', user.id);

        if (error) {
            await appAlert('이미 사용중인 닉네임입니다.');
            return;
        }

        router.push('/calendar');
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow">
                <h1 className="mb-6 text-2xl font-bold">닉네임 설정</h1>

                <input
                    className="mb-4 w-full rounded border p-3"
                    placeholder="닉네임 입력"
                    value={nickname}
                    maxLength={5}
                    onChange={(e) => setNickname(e.target.value)}
                />

                <button className="w-full rounded bg-black py-3 text-white" onClick={handleSave}>
                    시작하기
                </button>
            </div>
        </main>
    );
}
