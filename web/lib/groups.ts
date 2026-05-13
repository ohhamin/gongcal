import { supabase } from '@/lib/supabase';

export const GROUP_LIMIT = 5;
export const GROUP_MEMBER_LIMIT = 5;
export const GROUP_NAME_MAX_LENGTH = 10;
export const PERSONAL_CALENDAR_VALUE = 'personal';

export type Profile = {
    id: string;
    nickname: string | null;
    main_group_id?: number | null;
};

export type GroupRow = {
    id: number;
    profile_id: string;
    group_name: string;
    is_accepted: boolean;
    is_owner: boolean;
    profile?: Profile | Profile[] | null;
};

export type GroupOption = {
    id: number;
    group_name: string;
};

export function normalizeProfile(profile: Profile | Profile[] | null | undefined) {
    return Array.isArray(profile) ? profile[0] || null : profile || null;
}

export function validateGroupName(groupName: string) {
    const trimmedGroupName = groupName.trim();

    if (!trimmedGroupName) {
        return '그룹 이름을 입력해주세요.';
    }

    if (trimmedGroupName.length > GROUP_NAME_MAX_LENGTH) {
        return `그룹 이름은 ${GROUP_NAME_MAX_LENGTH}자 이하만 가능합니다.`;
    }

    return null;
}

export async function getMyAcceptedGroups(profileId: string) {
    const { data, error } = await supabase
        .from('groups')
        .select('id, group_name')
        .eq('profile_id', profileId)
        .eq('is_accepted', true)
        .order('group_name', { ascending: true });

    if (error) {
        throw error;
    }

    return (data || []) as GroupOption[];
}

export async function updateMainGroup(profileId: string, groupId: number | null) {
    const { error } = await supabase.from('profiles').update({ main_group_id: groupId }).eq('id', profileId);

    if (error) {
        throw error;
    }
}

export async function getGroupMemberCount(groupId: number) {
    const { count, error } = await supabase
        .from('groups')
        .select('profile_id', { count: 'exact', head: true })
        .eq('id', groupId);

    if (error) {
        throw error;
    }

    return count || 0;
}

export async function isGroupNameDuplicated(groupName: string, exceptGroupId?: number) {
    let query = supabase.from('groups').select('id', { count: 'exact', head: true }).eq('group_name', groupName.trim());

    if (exceptGroupId) {
        query = query.neq('id', exceptGroupId);
    }

    const { count, error } = await query;

    if (error) {
        throw error;
    }

    return (count || 0) > 0;
}
