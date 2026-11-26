import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { refreshAfterPull } from '@/components/integrations/useCalendarConnections';
import { integrationsAdminService } from '@/services/integrationsAdmin.service';
import type { CalendarSyncSettings, IntegrationProviderKey, PersonCalendarPayload, PersonEmailPayload, SaveProviderPayload, TestConnectionPayload } from '@/types/integration.types';

/** Admin › API Integrations: providers, readiness, calendar settings and Followup Types in one read. */
export function useIntegrationsAdmin() {
    return useQuery({ queryKey: queryKeys.integrations.admin(), queryFn: integrationsAdminService.get, staleTime: 30 * 1000 });
}

/** Active, non-group users with their company email issue and their calendar sync. */
export function usePeople() {
    return useQuery({ queryKey: queryKeys.integrations.people(), queryFn: integrationsAdminService.people, staleTime: 30 * 1000 });
}

function useIntegrationsMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
        },
    });
}

export const useSaveProvider = () =>
    useIntegrationsMutation(({ provider, payload }: { provider: IntegrationProviderKey; payload: SaveProviderPayload }) => integrationsAdminService.saveProvider(provider, payload));
export const useClearProviderSecret = () => useIntegrationsMutation((provider: IntegrationProviderKey) => integrationsAdminService.clearSecret(provider));
export const useTestProvider = () =>
    useIntegrationsMutation(({ provider, payload }: { provider: IntegrationProviderKey; payload?: TestConnectionPayload }) => integrationsAdminService.testProvider(provider, payload));
export const useSaveCalendarSettings = () => useIntegrationsMutation((patch: Partial<CalendarSyncSettings>) => integrationsAdminService.saveSettings(patch));
export const useSaveSyncTypes = () => useIntegrationsMutation((changes: Record<string, boolean>) => integrationsAdminService.saveSyncTypes(changes));
export const useSaveVideoTypes = () => useIntegrationsMutation((changes: Record<string, boolean>) => integrationsAdminService.saveVideoTypes(changes));
/** The user directory (master data) carries emails too: the service broadcasts MASTER_DATA_SYNC_ENTITY, so every tab refreshes it. */
export const useSetPersonEmail = () =>
    useIntegrationsMutation(({ username, payload }: { username: string; payload: PersonEmailPayload }) => integrationsAdminService.setPersonEmail(username, payload));
/** A person's calendar choice (QueryProvider also refreshes the person's own status card). */
export const useSetPersonCalendar = () =>
    useIntegrationsMutation(({ username, payload }: { username: string; payload: PersonCalendarPayload }) => integrationsAdminService.setPersonCalendar(username, payload));
export const useCheckPersonCalendar = () => useIntegrationsMutation((username: string) => integrationsAdminService.checkPersonCalendar(username));
/** "Sync now" on a person: their calendar changes come back (activities refresh when the pull changed some). */
export function useSyncPersonCalendar() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (username: string) => integrationsAdminService.syncPersonCalendar(username),
        // refreshAfterPull re-reads the People rows too (again after a queued pull has had time to run).
        onSuccess: (person) => refreshAfterPull(queryClient, person.sync),
    });
}
