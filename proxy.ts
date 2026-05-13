import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 인증 없이 접근 가능한 공개 경로
const PUBLIC_PATHS = ['/login', '/auth/callback'];

// 로그인 필요 보호 경로
const PROTECTED_PATHS = ['/calendar', '/day', '/friends', '/groups', '/settings', '/setup-profile'];

export async function authProxy(request: NextRequest) {
    let response = NextResponse.next({ request });
    const { pathname } = request.nextUrl;

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // 세션 쿠키를 최신 상태로 유지 (getUser는 JWT를 서버에서 검증함)
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // 로그인 상태에서 루트(/) 또는 /login 접근 시 → /calendar로 이동
    if (user && (pathname === '/' || pathname === '/login')) {
        return NextResponse.redirect(new URL('/calendar', request.url));
    }

    // 비로그인 상태에서 보호된 경로 접근 시 → /login으로 이동
    if (!user && PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return response;
}
