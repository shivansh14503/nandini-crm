import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/auth.service';
import { profileService } from '@/services/profile.service';
import type { ChangePasswordPayload } from '@/types/auth.types';
import { MASTER_DATA_QUERY_KEY } from './useMasterData';
import type { ProfileDto, ProfileUpdate } from '@/types/profile.types';

export const ME_QUERY_KEY = ['me'] as const;
export const PROFILE_QUERY_KEY = [...ME_QUERY_KEY, 'profile'] as const;
export const SESSIONS_QUERY_KEY = [...ME_QUERY_KEY, 'sessions'] as const;

/** The signed-in user's own profile (My Profile). */
export function useMyProfile() {
    return useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => profileService.getProfile(), staleTime: 30 * 1000 });
}

/** Where the signed-in user is signed in. */
export function useMySessions() {
    return useQuery({ queryKey: SESSIONS_QUERY_KEY, queryFn: () => profileService.listSessions(), staleTime: 15 * 1000 });
}

/**
 * Profile / photo writes: the saved profile goes straight into the cache, its name and photo are merged into the auth
 * user (no extra /me request, so a failing re-read can't sign the user out) so the navbar updates at once, and the
 * users master data is refetched so pickers and owner columns show the new name.
 */
function useProfileWrite<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, toProfile: (result: TResult, prev?: ProfileDto) => ProfileDto | undefined) {
    const queryClient = useQueryClient();
    const { updateUser } = useAuth();
    return useMutation({
        mutationFn: fn,
        onSuccess: async (result) => {
            const next = toProfile(result, queryClient.getQueryData<ProfileDto>(PROFILE_QUERY_KEY));
            if (next) {
                queryClient.setQueryData(PROFILE_QUERY_KEY, next);
                updateUser({ fullName: next.fullName, firstName: next.firstName, lastName: next.lastName, photoUrl: next.photoUrl });
            }
            // Refetched even with no mounted observer (CrmDataBootstrap only prefetches it): loadMasterData also fills
            // the master-data store that non-React code reads. Not awaited, so the save doesn't wait on it.
            void queryClient.invalidateQueries({ queryKey: MASTER_DATA_QUERY_KEY, refetchType: 'all' });
            await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
        },
    });
}

export const useUpdateProfile = () => useProfileWrite((data: ProfileUpdate) => profileService.updateProfile(data), (profile) => profile);

export const useUploadPhoto = () =>
    useProfileWrite(
        ({ blob, fileName }: { blob: Blob; fileName?: string }) => profileService.uploadPhoto(blob, fileName),
        (res, prev) => (prev ? { ...prev, photoUrl: res.photoUrl } : undefined),
    );

export const useRemovePhoto = () =>
    useProfileWrite(
        () => profileService.removePhoto(),
        (res, prev) => (prev ? { ...prev, photoUrl: res.photoUrl } : undefined),
    );

function useSessionsMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    const queryClient = useQueryClient();
    return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY }) });
}

export const useRevokeSession = () => useSessionsMutation((id: string) => profileService.revokeSession(id));
export const useRevokeOtherSessions = () => useSessionsMutation(() => profileService.revokeOtherSessions());

/**
 * Changing the password signs out the user's other sessions, so both the profile and the session list refresh. It
 * also ends a must-change password (set by an admin): the auth user is updated at once, so navigation unlocks.
 */
export function useChangePassword() {
    const queryClient = useQueryClient();
    const { updateUser } = useAuth();
    return useMutation({
        mutationFn: (payload: ChangePasswordPayload) => authService.changePassword(payload),
        onSuccess: (result) => {
            const mustChangePassword = result.mustChangePassword ?? false;
            queryClient.setQueryData<ProfileDto>(PROFILE_QUERY_KEY, (prev) =>
                prev ? { ...prev, passwordChangedAt: result.passwordChangedAt, mustChangePassword } : prev,
            );
            updateUser({ mustChangePassword });
            return queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
        },
    });
}
