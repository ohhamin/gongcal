'use client';

import { useCallback, useEffect, useState } from 'react';

import { getMyAcceptedGroups, GroupOption, PERSONAL_CALENDAR_VALUE, updateMainGroup } from '@/lib/groups';
import { supabase } from '@/lib/supabase';

type Props = {
    onChange?: () => void;
};

export default function GroupSelector({ onChange }: Props) {
    const [myProfileId, setMyProfileId] = useState<string | null>(null);
    const [groups, setGroups] = useState<GroupOption[]>([]);
    const [selectedValue, setSelectedValue] = useState(PERSONAL_CALENDAR_VALUE);
    const [loading, setLoading] = useState(true);

    const fetchGroups = useCallback(async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setLoading(false);
            return;
        }

        setMyProfileId(user.id);

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, main_group_id')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error(profileError);
            setLoading(false);
            return;
        }

        try {
            const acceptedGroups = await getMyAcceptedGroups(user.id);
            setGroups(acceptedGroups);
            setSelectedValue(profile?.main_group_id ? String(profile.main_group_id) : PERSONAL_CALENDAR_VALUE);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            await fetchGroups();
        };

        load();
    }, [fetchGroups]);

    const handleChange = async (value: string) => {
        if (!myProfileId) return;

        setSelectedValue(value);

        try {
            await updateMainGroup(myProfileId, value === PERSONAL_CALENDAR_VALUE ? null : Number(value));
            onChange?.();
        } catch (error) {
            console.error(error);
            alert('그룹 변경 실패');
            fetchGroups();
        }
    };

    return (
        <select
            className="rounded border bg-white px-3 py-2 text-sm"
            value={selectedValue}
            onChange={(e) => handleChange(e.target.value)}
            disabled={loading}
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
