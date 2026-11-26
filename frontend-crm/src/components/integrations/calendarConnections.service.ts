import type { ApiResponse } from '@/types/api.types';
import { apiClient } from '@/services/apiClient';
import { notifyCrmUpdate } from '@/services/crmSync';
import type { CalendarProvider, OwnConnections } from './calendarConnections.types';

/**
 * `/api/calendar-connections`: the signed-in user's own calendar connections. Also the sync entity:
 * `notifyCrmUpdate(CALENDAR_CONNECTIONS_ENDPOINT)` maps to the `calendarConnections` query keys (QueryProvider), so
 * every open tab refreshes after a connect or disconnect. Tokens never reach the browser.
 */
export const CALENDAR_CONNECTIONS_ENDPOINT = '/api/calendar-connections';
const BASE = CALENDAR_CONNECTIONS_ENDPOINT;
const enc = encodeURIComponent;

export const calendarConnectionsService = {
    async list(): Promise<OwnConnections> {
        return (await apiClient.get<ApiResponse<OwnConnections>>(BASE)).data;
    },
    /** Starts the provider sign-in: the answer sets a short-lived httpOnly cookie and gives the consent-screen URL. */
    async start(provider: CalendarProvider): Promise<{ authUrl: string }> {
        return (await apiClient.post<ApiResponse<{ authUrl: string }>>(`${BASE}/${enc(provider)}/start`)).data;
    },
    async disconnect(id: string): Promise<void> {
        await apiClient.post(`${BASE}/${enc(id)}/disconnect`);
        notifyCrmUpdate(BASE);
    },
};
