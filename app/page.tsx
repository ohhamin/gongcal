'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import CalendarLoading from '@/components/CalendarLoading';
import { supabase } from '@/lib/supabase';

export default function Home() {
    const router = useRouter();

    useEffect(() => {
        const routeBySession = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            router.replace(session ? '/calendar' : '/login');
        };

        routeBySession();
    }, [router]);

    return <CalendarLoading message="자동 로그인을 확인하는 중입니다." />;
}
