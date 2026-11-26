import { z } from 'zod';
import { normalizeGoogle, type ProviderEvent } from '../sync.shapes.js';
import { googleCalendarUrl } from './google.js';
import { providerFetch } from './http.js';
import type { CalendarProviderAdapter, ChangePage, FetchImpl } from './types.js';
import { googleEventSchema } from './wire.js';

/**
 * Google Calendar v3 `events.list` for the pull (Calendar Phase 2 spec §7.4, §8.7; P2-5), as the impersonated
 * employee on their `primary` calendar (`calendar.events.owned` covers list with sync tokens [V]).
 *
 * - Full sync: `timeMin` = the window start (now − 7 days), `singleEvents=false` (so a series shows as its master with
 *   `recurrence`, which the CRM refuses, D19), `showDeleted=false`; the last page carries `nextSyncToken`.
 * - Incremental: `syncToken` only (Google refuses it together with `timeMin`); deleted events come back with
 *   `status: 'cancelled'`. 410 (`fullSyncRequired`) → `CursorExpiredError` → the pull starts over with a full sync.
 * - Pages: `maxResults=250`; every following page repeats the first page's parameters plus `pageToken` [V].
 * The sync / page tokens are never logged (providerFetch messages carry no URL; utils/redactUrl.ts covers request logs).
 */

export const GOOGLE_LIST_PAGE_SIZE = 250;

const listSchema = z.object({
    items: z.array(z.unknown()).nullish(),
    nextPageToken: z.string().nullish(),
    nextSyncToken: z.string().nullish(),
});

/** The query of one `events.list` page (pure, tested). */
export function googleListParams(request: { cursor: string | null; pageToken?: string; window: { start: Date } }): URLSearchParams {
    const params = new URLSearchParams({ maxResults: String(GOOGLE_LIST_PAGE_SIZE) });
    if (request.cursor) params.set('syncToken', request.cursor);
    else {
        params.set('timeMin', request.window.start.toISOString());
        params.set('singleEvents', 'false');
        params.set('showDeleted', 'false');
    }
    if (request.pageToken) params.set('pageToken', request.pageToken);
    return params;
}

export function googleChangeOps(fetchImpl?: FetchImpl): Pick<CalendarProviderAdapter, 'listChanges'> {
    return {
        async listChanges(ctx, request): Promise<ChangePage> {
            const { json } = await providerFetch(
                {
                    method: 'GET',
                    url: `${googleCalendarUrl(ctx.calendarId)}/events?${googleListParams(request).toString()}`,
                    headers: { Authorization: `Bearer ${ctx.accessToken}` },
                    provider: 'google',
                    operation: 'list-changes',
                },
                { fetchImpl, schema: listSchema, cursor: true },
            );
            const events: ProviderEvent[] = [];
            let unreadable = 0;
            for (const item of json.items ?? []) {
                const parsed = googleEventSchema.safeParse(item);
                if (parsed.success) events.push(normalizeGoogle(parsed.data, ctx.accountEmail));
                else unreadable += 1;
            }
            return {
                events,
                removedIds: [],
                unreadable,
                ...(json.nextPageToken ? { nextPageToken: json.nextPageToken } : {}),
                ...(!json.nextPageToken && json.nextSyncToken ? { nextCursor: json.nextSyncToken } : {}),
            };
        },
    };
}
