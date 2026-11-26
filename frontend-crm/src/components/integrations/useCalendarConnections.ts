import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { calendarConnectionsService } from './calendarConnections.service';

/** While the first-sync copy runs (P2-3c), the status is asked for again every 15 s so its progress line moves... */
const BACKFILL_POLL_MS = 15 * 1000;
/** ...for up to 5 minutes per page visit (a stopped worker must not keep a profile tab polling for ever). */
const BACKFILL_POLL_MAX_MS = 5 * 60 * 1000;

/** The signed-in employee's own company calendar sync (status only). `pollBackfill`: the profile card's progress line. */
export function useOwnCalendarSync(enabled = true, pollBackfill = false) {
    // When this hook's page was opened: polling stops BACKFILL_POLL_MAX_MS after it (reopening the page polls again).
    const [startedAt] = useState(() => Date.now());
    return useQuery({
        queryKey: queryKeys.calendarConnections.own(),
        queryFn: calendarConnectionsService.getOwn,
        staleTime: 60 * 1000,
        enabled,
        refetchInterval: (query) => {
            if (!pollBackfill || Date.now() - startedAt > BACKFILL_POLL_MAX_MS) return false;
            const calendar = query.state.data?.calendar;
            // 'off' (CALENDAR_SYNC_ENABLED=false): nothing is being copied, so nothing to poll for.
            return calendar?.status === 'ok' && calendar.backfill?.state === 'waiting' ? BACKFILL_POLL_MS : false;
        },
    });
}
