'use client';

import { useEffect } from 'react';

const BUTTON_DEBOUNCE_MS = 500;

export default function ButtonDebounceGuard() {
    useEffect(() => {
        const lastClickByButton = new WeakMap<HTMLButtonElement, number>();

        const handleClick = (event: MouseEvent) => {
            const target = event.target;

            if (!(target instanceof Element)) return;

            const button = target.closest('button');

            if (!(button instanceof HTMLButtonElement) || button.disabled) return;

            const now = Date.now();
            const lastClickAt = lastClickByButton.get(button) ?? 0;

            if (now - lastClickAt < BUTTON_DEBOUNCE_MS) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return;
            }

            lastClickByButton.set(button, now);
        };

        document.addEventListener('click', handleClick, true);

        return () => {
            document.removeEventListener('click', handleClick, true);
        };
    }, []);

    return null;
}
