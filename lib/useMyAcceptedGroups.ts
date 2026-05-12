import { useQuery } from '@tanstack/react-query';

import { getMyAcceptedGroups } from '@/lib/groups';
import { queryKeys } from '@/lib/queryKeys';
import { useCurrentUser } from '@/lib/useCurrentProfile';

export function useMyAcceptedGroups() {
    const currentUserQuery = useCurrentUser();
    const profileId = currentUserQuery.data?.id;

    return useQuery({
        queryKey: profileId ? queryKeys.myAcceptedGroups(profileId) : ['myAcceptedGroups', 'anonymous'],
        queryFn: async () => {
            if (!profileId) return [];

            return getMyAcceptedGroups(profileId);
        },
        enabled: Boolean(profileId),
        staleTime: 1000 * 60 * 30,
    });
}
