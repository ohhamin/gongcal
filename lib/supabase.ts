import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseKey, {
    auth: {
        // 같은 기기/브라우저에서는 localStorage에 세션을 보관하고 만료 전 자동 갱신합니다.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});
