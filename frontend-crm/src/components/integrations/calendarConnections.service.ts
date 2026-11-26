import type { ApiResponse } from '@/types/api.types';
import { apiClient } from '@/services/apiClient';
import type { OwnCalendarSync } from './calendarConnections.types';

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
};
