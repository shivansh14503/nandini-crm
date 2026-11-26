import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { calendarConnectionsService } from './calendarConnections.service';

/** While the first-sync copy runs (P2-3c), the status is asked for again every 15 s so its progress line moves. */
const BACKFILL_POLL_MS = 15 * 1000;

/** The signed-in employee's own company calendar sync (status only). `pollBackfill`: the profile card's progress line. */
export function useOwnCalendarSync(enabled = true, pollBackfill = false) {
    return useQuery({
        queryKey: queryKeys.calendarConnections.own(),
        queryFn: calendarConnectionsService.getOwn,
        staleTime: 60 * 1000,
        enabled,
        refetchInterval: (query) => {
            if (!pollBackfill) return false;
            const calendar = query.state.data?.calendar;
            return calendar?.status === 'ok' && calendar.backfill?.state === 'waiting' ? BACKFILL_POLL_MS : false;
        },
    });
}
