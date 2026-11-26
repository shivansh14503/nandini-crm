import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { userAdminService } from '@/services/userAdmin.service';
import type { AdminUserListParams, CreateAdminUserPayload, UpdateAdminUserPayload } from '@/types/userAdmin.types';
import { queryKeys } from './queryKeys';
import { MASTER_DATA_QUERY_KEY } from './useMasterData';
import { PROFILE_QUERY_KEY } from './useProfile';

/** Admin › Users: one page of users. */
export function useAdminUsers(params: AdminUserListParams) {
    return useQuery({
        queryKey: queryKeys.users.adminList(params),
        queryFn: () => userAdminService.list(params),
        placeholderData: keepPreviousData,
        staleTime: 15 * 1000,
    });
}

/** Roles, departments and managers in use (filters and the user form), plus the company email domains. */
export function useAdminUsersMeta() {
    return useQuery({ queryKey: queryKeys.users.adminMeta(), queryFn: () => userAdminService.meta(), staleTime: 30 * 1000 });
}

/**
 * User writes refresh the users list and meta, the user directory (pickers, owner columns) and the People table of
 * Admin › API Integrations (emails). A write to the admin's own account also re-reads the signed-in user, so the
 * navbar and My Profile show the new name or role.
 */
function useUserAdminMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, affectedId: (args: TArgs) => number | null) {
    const queryClient = useQueryClient();
    const { user, refreshUser } = useAuth();
    return useMutation({
        mutationFn: fn,
        onSuccess: async (_result, args) => {
            void queryClient.invalidateQueries({ queryKey: MASTER_DATA_QUERY_KEY, refetchType: 'all' });
            void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.people() });
            if (user && affectedId(args) === user.id) {
                void refreshUser();
                void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
        },
    });
}

export const useCreateAdminUser = () => useUserAdminMutation((payload: CreateAdminUserPayload) => userAdminService.create(payload), () => null);

export const useUpdateAdminUser = () =>
    useUserAdminMutation(
        ({ id, payload }: { id: number; payload: UpdateAdminUserPayload }) => userAdminService.update(id, payload),
        ({ id }) => id,
    );

export const useDeactivateAdminUser = () => useUserAdminMutation((id: number) => userAdminService.deactivate(id), (id) => id);

export const useActivateAdminUser = () => useUserAdminMutation((id: number) => userAdminService.activate(id), (id) => id);

export const useResetAdminUserPassword = () =>
    useUserAdminMutation(({ id, password }: { id: number; password?: string }) => userAdminService.resetPassword(id, password), () => null);
