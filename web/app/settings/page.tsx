'use client';

import { appAlert, appConfirm } from '@/components/AppDialogProvider';
import { type ReactNode, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';
import { useCurrentUser, useMyProfile } from '@/lib/useCurrentProfile';

type SettingsRowProps = {
    icon: string;
    label: string;
    sub?: string;
    right?: ReactNode;
    danger?: boolean;
    last?: boolean;
    onClick?: () => void;
};

function SettingsRow({ icon, label, sub, right, danger, last, onClick }: SettingsRowProps) {
    return (
        <button
            type="button"
            className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-[var(--oc-surface-2)] ${last ? '' : 'border-b border-[var(--oc-divider)]'}`}
            onClick={onClick}
        >
            <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-sm ${
                    danger ? 'bg-red-50 text-red-500' : 'bg-[var(--oc-tint)] text-[var(--oc-primary)]'
                }`}
                aria-hidden="true"
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium tracking-[-0.01em] ${danger ? 'text-red-500' : 'text-[var(--oc-text)]'}`}>{label}</span>
                {sub && <span className="mt-0.5 block text-[11px] tracking-[-0.01em] text-[var(--oc-text-secondary)]">{sub}</span>}
            </span>
            {right ?? <span className="text-[var(--oc-text-tertiary)]">›</span>}
        </button>
    );
}

function SettingsSection({ title, children, sub }: { title: string; children: ReactNode; sub?: string }) {
    return (
        <section className="mt-4">
            <h2 className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--oc-text-secondary)]">{title}</h2>
            <div className="overflow-hidden rounded-2xl border border-[var(--oc-divider)] bg-white">{children}</div>
            {sub && <p className="px-5 pt-2 text-[11px] tracking-[-0.01em] text-[var(--oc-text-tertiary)]">{sub}</p>}
        </section>
    );
}

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
            await appAlert('초대코드를 복사했습니다.');
        } catch (error) {
            console.error(error);
            await appAlert('초대코드 복사 실패');
        }
    };

    const handleLogout = async () => {
        const ok = await appConfirm('로그아웃할까요?');

        if (!ok) return;

        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error(error);
            await appAlert('로그아웃 실패');
            return;
        }

        queryClient.clear();
        router.push('/login');
    };

    const handleDeleteAccount = async () => {
        const user = currentUserQuery.data;

        if (!user) return;

        setDeleting(true);

        const { error: friendshipError } = await supabase
            .from('friendships')
            .delete()
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

        if (friendshipError) {
            console.error(friendshipError);
            await appAlert('탈퇴 처리 중 오류가 발생했습니다.');
            setDeleting(false);
            return;
        }

        const { data: ownedGroups, error: ownedGroupsError } = await supabase
            .from('groups')
            .select('id')
            .eq('profile_id', user.id)
            .eq('is_owner', true);

        if (ownedGroupsError) {
            console.error(ownedGroupsError);
            await appAlert('탈퇴 처리 중 오류가 발생했습니다.');
            setDeleting(false);
            return;
        }

        if (ownedGroups && ownedGroups.length > 0) {
            const ownedGroupIds = ownedGroups.map((g) => g.id);

            const { error: deleteOwnedError } = await supabase
                .from('groups')
                .delete()
                .in('id', ownedGroupIds);

            if (deleteOwnedError) {
                console.error(deleteOwnedError);
                await appAlert('탈퇴 처리 중 오류가 발생했습니다.');
                setDeleting(false);
                return;
            }
        }

        const { error: deleteUserGroupsError } = await supabase
            .from('groups')
            .delete()
            .eq('profile_id', user.id);

        if (deleteUserGroupsError) {
            console.error(deleteUserGroupsError);
            await appAlert('탈퇴 처리 중 오류가 발생했습니다.');
            setDeleting(false);
            return;
        }

        await supabase.auth.signOut();
        queryClient.clear();
        router.push('/login');
    };

    return (
        <main className="mx-auto max-w-md px-[5vw] pt-3 text-[var(--oc-text)]">
            <div className="px-1 pb-3 pt-1">
                <h1 className="text-2xl font-extrabold tracking-[-0.04em]">설정</h1>
                <p className="mt-1 text-xs font-medium tracking-[-0.01em] text-[var(--oc-text-secondary)]">계정과 OURCAL 사용 정보를 관리합니다.</p>
            </div>

            <div className="rounded-[18px] bg-[var(--oc-tint)] p-4">
                <p className="text-lg font-bold tracking-[-0.02em]">{profileQuery.data?.nickname || '이름 없음'}</p>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-[var(--oc-text-secondary)]">
                    <span>초대코드</span>
                    <span className="font-mono font-semibold text-[var(--oc-text)]">{inviteCode || '-'}</span>
                    <button className="ml-auto rounded-lg bg-white px-2 py-1 shadow-sm ring-1 ring-black/10" onClick={copyInviteCode} disabled={!inviteCode} aria-label="초대코드 복사">
                        📋
                    </button>
                </div>
            </div>

            <SettingsSection title="Account">
                <SettingsRow icon="👤" label="프로필" sub="닉네임과 초대코드를 확인합니다." />
                <SettingsRow icon="🚪" label="로그아웃" sub="현재 기기에서 세션을 종료합니다." onClick={handleLogout} last />
            </SettingsSection>

            <SettingsSection title="Danger Zone" sub="회원 탈퇴 시 일정, 친구, 그룹 정보가 초기화됩니다.">
                <SettingsRow icon="!" label="회원 탈퇴" sub="소유한 그룹은 함께 삭제됩니다." danger onClick={() => setDeleteConfirmOpen(true)} last />
            </SettingsSection>

            {deleteConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                        <h2 className="mb-3 text-lg font-bold">회원 탈퇴</h2>
                        <p className="mb-1 text-gray-800">탈퇴하게 되면 일정 및 친구, 그룹이 모두 초기화 됩니다.</p>
                        <p className="mb-6 text-xs text-gray-500">owner로 등록된 그룹은 사라지게 됩니다.</p>
                        <div className="flex justify-end gap-2">
                            <button className="rounded bg-gray-200 px-4 py-2 text-sm" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
                                취소
                            </button>
                            <button className="rounded bg-red-500 px-4 py-2 text-sm text-white disabled:bg-gray-400" onClick={handleDeleteAccount} disabled={deleting}>
                                {deleting ? '처리 중...' : '탈퇴하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
