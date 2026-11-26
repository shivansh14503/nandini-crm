import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { calendarConnectionsService } from './calendarConnections.service';
import type { CalendarProvider } from './calendarConnections.types';

/** The signed-in user's calendar connections and the providers they may connect. */
export function useOwnCalendarConnections(enabled = true) {
    return useQuery({ queryKey: queryKeys.calendarConnections.own(), queryFn: calendarConnectionsService.list, staleTime: 30 * 1000, enabled });
}

/** Asks the API for the consent-screen URL, then leaves the CRM for it (the callback brings the browser back). */
export function useStartCalendarConnect() {
    return useMutation({
        mutationFn: (provider: CalendarProvider) => calendarConnectionsService.start(provider),
        onSuccess: ({ authUrl }) => {
            window.location.assign(authUrl);
        },
    });
}

export function useDisconnectCalendar() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => calendarConnectionsService.disconnect(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.calendarConnections.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
        },
    });
}
