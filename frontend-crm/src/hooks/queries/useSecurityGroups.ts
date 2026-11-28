import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { securityGroupService } from '@/services/securityGroup.service';
import type { SecurityGroupPayload } from '@/types/securityGroup.types';

export const SECURITY_GROUPS_QUERY_KEY = ['securityGroups'] as const;
export const SECURITY_GROUP_USERS_QUERY_KEY = ['securityGroups', 'users'] as const;

/** Admin › Security Groups: every group with its members. */
export function useSecurityGroups() {
    return useQuery({ queryKey: SECURITY_GROUPS_QUERY_KEY, queryFn: () => securityGroupService.list(), staleTime: 15 * 1000 });
}

/** Users the member picker offers (every user, active first, with the groups they are in). */
export function useSecurityGroupUsers(enabled = true) {
    return useQuery({ queryKey: SECURITY_GROUP_USERS_QUERY_KEY, queryFn: () => securityGroupService.users(), staleTime: 15 * 1000, enabled });
}

/** Group writes refresh the groups and re-read the signed-in user: the admin's own teammates may have changed. */
function useGroupMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    const queryClient = useQueryClient();
    const { refreshUser } = useAuth();
    return useMutation({
        mutationFn: fn,
        onSuccess: async () => {
            void refreshUser();
            await queryClient.invalidateQueries({ queryKey: SECURITY_GROUPS_QUERY_KEY });
        },
    });
}

export const useCreateSecurityGroup = () =>
    useGroupMutation((payload: SecurityGroupPayload & { memberIds: number[] }) => securityGroupService.create(payload));
export const useUpdateSecurityGroup = () =>
    useGroupMutation(({ id, payload }: { id: number; payload: Partial<SecurityGroupPayload> & { isActive?: boolean } }) => securityGroupService.update(id, payload));
export const useSetSecurityGroupMembers = () =>
    useGroupMutation(({ id, memberIds }: { id: number; memberIds: number[] }) => securityGroupService.setMembers(id, memberIds));
export const useDeleteSecurityGroup = () => useGroupMutation((id: number) => securityGroupService.remove(id));
