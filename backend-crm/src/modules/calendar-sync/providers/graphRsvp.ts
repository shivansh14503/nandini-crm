import { z } from 'zod';
import { GRAPH_MARKER_PROPERTY_ID } from '../sync.constants.js';
import { normalizeGraph, type ProviderEvent } from '../sync.shapes.js';
import { graphPreferHeader } from './graphEvents.js';
import { providerFetch } from './http.js';
import { graphUserUrl } from './microsoft.js';
import type { CalendarProviderAdapter, CallCtx, FetchImpl, RsvpReply } from './types.js';
import { graphEventSchema } from './wire.js';

/**
 * Microsoft Graph v1.0 for replies both ways (Calendar Phase 2 spec §13.3, P2-8), app-only on `/users/{mailbox}`
 * (addendum §8.7: never `/me`).
 *
 * - `findByICalUid`: `GET /users/{mailbox}/events?$filter=iCalUId eq '…'` (single instances only; recurring meetings
 *   are never imported, D19, and their per-occurrence iCalUIds are a Phase 4 matter).
 * - `respond`: `POST /users/{mailbox}/events/{id}/accept | tentativelyAccept | decline` with `sendResponse: true`
 *   [V]; Graph answers 202 with no body, so null is returned (the next pull reads the copy back).
 */

const listSchema = z.object({ value: z.array(z.unknown()).nullish() });

/** Graph action of a reply. */
export const GRAPH_RSVP_ACTIONS: Readonly<Record<RsvpReply, string>> = { accepted: 'accept', tentative: 'tentativelyAccept', declined: 'decline' };

/** OData string literal: single quotes doubled. */
const odataString = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function graphRsvpOps(fetchImpl?: FetchImpl): Pick<CalendarProviderAdapter, 'findByICalUid' | 'respond'> {
    const headers = (ctx: CallCtx) => ({ Authorization: `Bearer ${ctx.accessToken}`, Prefer: graphPreferHeader() });

    return {
        async findByICalUid(ctx, iCalUid): Promise<ProviderEvent | null> {
            const params = new URLSearchParams({
                $filter: `iCalUId eq ${odataString(iCalUid)}`,
                $top: '5',
                $expand: `singleValueExtendedProperties($filter=id eq '${GRAPH_MARKER_PROPERTY_ID}')`,
            });
            const { json } = await providerFetch(
                { method: 'GET', url: `${graphUserUrl(ctx.mailbox)}/events?${params.toString()}`, headers: headers(ctx), provider: 'microsoft', operation: 'find-ical' },
                { fetchImpl, schema: listSchema },
            );
            for (const item of json.value ?? []) {
                const parsed = graphEventSchema.safeParse(item);
                if (!parsed.success) continue;
                const event = normalizeGraph(parsed.data, ctx.accountEmail);
                if (event.status === 'active' && !event.recurring) return event;
            }
            return null;
        },

        async respond(ctx, id, reply): Promise<ProviderEvent | null> {
            await providerFetch(
                {
                    method: 'POST',
                    url: `${graphUserUrl(ctx.mailbox)}/events/${encodeURIComponent(id)}/${GRAPH_RSVP_ACTIONS[reply]}`,
                    headers: headers(ctx),
                    body: JSON.stringify({ sendResponse: true }),
                    provider: 'microsoft',
                    operation: 'rsvp',
                },
                { fetchImpl },
            );
            return null;
        },
    };
}
