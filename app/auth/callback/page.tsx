'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const load = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                router.push('/login');
                return;
            }

            // profile 조회
            let { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

            // 없으면 생성
            if (!profile) {
                const { data } = await supabase
                    .from('profiles')
                    .insert({
                        id: user.id,
                        email: user.email,
                    })
                    .select()
                    .single();

                profile = data;
            }

            // nickname 없으면 설정 페이지
            if (!profile.nickname) {
                router.push('/setup-profile');
                return;
            }

            router.push('/calendar');
        };

        load();
    }, []);

    return <div className="p-10">로그인 처리중...</div>;
}
