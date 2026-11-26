import { z } from 'zod';
import { GRAPH_API } from '../../integrations/integration.constants.js';
import { normalizeGraph, type ProviderEvent } from '../sync.shapes.js';
import { graphPreferHeader } from './graphEvents.js';
import { CursorExpiredError, providerFetch } from './http.js';
import { graphUserUrl } from './microsoft.js';
import type { CalendarProviderAdapter, ChangePage, FetchImpl } from './types.js';
import { graphEventSchema } from './wire.js';

/**
 * Microsoft Graph `/users/{mailbox}/calendarView/delta` for the pull (Calendar Phase 2 spec §7.5, §8.7; admin-managed
 * model addendum §8.4; P2-5), with the tenant-wide app token (`Calendars.Read`+ application [V]).
 *
 * - Full sync: `startDateTime` / `endDateTime` = the window (now − 7 days … now + 400 days). The delta link stays tied
 *   to that window, so the nightly job re-baselines windows older than 30 days (a new full sync).
 * - Pages follow `@odata.nextLink`; the last page has `@odata.deltaLink`, stored as the cursor. Both are absolute Graph
 *   URLs carrying `$skiptoken` / `$deltatoken`: never logged, and only ever followed when they point at the Graph API
 *   itself (a stored or answered link elsewhere is refused, so the cursor can't be used to send the token elsewhere).
 * - `@removed` entries carry an id only (deleted, or moved out of the window): the pull reads each linked one back.
 * - Headers: immutable ids, the business zone's Windows name, 100 per page. Delta can't `$expand` the CRM marker
 *   property, so relinks by marker are Google-only; Graph relinks go by iCalUId (syncKey).
 * 410 / `syncStateNotFound` → `CursorExpiredError` → full sync.
 */

export const GRAPH_DELTA_PAGE_SIZE = 100;

const deltaSchema = z.object({
    value: z.array(z.unknown()).nullish(),
    '@odata.nextLink': z.string().nullish(),
    '@odata.deltaLink': z.string().nullish(),
});

const removedSchema = z.object({ id: z.string(), '@removed': z.object({ reason: z.string().nullish() }).passthrough() });

/** A Graph link (cursor / next page) the pull may follow: https, on the Graph API origin and version. Pure. */
export function isGraphLink(url: string): boolean {
    try {
        const parsed = new URL(url);
        const base = new URL(GRAPH_API);
        return parsed.protocol === 'https:' && parsed.host === base.host && parsed.pathname.startsWith(`${base.pathname}/`) && !parsed.username && !parsed.password;
    } catch {
        return false;
    }
}

/** The URL of one delta page (pure, tested). */
export function graphDeltaUrl(mailbox: string, request: { cursor: string | null; pageToken?: string; window: { start: Date; end: Date } }): string {
    if (request.pageToken) return request.pageToken;
    if (request.cursor) return request.cursor;
    const params = new URLSearchParams({ startDateTime: request.window.start.toISOString(), endDateTime: request.window.end.toISOString() });
    return `${graphUserUrl(mailbox)}/calendarView/delta?${params.toString()}`;
}

export function graphChangeOps(fetchImpl?: FetchImpl): Pick<CalendarProviderAdapter, 'listChanges'> {
    return {
        async listChanges(ctx, request): Promise<ChangePage> {
            const url = graphDeltaUrl(ctx.mailbox, request);
            if (!isGraphLink(url)) {
                // A cursor that isn't a Graph link can't be used: start again with a full sync.
                throw new CursorExpiredError({ provider: 'microsoft', operation: 'list-changes', status: 0, code: 'cursor_invalid' });
            }
            const { json } = await providerFetch(
                {
                    method: 'GET',
                    url,
                    headers: { Authorization: `Bearer ${ctx.accessToken}`, Prefer: `${graphPreferHeader()}, odata.maxpagesize=${GRAPH_DELTA_PAGE_SIZE}` },
                    provider: 'microsoft',
                    operation: 'list-changes',
                },
                { fetchImpl, schema: deltaSchema, cursor: true },
            );
            const events: ProviderEvent[] = [];
            const removedIds: string[] = [];
            let unreadable = 0;
            for (const item of json.value ?? []) {
                const removed = removedSchema.safeParse(item);
                if (removed.success) {
                    removedIds.push(removed.data.id);
                    continue;
                }
                const parsed = graphEventSchema.safeParse(item);
                if (parsed.success) events.push(normalizeGraph(parsed.data));
                else unreadable += 1;
            }
            const next = json['@odata.nextLink'] ?? null;
            const delta = json['@odata.deltaLink'] ?? null;
            if (next && !isGraphLink(next)) throw new CursorExpiredError({ provider: 'microsoft', operation: 'list-changes', status: 0, code: 'cursor_invalid' });
            return {
                events,
                removedIds,
                unreadable,
                ...(next ? { nextPageToken: next } : {}),
                ...(!next && delta && isGraphLink(delta) ? { nextCursor: delta } : {}),
            };
        },
    };
}
