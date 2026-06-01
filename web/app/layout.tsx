import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import BottomNavigation from '@/components/BottomNavigation';
import ButtonDebounceGuard from '@/components/ButtonDebounceGuard';
import PushTokenRegistrar from '@/components/PushTokenRegistrar';
import QueryProvider from '@/components/QueryProvider';
import './globals.css';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'OURCAL',

    manifest: '/manifest.json',

    icons: {
        apple: '/icon-192.png',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko">
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                <QueryProvider>
                    <main className="min-h-[100dvh] bg-[var(--oc-bg)] pt-[calc(env(safe-area-inset-top)+5vh)] pb-[var(--oc-nav-height)]">
                        <div className="w-full">{children}</div>
                    </main>
                    <PushTokenRegistrar />
                    <ButtonDebounceGuard />
                    <BottomNavigation />
                </QueryProvider>
            </body>
        </html>
    );
}
