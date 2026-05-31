'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
    { href: '/calendar', label: '▦', title: '캘린더' },
    { href: '/groups', label: '◯', title: '친구' },
    { href: '/settings', label: '⚙', title: '설정' },
];

const HIDDEN_PREFIXES = ['/login', '/auth', '/setup-profile'];

export default function BottomNavigation() {
    const pathname = usePathname();

    if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return null;
    }

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--oc-divider)] bg-white/95 shadow-[0_-6px_18px_rgba(11,15,31,0.06)] backdrop-blur">
            <div className="mx-auto grid max-w-md grid-cols-3 pb-[max(env(safe-area-inset-bottom),4px)]">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-center transition ${
                                isActive ? 'text-[var(--oc-primary)]' : 'text-[var(--oc-text-tertiary)]'
                            }`}
                            title={item.title}
                            aria-label={item.title}
                        >
                            <span className="text-xl leading-none" aria-hidden="true">{item.label}</span>
                            <span className="text-[9px] font-semibold leading-none tracking-[-0.01em]">{item.title}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
