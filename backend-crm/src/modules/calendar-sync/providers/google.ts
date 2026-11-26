import { GOOGLE_CALENDAR_API } from '../../integrations/integration.constants.js';
import { providerFetch } from './http.js';
import type { CalendarProviderAdapter, CallCtx, FetchImpl } from './types.js';

/**
 * Google Calendar v3 for one impersonated employee (addendum §2, §4.3). The token comes from the service account with
 * domain-wide delegation (googleServiceAccount.ts) and acts as the employee, so `calendars/primary` is theirs and
 * `ctx.mailbox` is not needed. The event operations join this adapter with the push engine (P2-3b).
 */

export interface AdapterOptions {
    fetchImpl?: FetchImpl;
}

export const googleCalendarUrl = (calendarId: string) => `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId || 'primary')}`;

export function createGoogleAdapter(options: AdapterOptions = {}): CalendarProviderAdapter {
    const fetchImpl = options.fetchImpl;
    return {
        key: 'google',

        /** One event id from now on, covered by `calendar.events.owned`. */
        async probeCalendar(ctx: CallCtx): Promise<void> {
            const params = new URLSearchParams({ maxResults: '1', timeMin: new Date().toISOString(), singleEvents: 'true', fields: 'items(id)' });
            await providerFetch(
                { method: 'GET', url: `${googleCalendarUrl(ctx.calendarId)}/events?${params.toString()}`, headers: { Authorization: `Bearer ${ctx.accessToken}` }, provider: 'google', operation: 'probe' },
                { fetchImpl, attempts: 2 },
            );
        },
    };
}
