import type { ApiResponse } from '@/types/api.types';
import { apiClient } from '@/services/apiClient';
import type { OwnCalendarSync, PullRequestResult } from './calendarConnections.types';

/**
 * `/api/calendar-connections`: the signed-in employee's own company calendar sync, read-only (admins set it up on
 * Admin › API Integrations; nobody connects or disconnects here). Also the sync entity:
 * `notifyCrmUpdate(CALENDAR_CONNECTIONS_ENDPOINT)` maps to the `calendarConnections` query keys (QueryProvider).
 * Tokens never reach the browser.
 */
export const CALENDAR_CONNECTIONS_ENDPOINT = '/api/calendar-connections';

export const calendarConnectionsService = {
    async getOwn(): Promise<OwnCalendarSync> {
        return (await apiClient.get<ApiResponse<OwnCalendarSync>>(CALENDAR_CONNECTIONS_ENDPOINT)).data;
    },
    /** Sync now (`manual`) or the silent pull when the calendar page opens (`page`): brings calendar changes back. */
    async syncNow(reason: 'manual' | 'page' = 'manual'): Promise<PullRequestResult> {
        return (await apiClient.post<ApiResponse<PullRequestResult>>(`${CALENDAR_CONNECTIONS_ENDPOINT}/sync`, { reason })).data;
    },
};
