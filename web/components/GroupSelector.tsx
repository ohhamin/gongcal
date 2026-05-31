'use client';

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

    const profile = profileQuery.data;
    const groups = acceptedGroupsQuery.data || [];
    const selectedValue = profile?.main_group_id ? String(profile.main_group_id) : PERSONAL_CALENDAR_VALUE;
    const loading = profileQuery.isLoading || acceptedGroupsQuery.isLoading;

    const handleChange = async (value: string) => {
        if (!profile) return;

        const nextMainGroupId = value === PERSONAL_CALENDAR_VALUE ? null : Number(value);

        // 낙관적 업데이트로 페이지 이동/드롭다운 전환 시 같은 프로필 값을 즉시 재사용합니다.
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
            alert('그룹 변경 실패');
            await queryClient.invalidateQueries({ queryKey: queryKeys.myProfile(profile.id) });
        }
    };

    return (
        <select
            className="h-9 w-auto max-w-[11rem] rounded-xl border border-[var(--oc-divider-strong)] bg-white px-3 text-xs font-semibold text-[var(--oc-text)] shadow-sm outline-none transition focus:border-[var(--oc-primary)] disabled:bg-[var(--oc-surface-2)] disabled:text-[var(--oc-text-tertiary)]"
            value={selectedValue}
            onChange={(e) => handleChange(e.target.value)}
            disabled={loading || !profile}
        >
            <option value={PERSONAL_CALENDAR_VALUE}>나만보기</option>
            {groups.map((group) => (
                <option key={group.id} value={group.id}>
                    {group.group_name}
                </option>
            ))}
        </select>
    );
}
