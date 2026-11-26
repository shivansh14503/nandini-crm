import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { calendarConnectionsService } from './calendarConnections.service';

/** The signed-in employee's own company calendar sync (status only). */
export function useOwnCalendarSync(enabled = true) {
    return useQuery({ queryKey: queryKeys.calendarConnections.own(), queryFn: calendarConnectionsService.getOwn, staleTime: 60 * 1000, enabled });
}
