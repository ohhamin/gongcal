'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import CalendarLoading from '@/components/CalendarLoading';
import { supabase } from '@/lib/supabase';

export default function Home() {
    const router = useRouter();

    useEffect(() => {
        let isMounted = true;

        const routeBySession = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (!isMounted) return;

            if (session) {
                router.replace('/calendar');
                return;
            }

            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!isMounted) return;
            router.replace(user ? '/calendar' : '/login');
        };

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isMounted || event !== 'INITIAL_SESSION') return;
            router.replace(session ? '/calendar' : '/login');
        });

        routeBySession();

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [router]);

    return <CalendarLoading message="자동 로그인을 확인하는 중입니다." />;
}
