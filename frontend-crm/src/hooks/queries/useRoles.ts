import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { roleService } from '@/services/role.service';
import type { RolePayload } from '@/types/role.types';
import { queryKeys } from './queryKeys';
import { MASTER_DATA_QUERY_KEY } from './useMasterData';

export const ROLES_QUERY_KEY = ['roles'] as const;

/** Admin › Roles: every role with its permissions and user counts. */
export function useRoles() {
    return useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: () => roleService.list(), staleTime: 15 * 1000 });
}

/**
 * Role writes refresh the roles, Admin › Users (role names and badges) and the user directory, and re-read the
 * signed-in user: the admin's own role may be the one that changed, and the app hides what it no longer allows.
 */
function useRoleMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    const queryClient = useQueryClient();
    const { refreshUser } = useAuth();
    return useMutation({
        mutationFn: fn,
        onSuccess: async () => {
            void refreshUser();
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
            void queryClient.invalidateQueries({ queryKey: MASTER_DATA_QUERY_KEY, refetchType: 'all' });
            await queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
        },
    });
}

export const useCreateRole = () => useRoleMutation((payload: RolePayload) => roleService.create(payload));
export const useUpdateRole = () => useRoleMutation(({ id, payload }: { id: number; payload: Partial<RolePayload> }) => roleService.update(id, payload));
export const useDeleteRole = () => useRoleMutation(({ id, reassignTo }: { id: number; reassignTo?: number }) => roleService.remove(id, reassignTo));
