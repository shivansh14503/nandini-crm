import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { calendarConnectionsService } from './calendarConnections.service';
import type { PullRequestResult } from './calendarConnections.types';

/** The signed-in employee's own company calendar sync (status only). */
export function useOwnCalendarSync(enabled = true) {
    return useQuery({ queryKey: queryKeys.calendarConnections.own(), queryFn: calendarConnectionsService.getOwn, staleTime: 60 * 1000, enabled });
}

/** Delay before re-reading activities after a queued pull (the job usually finishes within seconds). */
const QUEUED_REFRESH_MS = 8_000;

/**
 * After a pull request: the status card refreshes, and activities (plus the lead / opportunity follow-ups a calendar
 * move writes back) are re-read when the pull changed something, or a little later when it was queued.
 */
export function refreshAfterPull(queryClient: QueryClient, result: PullRequestResult): void {
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendarConnections.all });
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    };
    if (result.status === 'done' && result.changed) refresh();
    else if (result.status === 'queued') setTimeout(refresh, QUEUED_REFRESH_MS);
}

/** "Sync now" (and the silent pull when the calendar page opens): brings changes made in the calendar back. */
export function useSyncOwnCalendar() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (reason: 'manual' | 'page' = 'manual') => calendarConnectionsService.syncNow(reason),
        onSuccess: (result) => refreshAfterPull(queryClient, result),
    });
}

/** The page pull waits this long between visits (the server also refuses a page pull within 3 minutes of the last). */
const PAGE_PULL_GAP_MS = 3 * 60 * 1000;
const PAGE_PULL_KEY = 'crm.calendarPagePull';
let lastPagePull = 0;

function pagePullDue(now: number): boolean {
    let last = lastPagePull;
    try {
        last = Math.max(last, Number(window.sessionStorage.getItem(PAGE_PULL_KEY)) || 0);
    } catch {
        // sessionStorage unavailable (private mode): the in-memory time still debounces.
    }
    return now - last >= PAGE_PULL_GAP_MS;
}

function markPagePull(now: number): void {
    lastPagePull = now;
    try {
        window.sessionStorage.setItem(PAGE_PULL_KEY, String(now));
    } catch {
        // ignore
    }
}

/**
 * The silent pull when the CRM calendar page opens (P2-5): asks once per visit (at most every 3 minutes per tab) for
 * the employee's calendar changes, so a meeting moved in Google / Outlook a minute ago shows moved. Only for a synced
 * calendar; failures stay silent (the poll brings the changes anyway).
 */
export function useCalendarPagePull(calendarStatus: string | null | undefined): void {
    const queryClient = useQueryClient();
    useEffect(() => {
        if (calendarStatus !== 'ok') return;
        const now = Date.now();
        if (!pagePullDue(now)) return;
        markPagePull(now);
        calendarConnectionsService
            .syncNow('page')
            .then((result) => refreshAfterPull(queryClient, result))
            .catch(() => undefined);
    }, [calendarStatus, queryClient]);
}
