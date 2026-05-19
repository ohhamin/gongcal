'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
    { href: '/calendar', label: '📅', title: '캘린더' },
    { href: '/groups', label: '👥', title: '친구/그룹관리' },
    { href: '/settings', label: '⚙️', title: '설정' },
];

const HIDDEN_PREFIXES = ['/login', '/auth', '/setup-profile'];

export default function BottomNavigation() {
    const pathname = usePathname();

    if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return null;
    }

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 shadow-lg backdrop-blur">
            <div className="mx-auto grid max-w-5xl grid-cols-3">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`px-2 py-3 text-center text-2xl font-semibold ${
                                isActive ? 'opacity-100' : 'opacity-35'
                            }`}
                            title={item.title}
                            aria-label={item.title}
                        >
                            <span aria-hidden="true">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
