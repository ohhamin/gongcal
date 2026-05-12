export const queryKeys = {
    currentUser: ['currentUser'] as const,
    myProfile: (profileId: string) => ['myProfile', profileId] as const,
    myAcceptedGroups: (profileId: string) => ['myAcceptedGroups', profileId] as const,
    myGroups: (profileId: string) => ['myGroups', profileId] as const,
    groupMembers: (groupId: number) => ['groupMembers', groupId] as const,
    acceptedFriends: (profileId: string) => ['acceptedFriends', profileId] as const,
    friends: (profileId: string) => ['friends', profileId] as const,
    dayEvents: (date: string, groupId: number | null, profileId: string) => ['dayEvents', date, groupId, profileId] as const,
};
