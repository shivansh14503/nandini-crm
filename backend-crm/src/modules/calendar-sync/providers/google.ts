import { z } from 'zod';
import { GOOGLE_CALENDAR_API } from '../../integrations/integration.constants.js';
import { BUSY_PROVIDER_TIMEOUT_MS } from '../busy.constants.js';
import { providerFetch } from './http.js';
import type { CalendarProviderAdapter, CallCtx, FetchImpl, FreeBusyRequest, FreeBusyResult, ProviderBusyBlock } from './types.js';

/**
 * Google Calendar v3 for one impersonated employee (addendum §2, §4.3). The token comes from the service account with
 * domain-wide delegation (googleServiceAccount.ts) and acts as the employee, so `calendars/primary` is theirs and
 * `ctx.mailbox` is not needed. The event operations join this adapter with the push engine (P2-3b).
 */

export interface AdapterOptions {
    fetchImpl?: FetchImpl;
}

export const googleCalendarUrl = (calendarId: string) => `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId || 'primary')}`;

/** `POST /freeBusy` answer: per calendar its busy ranges or its errors (other fields ignored). */
const freeBusyCalendarSchema = z.object({
    busy: z.array(z.object({ start: z.string(), end: z.string() })).optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
});
const freeBusySchema = z.object({ calendars: z.record(z.string(), freeBusyCalendarSchema).optional() });
export type GoogleFreeBusyCalendar = z.infer<typeof freeBusyCalendarSchema>;

/** One calendar of a `/freeBusy` answer → blocks, or the first error reason (a fixed Google code such as `notFound`). Pure. */
export function googleFreeBusyResult(calendar: GoogleFreeBusyCalendar | undefined): FreeBusyResult {
    if (!calendar) return { error: 'missing' };
    if (calendar.errors?.length) return { error: (calendar.errors[0].reason || 'error').slice(0, 50) };
    const busy: ProviderBusyBlock[] = [];
    for (const range of calendar.busy ?? []) {
        const start = new Date(range.start);
        const end = new Date(range.end);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) busy.push({ start, end, kind: 'busy' });
    }
    return { busy };
}

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

        /**
         * `POST /freeBusy` as the impersonated person (`calendar.events.freebusy`): `items` = the colleagues' emails
         * (≤ 50, `calendarExpansionMax` 50), times in UTC. Workspace answers per calendar with `busy` or `errors`
         * (`notFound` when the person may not see that calendar's free/busy).
         */
        async freeBusy(ctx: CallCtx, request: FreeBusyRequest): Promise<Map<string, FreeBusyResult>> {
            const emails = [...new Set(request.emails.map((e) => e.toLowerCase()))];
            const { json } = await providerFetch(
                {
                    method: 'POST',
                    url: `${GOOGLE_CALENDAR_API}/freeBusy`,
                    headers: { Authorization: `Bearer ${ctx.accessToken}` },
                    body: JSON.stringify({ timeMin: request.start.toISOString(), timeMax: request.end.toISOString(), timeZone: 'UTC', items: emails.map((id) => ({ id })) }),
                    provider: 'google',
                    operation: 'freebusy',
                },
                { fetchImpl, attempts: 1, timeoutMs: BUSY_PROVIDER_TIMEOUT_MS, schema: freeBusySchema },
            );
            const calendars = new Map(Object.entries(json.calendars ?? {}).map(([id, calendar]) => [id.toLowerCase(), calendar]));
            return new Map(emails.map((email) => [email, googleFreeBusyResult(calendars.get(email))]));
        },
    };
}
