import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type CurrentProfile = {
    id: string;
    nickname: string | null;
    main_group_id: number | null;
};

export function useCurrentUser() {
    return useQuery({
        queryKey: queryKeys.currentUser,
        queryFn: async () => {
            const {
                data: { user },
                error,
            } = await supabase.auth.getUser();

            if (error) {
                throw error;
            }

            return user;
        },
        staleTime: 1000 * 60 * 30,
    });
}

export function useMyProfile() {
    const currentUserQuery = useCurrentUser();
    const profileId = currentUserQuery.data?.id;

    return useQuery({
        queryKey: profileId ? queryKeys.myProfile(profileId) : ['myProfile', 'anonymous'],
        queryFn: async () => {
            if (!profileId) return null;

            const { data, error } = await supabase
                .from('profiles')
                .select('id, nickname, main_group_id')
                .eq('id', profileId)
                .single();

            if (error) {
                throw error;
            }

            return data as CurrentProfile;
        },
        enabled: Boolean(profileId),
        staleTime: 1000 * 60 * 30,
    });
}
