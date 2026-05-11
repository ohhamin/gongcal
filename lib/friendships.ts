import { supabase } from '@/lib/supabase';

export const FRIEND_LIMIT = 3;

/**
 * 특정 유저가 requester 또는 addressee로 연결된 friendship row 수를 계산합니다.
 *
 * Claude Code 협업 메모:
 * - 현재 정책은 pending/accepted를 모두 포함해 최대 3건으로 제한합니다.
 * - 친구 요청 생성과 수락 로직이 같은 기준을 쓰도록 이 함수를 재사용하세요.
 * - 클라이언트 가드는 UX용입니다. 동시 요청까지 막으려면 DB trigger/RPC에서 같은 정책을 보강해야 합니다.
 */
export async function getFriendshipCountByProfileId(profileId: string) {
    const { count, error } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

    if (error) {
        throw error;
    }

    return count || 0;
}
