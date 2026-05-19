'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';
import { useCurrentUser, useMyProfile } from '@/lib/useCurrentProfile';

export default function SettingsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const currentUserQuery = useCurrentUser();
    const profileQuery = useMyProfile();
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const inviteCode = profileQuery.data?.id.slice(0, 8) || '';

    const copyInviteCode = async () => {
        if (!inviteCode) return;

        try {
            await navigator.clipboard.writeText(inviteCode);
            alert('초대코드를 복사했습니다.');
        } catch (error) {
            console.error(error);
            alert('초대코드 복사 실패');
        }
    };

    const handleLogout = async () => {
        const ok = confirm('로그아웃할까요?');

        if (!ok) return;

        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error(error);
            alert('로그아웃 실패');
            return;
        }

        queryClient.clear();
        router.push('/login');
    };

    const handleDeleteAccount = async () => {
        const user = currentUserQuery.data;

        if (!user) return;

        setDeleting(true);

        // 1. friendships 테이블에서 해당 유저 관련 데이터 전체 삭제
        const { error: friendshipError } = await supabase
            .from('friendships')
            .delete()
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

        if (friendshipError) {
            console.error(friendshipError);
            alert('탈퇴 처리 중 오류가 발생했습니다.');
            setDeleting(false);
            return;
        }

        // 2. 유저가 owner인 그룹 ID 목록 조회
        const { data: ownedGroups, error: ownedGroupsError } = await supabase
            .from('groups')
            .select('id')
            .eq('profile_id', user.id)
            .eq('is_owner', true);

        if (ownedGroupsError) {
            console.error(ownedGroupsError);
            alert('탈퇴 처리 중 오류가 발생했습니다.');
            setDeleting(false);
            return;
        }

        // 3. owner 그룹의 모든 멤버 row 삭제 (그룹 자체 삭제)
        if (ownedGroups && ownedGroups.length > 0) {
            const ownedGroupIds = ownedGroups.map((g) => g.id);

            const { error: deleteOwnedError } = await supabase
                .from('groups')
                .delete()
                .in('id', ownedGroupIds);

            if (deleteOwnedError) {
                console.error(deleteOwnedError);
                alert('탈퇴 처리 중 오류가 발생했습니다.');
                setDeleting(false);
                return;
            }
        }

        // 4. 남은 그룹 멤버십 row 삭제 (비-owner 참여 그룹)
        const { error: deleteUserGroupsError } = await supabase
            .from('groups')
            .delete()
            .eq('profile_id', user.id);

        if (deleteUserGroupsError) {
            console.error(deleteUserGroupsError);
            alert('탈퇴 처리 중 오류가 발생했습니다.');
            setDeleting(false);
            return;
        }

        // 5. 세션 종료 후 로그인 페이지로 이동
        await supabase.auth.signOut();
        queryClient.clear();
        router.push('/login');
    };

    return (
        <main className="relative min-h-[520px] rounded-2xl bg-white p-5 shadow">
            <div className="mb-6 rounded-xl border bg-gray-50 p-4">
                <p className="text-lg font-bold">{profileQuery.data?.nickname || '이름 없음'}</p>
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                    <span>초대코드</span>
                    <span className="font-mono font-semibold text-gray-900">{inviteCode || '-'}</span>
                    <button className="rounded bg-white px-2 py-1 shadow-sm ring-1 ring-black/10" onClick={copyInviteCode} disabled={!inviteCode} aria-label="초대코드 복사">
                        📋
                    </button>
                </div>
            </div>

            <h1 className="mb-4 text-2xl font-bold">설정</h1>
            <p className="text-gray-700">설정 페이지입니다.</p>

            <button
                className="absolute left-5 bottom-5 rounded px-4 py-2 text-sm text-gray-400 hover:text-red-500"
                onClick={() => setDeleteConfirmOpen(true)}
            >
                회원 탈퇴
            </button>

            <button className="absolute right-5 bottom-5 rounded bg-red-500 px-4 py-2 text-white" onClick={handleLogout}>
                로그아웃
            </button>

            {deleteConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                        <h2 className="mb-3 text-lg font-bold">회원 탈퇴</h2>
                        <p className="mb-1 text-gray-800">탈퇴하게 되면 일정 및 친구, 그룹이 모두 초기화 됩니다.</p>
                        <p className="mb-6 text-xs text-gray-500">owner로 등록된 그룹은 사라지게 됩니다.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                className="rounded bg-gray-200 px-4 py-2 text-sm"
                                onClick={() => setDeleteConfirmOpen(false)}
                                disabled={deleting}
                            >
                                취소
                            </button>
                            <button
                                className="rounded bg-red-500 px-4 py-2 text-sm text-white disabled:bg-gray-400"
                                onClick={handleDeleteAccount}
                                disabled={deleting}
                            >
                                {deleting ? '처리 중...' : '탈퇴하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
