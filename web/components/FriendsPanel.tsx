'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FRIEND_LIMIT, getFriendshipCountByProfileId } from '@/lib/friendships';
import { createNotificationWithPush } from '@/lib/pushNotifications';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/lib/useCurrentProfile';

type Profile = {
    id: string;
    nickname: string | null;
};

type FriendshipRow = {
    id: number;
    status: string;
    requester_id: string;
    addressee_id: string;
    requester: Profile;
    addressee: Profile;
};

type FriendItem = {
    friendshipId: number;
    status: string;
    isReceivedRequest: boolean;
    isSentRequest: boolean;
    friend: Profile;
};

const INVITE_CODE_LENGTH = 8;

export default function FriendsPanel() {
    const currentUserQuery = useCurrentUser();
    const [friends, setFriends] = useState<FriendItem[]>([]);
    const [inviteCode, setInviteCode] = useState('');
    const [searchResults, setSearchResults] = useState<Profile[]>([]);

    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const myInviteCode = useMemo(() => currentUserQuery.data?.id.slice(0, INVITE_CODE_LENGTH) || '', [currentUserQuery.data?.id]);
    const acceptedFriends = friends.filter((item) => item.status === 'accepted');
    const pendingFriends = friends.filter((item) => item.status !== 'accepted');

    const copyInviteCode = async () => {
        if (!myInviteCode) return;

        try {
            await navigator.clipboard?.writeText(myInviteCode);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch (error) {
            console.error(error);
            alert('초대코드 복사 실패');
        }
    };

    const getInitial = (nickname: string | null) => (nickname?.trim().slice(0, 1) || '?').toUpperCase();

    const fetchFriends = useCallback(async () => {
        const user = currentUserQuery.data;

        if (!user) return;

        const { data, error } = await supabase
            .from('friendships')
            .select(
                `
    *,
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
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

        if (error) {
            console.error(error);
            return;
        }

        const parsed =
            (data as FriendshipRow[] | null)?.map((friendship) => {
                const isRequester = friendship.requester_id === user.id;
                const friend = isRequester ? friendship.addressee : friendship.requester;

                return {
                    friendshipId: friendship.id,
                    status: friendship.status,
                    isReceivedRequest: friendship.status === 'pending' && friendship.addressee_id === user.id,
                    isSentRequest: friendship.status === 'pending' && friendship.requester_id === user.id,
                    friend,
                };
            }) || [];

        setFriends(parsed);
    }, [currentUserQuery.data]);

    const searchProfiles = async () => {
        const user = currentUserQuery.data;
        const trimmedInviteCode = inviteCode.trim().toLowerCase();

        if (!user || !trimmedInviteCode) {
            setSearchResults([]);
            return;
        }

        if (trimmedInviteCode.length !== INVITE_CODE_LENGTH) {
            alert('초대코드 8자리를 입력해주세요.');
            return;
        }

        setLoading(true);

        const { data, error } = await supabase.rpc('find_profile_by_invite_code', {
            p_invite_code: trimmedInviteCode,
        });

        setLoading(false);

        if (error) {
            console.error(error);
            alert('사용자 검색 실패');
            return;
        }

        setSearchResults(((data || []) as Profile[]).filter((profile) => profile.id !== user.id));
    };

    const createFriendRequestNotification = async (profile: Profile, friendshipId: number | null) => {
        await createNotificationWithPush({
            profileId: profile.id,
            type: 'friend_request',
            title: '친구 요청',
            message: '새로운 친구 요청이 도착했어요.',
            relatedId: friendshipId,
        });
    };

    const handleRequestFriend = async (profile: Profile) => {
        const user = currentUserQuery.data;

        if (!user) return;

        if (friends.length >= FRIEND_LIMIT) {
            alert(`친구는 최대 ${FRIEND_LIMIT}명까지 추가할 수 있습니다.`);
            return;
        }

        const alreadyFriend = friends.some((item) => item.friend.id === profile.id);

        if (alreadyFriend) {
            alert('이미 친구인 사용자에요.');
            return;
        }

        const ok = confirm('친구 요청을 보낼까요?');

        if (!ok) return;

        setLoading(true);

        let addresseeFriendCount = 0;

        try {
            addresseeFriendCount = await getFriendshipCountByProfileId(profile.id);
        } catch (error) {
            console.error(error);
            alert('친구 수 확인 실패');
            setLoading(false);
            return;
        }

        if (addresseeFriendCount >= FRIEND_LIMIT) {
            alert(`친구가 ${FRIEND_LIMIT}명 이상 존재하는 유저에요`);
            setLoading(false);
            return;
        }

        const { error } = await supabase.from('friendships').insert({
            requester_id: user.id,
            addressee_id: profile.id,
            status: 'pending',
        });

        setLoading(false);

        if (error) {
            console.error(error);
            alert('이미 친구인 사용자에요.');
            return;
        }

        await createFriendRequestNotification(profile, null);
        await fetchFriends();
        await searchProfiles();
    };

    const handleAcceptFriend = async (friendshipId: number) => {
        const { error } = await supabase
            .from('friendships')
            .update({
                status: 'accepted',
            })
            .eq('id', friendshipId);

        if (error) {
            console.error(error);
            alert('친구 요청 수락 실패');
            return;
        }

        await fetchFriends();
    };

    const handleDeleteFriend = async (friendshipId: number) => {
        const ok = confirm('친구를 삭제할까요?');

        if (!ok) return;

        const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);

        if (error) {
            console.error(error);
            alert('친구 삭제 실패');
            return;
        }

        await fetchFriends();
    };

    const resetSearchModal = () => {
        setOpen(false);
        setInviteCode('');
        setSearchResults([]);
    };

    useEffect(() => {
        const load = async () => {
            await fetchFriends();
        };

        load();
    }, [fetchFriends]);

    return (
        <section className="mx-auto max-w-md text-[var(--oc-text)]">
            <div className="px-1 pb-3 pt-1">
                <h1 className="text-2xl font-extrabold tracking-[-0.04em]">친구</h1>
                <p className="mt-1 text-xs font-medium tracking-[-0.01em] text-[var(--oc-text-secondary)]">
                    함께 캘린더를 쓰는 사람 {acceptedFriends.length}명
                </p>
            </div>

            <div className="mb-5 rounded-2xl bg-[var(--oc-tint)] p-4">
                <div className="mb-3 flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--oc-primary)] text-lg text-white shadow-lg shadow-blue-900/20">
                        ↗
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold tracking-[-0.01em]">초대코드로 친구 추가하기</p>
                        <p className="mt-0.5 text-[11px] tracking-[-0.01em] text-[var(--oc-text-secondary)]">
                            코드를 공유하면 친구 요청을 받을 수 있어요.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl bg-white px-3 font-mono text-xs text-[var(--oc-text-secondary)]">
                        {myInviteCode || '로그인 확인 중'}
                    </div>
                    <button
                        className="h-10 rounded-xl bg-[var(--oc-primary)] px-4 text-xs font-bold text-white shadow-md shadow-blue-900/20 disabled:opacity-40"
                        onClick={copyInviteCode}
                        disabled={!myInviteCode}
                    >
                        {copied ? '복사됨' : '복사'}
                    </button>
                </div>
            </div>

            <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11px] font-bold tracking-[0.04em] text-[var(--oc-text-secondary)]">멤버 {acceptedFriends.length}</p>
                <button
                    className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--oc-primary)] disabled:text-[var(--oc-text-tertiary)]"
                    onClick={() => setOpen(true)}
                    disabled={friends.length >= FRIEND_LIMIT}
                >
                    친구 추가
                </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--oc-divider)] bg-white">
                {acceptedFriends.length === 0 ? (
                    <p className="p-5 text-center text-sm text-[var(--oc-text-secondary)]">아직 추가된 친구가 없습니다.</p>
                ) : (
                    acceptedFriends.map((item, index) => (
                        <div
                            key={item.friendshipId}
                            className={`flex items-center gap-3 px-4 py-3 ${index < acceptedFriends.length - 1 ? 'border-b border-[var(--oc-divider)]' : ''}`}
                        >
                            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--oc-primary)] text-base font-bold text-white">
                                {getInitial(item.friend.nickname)}
                                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold tracking-[-0.01em]">{item.friend.nickname || '이름 없음'}</p>
                                <p className="mt-0.5 text-[11px] tracking-[-0.01em] text-[var(--oc-text-secondary)]">캘린더 친구 · 편집 가능</p>
                            </div>
                            <button
                                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500"
                                onClick={() => handleDeleteFriend(item.friendshipId)}
                            >
                                삭제
                            </button>
                        </div>
                    ))
                )}
            </div>

            {pendingFriends.length > 0 && (
                <div className="mt-5">
                    <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.04em] text-[var(--oc-text-secondary)]">초대 대기 중 {pendingFriends.length}</p>
                    <div className="overflow-hidden rounded-2xl border border-[var(--oc-divider)] bg-white">
                        {pendingFriends.map((item, index) => (
                            <div
                                key={item.friendshipId}
                                className={`flex items-center gap-3 px-4 py-3 ${index < pendingFriends.length - 1 ? 'border-b border-[var(--oc-divider)]' : ''}`}
                            >
                                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-[var(--oc-divider-strong)] bg-[var(--oc-surface-2)] text-sm font-bold text-[var(--oc-text-tertiary)]">
                                    {getInitial(item.friend.nickname)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold tracking-[-0.01em]">{item.friend.nickname || '이름 없음'}</p>
                                    <p className="mt-0.5 text-[11px] tracking-[-0.01em] text-[var(--oc-text-secondary)]">
                                        {item.isReceivedRequest ? '친구 요청 받음' : '요청 보냄'}
                                    </p>
                                </div>
                                {item.isReceivedRequest && (
                                    <button
                                        className="rounded-lg bg-[var(--oc-primary)] px-3 py-1.5 text-xs font-bold text-white"
                                        onClick={() => handleAcceptFriend(item.friendshipId)}
                                    >
                                        수락
                                    </button>
                                )}
                                <button
                                    className="rounded-lg bg-[var(--oc-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--oc-text-secondary)]"
                                    onClick={() => handleDeleteFriend(item.friendshipId)}
                                >
                                    취소
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {open && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(11,15,31,0.42)] p-0 sm:items-center sm:p-4" onClick={resetSearchModal}>
                    <div className="flex h-[52vh] w-full max-w-md flex-col rounded-t-[24px] bg-white p-5 shadow-[var(--oc-elevation)] sm:rounded-[24px]" onClick={(e) => e.stopPropagation()}>
                        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--oc-divider-strong)] sm:hidden" />
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-xl font-extrabold tracking-[-0.03em]">친구 추가</h2>
                            <button className="rounded-xl bg-[var(--oc-surface-2)] px-3 py-1.5 text-sm font-semibold text-[var(--oc-text-secondary)]" onClick={resetSearchModal}>
                                취소
                            </button>
                        </div>

                        <div className="mb-4 flex gap-2">
                            <input
                                className="min-w-0 flex-1 rounded-xl border border-[var(--oc-divider-strong)] p-3 text-sm outline-none focus:border-[var(--oc-primary)]"
                                placeholder="초대코드 8자리 입력"
                                value={inviteCode}
                                maxLength={INVITE_CODE_LENGTH}
                                onChange={(e) => setInviteCode(e.target.value.trim())}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        searchProfiles();
                                    }
                                }}
                            />
                            <button className="rounded-xl bg-[var(--oc-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40" onClick={() => searchProfiles()} disabled={loading}>
                                검색
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                            {searchResults.length === 0 && <p className="rounded-2xl border border-[var(--oc-divider)] p-4 text-center text-sm text-[var(--oc-text-secondary)]">검색 결과가 없습니다.</p>}
                            {searchResults.map((profile) => (
                                <button
                                    key={profile.id}
                                    className="flex w-full items-center justify-between rounded-2xl border border-[var(--oc-divider)] p-3 text-left hover:bg-[var(--oc-surface-2)]"
                                    onClick={() => handleRequestFriend(profile)}
                                    disabled={loading}
                                >
                                    <span className="font-bold">{profile.nickname || '이름 없음'}</span>
                                    <span className="text-xs font-semibold text-[var(--oc-primary)]">친구 요청</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
