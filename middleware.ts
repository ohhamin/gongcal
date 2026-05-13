import { type NextRequest } from 'next/server';

import { authProxy } from './proxy';

export async function middleware(request: NextRequest) {
    return authProxy(request);
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
