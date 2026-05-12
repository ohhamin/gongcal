'use client';

import { useEffect, useState } from 'react';
import { FRIEND_LIMIT, getFriendshipCountByProfileId } from '@/lib/friendships';
import { supabase } from '@/lib/supabase';

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

export default function FriendsPage() {
    const [friends, setFriends] = useState<FriendItem[]>([]);

    const [nickname, setNickname] = useState('');

    const [loading, setLoading] = useState(false);

    const [open, setOpen] = useState(false);

    // 친구 불러오기
    const fetchFriends = async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();

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
    };

    // 친구 추가하기
    const handleAddFriend = async () => {
        if (friends.length >= FRIEND_LIMIT) {
            alert(`친구는 최대 ${FRIEND_LIMIT}명까지 추가할 수 있습니다.`);
            return false;
        }

        setLoading(true);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setLoading(false);
            return false;
        }

        // 닉네임 검색
        const { data: profile } = await supabase.from('profiles').select('*').eq('nickname', nickname.trim()).single();

        if (!profile) {
            alert('사용자를 찾을 수 없습니다.');

            setLoading(false);

            return false;
        }

        // 자기 자신 방지
        if (profile.id === user.id) {
            alert('자기 자신은 추가할 수 없습니다.');

            setLoading(false);

            return false;
        }

        let addresseeFriendCount = 0;

        try {
            addresseeFriendCount = await getFriendshipCountByProfileId(profile.id);
        } catch (error) {
            console.error(error);
            alert('친구 수 확인 실패');

            setLoading(false);

            return false;
        }

        if (addresseeFriendCount >= FRIEND_LIMIT) {
            alert(`친구가 ${FRIEND_LIMIT}명 이상 존재하는 유저에요`);

            setLoading(false);

            return false;
        }

        const { error } = await supabase.from('friendships').insert({
            requester_id: user.id,
            addressee_id: profile.id,
            status: 'pending',
        });

        if (error) {
            console.error(error);

            alert('이미 친구이거나 요청이 존재합니다.');

            setLoading(false);

            return false;
        }

        setNickname('');

        fetchFriends();

        setLoading(false);

        return true;
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

        fetchFriends();
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

        fetchFriends();
    };

    // 첫 로딩
    useEffect(() => {
        const load = async () => {
            await fetchFriends();
        };

        load();
    }, []);

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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                        <h2 className="mb-4 text-xl font-bold">친구 추가</h2>

                        <input
                            className="mb-4 w-full rounded border p-3"
                            placeholder="닉네임 입력"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                        />

                        <div className="flex justify-end gap-2">
                            <button className="rounded bg-gray-200 px-4 py-2" onClick={() => setOpen(false)}>
                                취소
                            </button>

                            <button
                                className="rounded bg-black px-4 py-2 text-white disabled:bg-gray-400"
                                onClick={async () => {
                                    const added = await handleAddFriend();

                                    if (added) {
                                        setOpen(false);
                                    }
                                }}
                                disabled={loading}
                            >
                                추가
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
