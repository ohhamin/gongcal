'use client';

import { appAlert } from '@/components/AppDialogProvider';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { PERSONAL_CALENDAR_VALUE, updateMainGroup } from '@/lib/groups';
import { queryKeys } from '@/lib/queryKeys';
import { useMyAcceptedGroups } from '@/lib/useMyAcceptedGroups';
import { useMyProfile } from '@/lib/useCurrentProfile';

type Props = {
    onChange?: (nextMainGroupId: number | null) => void;
};

export default function GroupSelector({ onChange }: Props) {
    const queryClient = useQueryClient();
    const profileQuery = useMyProfile();
    const acceptedGroupsQuery = useMyAcceptedGroups();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const profile = profileQuery.data;
    const groups = acceptedGroupsQuery.data || [];
    const selectedValue = profile?.main_group_id ? String(profile.main_group_id) : PERSONAL_CALENDAR_VALUE;
    const loading = profileQuery.isLoading || acceptedGroupsQuery.isLoading;
    const selectedLabel = selectedValue === PERSONAL_CALENDAR_VALUE
        ? '나만보기'
        : groups.find((group) => String(group.id) === selectedValue)?.group_name || '그룹 선택';

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen]);

    const handleChange = async (value: string) => {
        if (!profile) return;
        setIsOpen(false);

        const nextMainGroupId = value === PERSONAL_CALENDAR_VALUE ? null : Number(value);

        queryClient.setQueryData(queryKeys.myProfile(profile.id), {
            ...profile,
            main_group_id: nextMainGroupId,
        });
        onChange?.(nextMainGroupId);

        try {
            await updateMainGroup(profile.id, nextMainGroupId);
            await queryClient.invalidateQueries({ queryKey: queryKeys.myProfile(profile.id) });
        } catch (error) {
            console.error(error);
            await appAlert('그룹 변경 실패');
            await queryClient.invalidateQueries({ queryKey: queryKeys.myProfile(profile.id) });
        }
    };

    const options = [
        { value: PERSONAL_CALENDAR_VALUE, label: '나만보기' },
        ...groups.map((group) => ({ value: String(group.id), label: group.group_name })),
    ];

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                className="flex h-9 max-w-[11rem] items-center gap-1 rounded-xl border border-[var(--oc-divider-strong)] bg-white px-3 text-xs font-semibold tracking-[-0.01em] text-[var(--oc-text)] shadow-sm transition disabled:bg-[var(--oc-surface-2)] disabled:text-[var(--oc-text-tertiary)]"
                disabled={loading || !profile}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((prev) => !prev)}
            >
                <span className="truncate">{selectedLabel}</span>
                <span className="text-[10px] text-[var(--oc-text-secondary)]">▾</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-[var(--oc-divider)] bg-white p-1.5 shadow-[var(--oc-elevation)]" role="listbox">
                    {options.map((option) => {
                        const selected = option.value === selectedValue;

                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold tracking-[-0.01em] transition ${selected ? 'bg-[var(--oc-tint)] text-[var(--oc-primary)]' : 'text-[var(--oc-text)] hover:bg-[var(--oc-surface-2)]'}`}
                                onClick={() => handleChange(option.value)}
                            >
                                <span className="truncate">{option.label}</span>
                                {selected && <span className="text-xs">✓</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
