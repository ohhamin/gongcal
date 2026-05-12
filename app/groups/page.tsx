'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
    GROUP_LIMIT,
    GROUP_MEMBER_LIMIT,
    GROUP_NAME_MAX_LENGTH,
    GroupRow,
    Profile,
    getGroupMemberCount,
    isGroupNameDuplicated,
    normalizeProfile,
    validateGroupName,
} from '@/lib/groups';
import { supabase } from '@/lib/supabase';

type FriendshipRow = {
    requester_id: string;
    addressee_id: string;
    requester: Profile | Profile[] | null;
    addressee: Profile | Profile[] | null;
};

type MemberRow = GroupRow & {
    profile: Profile | Profile[] | null;
};

type GroupMember = GroupRow & {
    profile: Profile | null;
};

export default function GroupsPage() {
    const [myProfileId, setMyProfileId] = useState<string | null>(null);
    const [groups, setGroups] = useState<GroupRow[]>([]);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [friends, setFriends] = useState<Profile[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<GroupRow | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [editGroupName, setEditGroupName] = useState('');
    const [friendSearch, setFriendSearch] = useState('');
    const [isNameChecked, setIsNameChecked] = useState(false);
    const [isEditNameChecked, setIsEditNameChecked] = useState(true);
    const [loading, setLoading] = useState(false);

    const isSelectedGroupOwner = Boolean(selectedGroup?.is_owner);

    const fetchGroups = useCallback(async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        setMyProfileId(user.id);

        const { data, error } = await supabase
            .from('groups')
            .select('id, profile_id, group_name, is_accepted, is_owner')
            .eq('profile_id', user.id)
            .order('group_name', { ascending: true });

        if (error) {
            console.error(error);
            alert('그룹 목록 조회 실패');
            return;
        }

        setGroups((data || []) as GroupRow[]);
    }, []);

    const fetchMembers = useCallback(async (groupId: number) => {
        const { data, error } = await supabase
            .from('groups')
            .select(
                `
                id,
                profile_id,
                group_name,
                is_accepted,
                is_owner,
                profile:profiles!groups_profile_id_fkey (
                    id,
                    nickname
                )
            `,
            )
            .eq('id', groupId);

        if (error) {
            console.error(error);
            alert('그룹원 조회 실패');
            return;
        }

        const normalizedMembers = ((data || []) as MemberRow[])
            .map((member) => ({
                ...member,
                profile: normalizeProfile(member.profile),
            }))
            .sort((a, b) => (a.profile?.nickname || '').localeCompare(b.profile?.nickname || '', 'ko'));

        setMembers(normalizedMembers);
    }, []);

    const fetchFriends = useCallback(async () => {
        if (!myProfileId) return;

        const { data, error } = await supabase
            .from('friendships')
            .select(
                `
                requester_id,
                addressee_id,
                requester:profiles!friendships_requester_id_fkey (
                    id,
                    nickname
                ),
                addressee:profiles!friendships_addressee_id_fkey (
                    id,
                    nickname
                )
            `,
            )
            .eq('status', 'accepted')
            .or(`requester_id.eq.${myProfileId},addressee_id.eq.${myProfileId}`);

        if (error) {
            console.error(error);
            alert('친구 목록 조회 실패');
            return;
        }

        const acceptedFriends = ((data || []) as FriendshipRow[])
            .map((friendship) => normalizeProfile(friendship.requester_id === myProfileId ? friendship.addressee : friendship.requester))
            .filter((friend): friend is Profile => Boolean(friend))
            .sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '', 'ko'));

        setFriends(acceptedFriends);
    }, [myProfileId]);

    useEffect(() => {
        const load = async () => {
            await fetchGroups();
        };

        load();
    }, [fetchGroups]);

    useEffect(() => {
        const load = async () => {
            if (selectedGroup) {
                await fetchMembers(selectedGroup.id);
            }
        };

        load();
    }, [fetchMembers, selectedGroup]);

    useEffect(() => {
        const load = async () => {
            if (isInviteOpen) {
                await fetchFriends();
            }
        };

        load();
    }, [fetchFriends, isInviteOpen]);

    const refreshSelectedGroup = async () => {
        await fetchGroups();

        if (selectedGroup) {
            await fetchMembers(selectedGroup.id);
        }
    };

    const handleCheckGroupName = async (targetGroupName: string, exceptGroupId?: number) => {
        const nameError = validateGroupName(targetGroupName);

        if (nameError) {
            alert(nameError);
            return false;
        }

        try {
            const duplicated = await isGroupNameDuplicated(targetGroupName, exceptGroupId);

            if (duplicated) {
                alert('이미 사용 중인 그룹 이름입니다.');
                return false;
            }

            alert('사용 가능한 그룹 이름입니다.');
            return true;
        } catch (error) {
            console.error(error);
            alert('중복 확인 실패');
            return false;
        }
    };

    const handleCreateGroup = async () => {
        if (!myProfileId || loading) return;

        const nameError = validateGroupName(groupName);

        if (nameError) {
            alert(nameError);
            return;
        }

        if (!isNameChecked) {
            alert('그룹 이름 중복 체크를 해주세요.');
            return;
        }

        if (groups.length >= GROUP_LIMIT) {
            alert(`그룹은 최대 ${GROUP_LIMIT}개까지 가질 수 있습니다.`);
            return;
        }

        setLoading(true);

        const { error } = await supabase.from('groups').insert({
            profile_id: myProfileId,
            group_name: groupName.trim(),
            is_accepted: true,
            is_owner: true,
        });

        setLoading(false);

        if (error) {
            console.error(error);
            alert('그룹 생성 실패');
            return;
        }

        setGroupName('');
        setIsNameChecked(false);
        setIsCreateOpen(false);
        fetchGroups();
    };

    const handleUpdateGroupName = async () => {
        if (!selectedGroup || !isSelectedGroupOwner) return;

        const nameError = validateGroupName(editGroupName);

        if (nameError) {
            alert(nameError);
            return;
        }

        if (editGroupName.trim() !== selectedGroup.group_name && !isEditNameChecked) {
            alert('그룹 이름 중복 체크를 해주세요.');
            return;
        }

        const { error } = await supabase.from('groups').update({ group_name: editGroupName.trim() }).eq('id', selectedGroup.id);

        if (error) {
            console.error(error);
            alert('그룹 이름 수정 실패');
            return;
        }

        const updatedGroup = { ...selectedGroup, group_name: editGroupName.trim() };
        setSelectedGroup(updatedGroup);
        await refreshSelectedGroup();
        alert('그룹 이름을 수정했습니다.');
    };

    const handleDeleteGroup = async () => {
        if (!selectedGroup || !isSelectedGroupOwner) return;

        const ok = confirm('정말 삭제하시나요?');

        if (!ok) return;

        const { error: profileError } = await supabase
            .from('profiles')
            .update({ main_group_id: null })
            .eq('main_group_id', selectedGroup.id);

        if (profileError) {
            console.error(profileError);
            alert('대표 그룹 초기화 실패');
            return;
        }

        const { error } = await supabase.from('groups').delete().eq('id', selectedGroup.id);

        if (error) {
            console.error(error);
            alert('그룹 삭제 실패');
            return;
        }

        setSelectedGroup(null);
        setMembers([]);
        fetchGroups();
    };

    const handleAcceptInvite = async (group: GroupRow) => {
        const { error } = await supabase.from('groups').update({ is_accepted: true }).eq('id', group.id).eq('profile_id', group.profile_id);

        if (error) {
            console.error(error);
            alert('초대 수락 실패');
            return;
        }

        fetchGroups();
    };

    const handleLeaveOrReject = async (group: GroupRow, message: string) => {
        if (!myProfileId) return;

        const ok = confirm(message);

        if (!ok) return;

        const { error: profileError } = await supabase
            .from('profiles')
            .update({ main_group_id: null })
            .eq('id', myProfileId)
            .eq('main_group_id', group.id);

        if (profileError) {
            console.error(profileError);
            alert('대표 그룹 초기화 실패');
            return;
        }

        const { error } = await supabase.from('groups').delete().eq('id', group.id).eq('profile_id', myProfileId);

        if (error) {
            console.error(error);
            alert('처리 실패');
            return;
        }

        if (selectedGroup?.id === group.id) {
            setSelectedGroup(null);
            setMembers([]);
        }

        fetchGroups();
    };

    const handleDelegateOwner = async (member: GroupMember) => {
        if (!selectedGroup || !myProfileId || !isSelectedGroupOwner || member.profile_id === myProfileId) return;

        const ok = confirm(`${member.profile?.nickname || '그룹원'}에게 그룹을 위임할까요?`);

        if (!ok) return;

        const { error: oldOwnerError } = await supabase
            .from('groups')
            .update({ is_owner: false })
            .eq('id', selectedGroup.id)
            .eq('profile_id', myProfileId);

        if (oldOwnerError) {
            console.error(oldOwnerError);
            alert('그룹 위임 실패');
            return;
        }

        const { error } = await supabase
            .from('groups')
            .update({ is_owner: true, is_accepted: true })
            .eq('id', selectedGroup.id)
            .eq('profile_id', member.profile_id);

        if (error) {
            console.error(error);
            alert('그룹 위임 실패');
            return;
        }

        setSelectedGroup({ ...selectedGroup, is_owner: false });
        await refreshSelectedGroup();
    };

    const handleKickMember = async (member: GroupMember) => {
        if (!selectedGroup || !isSelectedGroupOwner || member.profile_id === myProfileId) return;

        const ok = confirm(`${member.profile?.nickname || '그룹원'}님을 추방할까요?`);

        if (!ok) return;

        const { error: profileError } = await supabase
            .from('profiles')
            .update({ main_group_id: null })
            .eq('id', member.profile_id)
            .eq('main_group_id', selectedGroup.id);

        if (profileError) {
            console.error(profileError);
            alert('대표 그룹 초기화 실패');
            return;
        }

        const { error } = await supabase.from('groups').delete().eq('id', selectedGroup.id).eq('profile_id', member.profile_id);

        if (error) {
            console.error(error);
            alert('추방 실패');
            return;
        }

        await refreshSelectedGroup();
    };

    const handleInviteFriend = async (friend: Profile) => {
        if (!selectedGroup || !isSelectedGroupOwner) return;

        try {
            const memberCount = await getGroupMemberCount(selectedGroup.id);

            if (memberCount >= GROUP_MEMBER_LIMIT) {
                alert(`그룹원은 초대중인 멤버를 포함해 최대 ${GROUP_MEMBER_LIMIT}명까지 가능합니다.`);
                return;
            }
        } catch (error) {
            console.error(error);
            alert('그룹원 수 확인 실패');
            return;
        }

        const { error } = await supabase.from('groups').insert({
            id: selectedGroup.id,
            profile_id: friend.id,
            group_name: selectedGroup.group_name,
            is_accepted: false,
            is_owner: false,
        });

        if (error) {
            console.error(error);
            alert('이미 그룹 멤버거나 초대중입니다.');
            return;
        }

        setIsInviteOpen(false);
        setFriendSearch('');
        await refreshSelectedGroup();
    };

    const openGroupDetail = (group: GroupRow) => {
        setSelectedGroup(group);
        setEditGroupName(group.group_name);
        setIsEditNameChecked(true);
    };

    const memberProfileIds = useMemo(() => new Set(members.map((member) => member.profile_id)), [members]);
    const filteredFriends = friends.filter((friend) => (friend.nickname || '').includes(friendSearch.trim()));

    return (
        <main className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">그룹관리</h1>
                    <p className="mt-1 text-sm text-gray-500">그룹은 최대 {GROUP_LIMIT}개, 그룹원은 최대 {GROUP_MEMBER_LIMIT}명까지 가능합니다.</p>
                </div>
                <button className="rounded bg-black px-4 py-2 text-white disabled:bg-gray-400" onClick={() => setIsCreateOpen(true)} disabled={groups.length >= GROUP_LIMIT}>
                    추가
                </button>
            </div>

            <div className="space-y-3">
                {groups.length === 0 && <p className="rounded border p-4 text-sm text-gray-500">참여 중이거나 초대받은 그룹이 없습니다.</p>}

                {groups.map((group) => (
                    <div key={`${group.id}-${group.profile_id}`} className="flex items-center justify-between gap-3 rounded-xl border p-4">
                        <button className="min-w-0 flex-1 text-left" onClick={() => openGroupDetail(group)}>
                            <p className="truncate font-semibold">{group.group_name}</p>
                            <p className="text-sm text-gray-500">
                                {group.is_accepted ? (group.is_owner ? '소유자' : '참여중') : '초대 대기'}
                            </p>
                        </button>

                        <div className="flex shrink-0 gap-2">
                            {!group.is_accepted ? (
                                <>
                                    <button className="rounded bg-black px-3 py-2 text-sm text-white" onClick={() => handleAcceptInvite(group)}>
                                        초대 수락
                                    </button>
                                    <button className="rounded bg-gray-200 px-3 py-2 text-sm" onClick={() => handleLeaveOrReject(group, '초대를 거절할까요?')}>
                                        초대 거절
                                    </button>
                                </>
                            ) : (
                                <button className="rounded bg-red-500 px-3 py-2 text-sm text-white" onClick={() => handleLeaveOrReject(group, '그룹에서 탈퇴할까요?')}>
                                    탈퇴
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {selectedGroup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <h2 className="text-xl font-bold">그룹 상세</h2>
                            <button className="rounded bg-gray-200 px-3 py-1 text-sm" onClick={() => setSelectedGroup(null)}>
                                닫기
                            </button>
                        </div>

                        <div className="mb-5 rounded border p-4">
                            <p className="mb-2 text-sm font-semibold">그룹 이름</p>
                            {isSelectedGroupOwner ? (
                                <div className="flex gap-2">
                                    <input
                                        className="min-w-0 flex-1 rounded border p-2"
                                        value={editGroupName}
                                        maxLength={GROUP_NAME_MAX_LENGTH}
                                        onChange={(e) => {
                                            setEditGroupName(e.target.value);
                                            setIsEditNameChecked(e.target.value.trim() === selectedGroup.group_name);
                                        }}
                                    />
                                    <button
                                        className="rounded bg-gray-200 px-3 py-2 text-sm"
                                        onClick={async () => setIsEditNameChecked(await handleCheckGroupName(editGroupName, selectedGroup.id))}
                                    >
                                        중복 체크
                                    </button>
                                    <button className="rounded bg-black px-3 py-2 text-sm text-white" onClick={handleUpdateGroupName}>
                                        저장
                                    </button>
                                </div>
                            ) : (
                                <p className="font-semibold">{selectedGroup.group_name}</p>
                            )}
                            {isSelectedGroupOwner && (
                                <button className="mt-3 rounded bg-red-500 px-3 py-2 text-sm text-white" onClick={handleDeleteGroup}>
                                    그룹삭제
                                </button>
                            )}
                        </div>

                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-bold">그룹 멤버</h3>
                            {isSelectedGroupOwner && (
                                <button className="rounded bg-black px-3 py-2 text-sm text-white" onClick={() => setIsInviteOpen(true)}>
                                    그룹원 추가
                                </button>
                            )}
                        </div>

                        <div className="space-y-2">
                            {members.map((member) => (
                                <div key={`${member.id}-${member.profile_id}`} className="flex items-center justify-between gap-3 rounded border p-3">
                                    <div>
                                        <p className="font-semibold">{member.profile?.nickname || '이름 없음'}</p>
                                        <p className="text-sm text-gray-500">
                                            {member.is_accepted ? '수락 완료' : '초대 대기'} {member.is_owner ? '· 소유자' : ''}
                                        </p>
                                    </div>

                                    {isSelectedGroupOwner && member.profile_id !== myProfileId && (
                                        <div className="flex gap-2">
                                            <button className="rounded bg-gray-200 px-3 py-2 text-sm" onClick={() => handleDelegateOwner(member)}>
                                                그룹위임
                                            </button>
                                            <button className="rounded bg-red-500 px-3 py-2 text-sm text-white" onClick={() => handleKickMember(member)}>
                                                추방
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                        <h2 className="mb-4 text-xl font-bold">그룹 생성</h2>
                        <div className="mb-4 flex gap-2">
                            <input
                                className="min-w-0 flex-1 rounded border p-3"
                                placeholder="그룹 이름"
                                value={groupName}
                                maxLength={GROUP_NAME_MAX_LENGTH}
                                onChange={(e) => {
                                    setGroupName(e.target.value);
                                    setIsNameChecked(false);
                                }}
                            />
                            <button className="rounded bg-gray-200 px-3 py-2 text-sm" onClick={async () => setIsNameChecked(await handleCheckGroupName(groupName))}>
                                중복 체크
                            </button>
                        </div>
                        <p className="-mt-3 mb-4 text-right text-xs text-gray-500">
                            {groupName.trim().length} / {GROUP_NAME_MAX_LENGTH}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button className="rounded bg-gray-200 px-4 py-2" onClick={() => setIsCreateOpen(false)}>
                                취소
                            </button>
                            <button className="rounded bg-black px-4 py-2 text-white disabled:bg-gray-400" onClick={handleCreateGroup} disabled={loading}>
                                생성
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isInviteOpen && selectedGroup && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
                    <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
                        <h2 className="mb-4 text-xl font-bold">그룹원 추가</h2>
                        <input
                            className="mb-4 w-full rounded border p-3"
                            placeholder="친구 닉네임 검색"
                            value={friendSearch}
                            onChange={(e) => setFriendSearch(e.target.value)}
                        />
                        <div className="space-y-2">
                            {filteredFriends.length === 0 && <p className="text-sm text-gray-500">초대할 수 있는 친구가 없습니다.</p>}
                            {filteredFriends.map((friend) => {
                                const disabled = memberProfileIds.has(friend.id);

                                return (
                                    <button
                                        key={friend.id}
                                        className="flex w-full items-center justify-between rounded border p-3 text-left disabled:bg-gray-100 disabled:text-gray-400"
                                        disabled={disabled}
                                        onClick={() => handleInviteFriend(friend)}
                                    >
                                        <span>{friend.nickname || '이름 없음'}</span>
                                        <span className="text-xs">{disabled ? '초대 불가' : '초대'}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button className="rounded bg-gray-200 px-4 py-2" onClick={() => setIsInviteOpen(false)}>
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
