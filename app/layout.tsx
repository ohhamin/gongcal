import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import BottomNavigation from '@/components/BottomNavigation';
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
                <main className="min-h-screen bg-gray-50 p-5 pb-20">
                    <div className="mx-auto max-w-5xl">{children}</div>
                </main>
                <BottomNavigation />
            </body>
        </html>
    );
}
