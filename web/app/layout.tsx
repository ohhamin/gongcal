import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import BottomNavigation from '@/components/BottomNavigation';
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

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko">
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                <QueryProvider>
                    <main className="min-h-screen bg-[var(--oc-bg)] px-3 pt-4 pb-24 sm:px-5">
                        <div className="mx-auto w-full max-w-5xl">{children}</div>
                    </main>
                    <PushTokenRegistrar />
                    <BottomNavigation />
                </QueryProvider>
            </body>
        </html>
    );
}
