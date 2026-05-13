'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import CalendarLoading from '@/components/CalendarLoading';
import { supabase } from '@/lib/supabase';

// 서버 미들웨어(proxy.ts)가 인증된 사용자를 /calendar로, 미인증 사용자를 /login으로 리다이렉트합니다.
// 이 페이지는 클라이언트 사이드 내비게이션 폴백용입니다.
export default function Home() {
    const router = useRouter();

    useEffect(() => {
        let isMounted = true;

        const redirect = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!isMounted) return;
            router.replace(user ? '/calendar' : '/login');
        };

        redirect();

        return () => {
            isMounted = false;
        };
    }, [router]);

    return <CalendarLoading message="자동 로그인을 확인하는 중입니다." />;
}
