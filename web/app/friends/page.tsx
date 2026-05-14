'use client';

import { useCallback, useEffect, useState } from 'react';
import { FRIEND_LIMIT, getFriendshipCountByProfileId } from '@/lib/friendships';
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

const FRIEND_SEARCH_PAGE_SIZE = 20;

export default function FriendsPage() {
    const currentUserQuery = useCurrentUser();
    const [friends, setFriends] = useState<FriendItem[]>([]);
    const [nickname, setNickname] = useState('');
    const [searchResults, setSearchResults] = useState<Profile[]>([]);
    const [searchPage, setSearchPage] = useState(0);
    const [searchTotalCount, setSearchTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

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

    const searchProfiles = async (page = 0) => {
        const user = currentUserQuery.data;
        const trimmedNickname = nickname.trim();

        if (!user || !trimmedNickname) {
            setSearchResults([]);
            setSearchTotalCount(0);
            setSearchPage(0);
            return;
        }

        setLoading(true);

        const from = page * FRIEND_SEARCH_PAGE_SIZE;
        const to = from + FRIEND_SEARCH_PAGE_SIZE - 1;

        const { data, count, error } = await supabase
            .from('profiles')
            .select('id, nickname', { count: 'exact' })
            .ilike('nickname', `%${trimmedNickname}%`)
            .neq('id', user.id)
            .order('nickname', { ascending: true })
            .range(from, to);

        setLoading(false);

        if (error) {
            console.error(error);
            alert('사용자 검색 실패');
            return;
        }

        setSearchResults((data || []) as Profile[]);
        setSearchTotalCount(count || 0);
        setSearchPage(page);
    };

    const createFriendRequestNotification = async (profile: Profile, friendshipId: number | null) => {
        const { error } = await supabase.from('notifications').insert({
            profile_id: profile.id,
            type: 'friend_request',
            title: '친구 요청',
            message: '새로운 친구 요청이 도착했어요.',
            related_id: friendshipId,
        });

        // 친구 요청 자체는 성공했는데 알림만 실패하는 상황을 막기 위해 best-effort로만 처리합니다.
        if (error) console.error(error);
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
        await searchProfiles(searchPage);
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
        setNickname('');
        setSearchResults([]);
        setSearchPage(0);
        setSearchTotalCount(0);
    };

    useEffect(() => {
        const load = async () => {
            await fetchFriends();
        };

        load();
    }, [fetchFriends]);

    const totalPages = Math.ceil(searchTotalCount / FRIEND_SEARCH_PAGE_SIZE);
    const canGoPrev = searchPage > 0;
    const canGoNext = searchPage + 1 < totalPages;

    return (
        <main className="min-h-screen bg-gray-50 p-5">
            <div className="mb-2 flex items-center justify-between">
                <h1 className="text-2xl font-bold">친구</h1>
            </div>
            <div className="mb-2 flex items-center justify-end">
                <button
                    className="rounded bg-black px-4 py-2 text-white disabled:bg-gray-400"
                    onClick={() => setOpen(true)}
                    disabled={friends.length >= FRIEND_LIMIT}
                >
                    친구 추가
                </button>
            </div>
            <div className="space-y-3">
                {friends.map((item) => (
                    <div key={item.friendshipId} className="flex items-center justify-between rounded-xl border p-4">
                        <div>
                            <p className="font-semibold">{item.friend.nickname}</p>

                            {item.isSentRequest && <p className="text-sm text-gray-500">요청 보냄</p>}

                            {item.isReceivedRequest && <p className="text-sm text-gray-500">친구 요청 받음</p>}
                        </div>

                        <div className="flex gap-2">
                            {item.isReceivedRequest && (
                                <button
                                    className="rounded bg-black px-4 py-2 text-white"
                                    onClick={() => handleAcceptFriend(item.friendshipId)}
                                >
                                    수락
                                </button>
                            )}

                            <button
                                className="rounded bg-red-500 px-4 py-2 text-white"
                                onClick={() => handleDeleteFriend(item.friendshipId)}
                            >
                                삭제
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={resetSearchModal}>
                    <div className="relative flex h-[70vh] w-full max-w-md flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <button className="absolute top-4 right-4 rounded bg-gray-200 px-3 py-1 text-sm" onClick={resetSearchModal}>
                            취소
                        </button>
                        <h2 className="mb-4 text-xl font-bold">친구 추가</h2>

                        <div className="mb-4 flex gap-2 pr-16">
                            <input
                                className="min-w-0 flex-1 rounded border p-3"
                                placeholder="닉네임 입력"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        searchProfiles(0);
                                    }
                                }}
                            />
                            <button className="rounded bg-black px-4 py-2 text-white disabled:bg-gray-400" onClick={() => searchProfiles(0)} disabled={loading}>
                                검색
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                            {searchResults.length === 0 && <p className="rounded border p-4 text-sm text-gray-500">검색 결과가 없습니다.</p>}
                            {searchResults.map((profile) => (
                                <button
                                    key={profile.id}
                                    className="flex w-full items-center justify-between rounded border p-3 text-left hover:bg-gray-50"
                                    onClick={() => handleRequestFriend(profile)}
                                    disabled={loading}
                                >
                                    <span className="font-semibold">{profile.nickname || '이름 없음'}</span>
                                    <span className="text-xs text-gray-500">친구 요청</span>
                                </button>
                            ))}
                        </div>

                        {searchTotalCount > FRIEND_SEARCH_PAGE_SIZE && (
                            <div className="mt-4 flex items-center justify-between text-sm">
                                <button className="rounded bg-gray-200 px-3 py-2 disabled:opacity-40" onClick={() => searchProfiles(searchPage - 1)} disabled={!canGoPrev || loading}>
                                    이전
                                </button>
                                <span className="text-gray-500">
                                    {searchPage + 1} / {totalPages}
                                </span>
                                <button className="rounded bg-gray-200 px-3 py-2 disabled:opacity-40" onClick={() => searchProfiles(searchPage + 1)} disabled={!canGoNext || loading}>
                                    다음
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
