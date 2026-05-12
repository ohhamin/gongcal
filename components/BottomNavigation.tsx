'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
    { href: '/calendar', label: '캘린더' },
    { href: '/friends', label: '친구관리' },
    { href: '/groups', label: '그룹관리' },
    { href: '/settings', label: '설정' },
];

const HIDDEN_PREFIXES = ['/login', '/auth', '/setup-profile'];

export default function BottomNavigation() {
    const pathname = usePathname();

    if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return null;
    }

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 shadow-lg backdrop-blur">
            <div className="mx-auto grid max-w-5xl grid-cols-4">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`px-2 py-3 text-center text-sm font-semibold ${
                                isActive ? 'text-black' : 'text-gray-400'
                            }`}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
