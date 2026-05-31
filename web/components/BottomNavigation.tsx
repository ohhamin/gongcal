'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import Icon from '@/components/Icon';

const NAV_ITEMS = [
    { href: '/calendar', icon: 'calendar', activeIcon: 'calendarFill', title: '캘린더' },
    { href: '/groups', icon: 'users', activeIcon: 'usersFill', title: '친구' },
    { href: '/settings', icon: 'settings', activeIcon: 'settingsFill', title: '설정' },
] as const;

const HIDDEN_PREFIXES = ['/login', '/auth', '/setup-profile'];

export default function BottomNavigation() {
    const pathname = usePathname();

    if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return null;
    }

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--oc-divider)] bg-white/95 shadow-[0_-10px_30px_rgba(11,15,31,0.08)] backdrop-blur">
            <div className="mx-auto grid max-w-md grid-cols-3 pb-0">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center gap-1 px-2 py-[12.5px] text-center transition ${
                                isActive ? 'text-[var(--oc-primary)]' : 'text-[var(--oc-text-tertiary)]'
                            }`}
                            title={item.title}
                            aria-label={item.title}
                        >
                            <Icon name={isActive ? item.activeIcon : item.icon} size={24} color="currentColor" />
                            <span className="text-[10px] font-semibold leading-none tracking-[-0.01em]">{item.title}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
