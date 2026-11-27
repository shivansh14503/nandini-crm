import { z } from 'zod';
import { normalizeGoogle, type ProviderEvent } from '../sync.shapes.js';
import { googleCalendarUrl } from './google.js';
import { ProviderBadRequestError, providerFetch } from './http.js';
import type { CalendarProviderAdapter, CallCtx, FetchImpl, RsvpReply } from './types.js';
import { googleEventSchema } from './wire.js';

/**
 * Google Calendar v3 for replies both ways (Calendar Phase 2 spec §13.3, P2-8), as the impersonated employee.
 *
 * - `findByICalUid`: `GET /calendars/primary/events?iCalUID=…` (the one live copy of that meeting in their calendar).
 * - `respond`: `GET` their copy → set the `self` attendee's `responseStatus` → `PATCH attendees` with `If-Match` (the
 *   etag just read) and `sendUpdates=all`, so the organizer gets the reply. The attendee list is sent back exactly as
 *   read (unknown keys such as `comment` or `additionalGuests` kept), only the person's own entry changes: an attendee
 *   may change nothing else [U]. Whether the narrow `calendar.events.owned` scope may write an invitation copy is
 *   first-run check F3 (addendum AC3): a refusal comes back as a `ProviderError` (403), which the RSVP job records on
 *   the link; the fallback is the broader `calendar.events` scope in the Admin console entry.
 */

const listSchema = z.object({ items: z.array(z.unknown()).nullish() });

/** The copy as read for the reply: the attendee entries untouched (passthrough), plus the etag. */
const rawAttendeesSchema = z.object({
    etag: z.string().nullish(),
    organizer: z.object({ self: z.boolean().nullish() }).nullish(),
    attendees: z.array(z.record(z.string(), z.unknown())).nullish(),
});

const lc = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** The attendee list with the person's own entry answered (pure); null when they aren't on it. */
export function withOwnReply(attendees: readonly Record<string, unknown>[], accountEmail: string, reply: RsvpReply): Record<string, unknown>[] | null {
    const mine = attendees.findIndex((a) => a.self === true) >= 0 ? attendees.findIndex((a) => a.self === true) : attendees.findIndex((a) => lc(a.email) === lc(accountEmail));
    if (mine < 0) return null;
    return attendees.map((a, index) => (index === mine ? { ...a, responseStatus: reply } : a));
}

export function googleRsvpOps(fetchImpl?: FetchImpl): Pick<CalendarProviderAdapter, 'findByICalUid' | 'respond'> {
    const eventsUrl = (ctx: CallCtx) => `${googleCalendarUrl(ctx.calendarId)}/events`;
    const auth = (ctx: CallCtx) => ({ Authorization: `Bearer ${ctx.accessToken}` });

    return {
        async findByICalUid(ctx, iCalUid): Promise<ProviderEvent | null> {
            const params = new URLSearchParams({ iCalUID: iCalUid, showDeleted: 'false', maxResults: '5' });
            const { json } = await providerFetch(
                { method: 'GET', url: `${eventsUrl(ctx)}?${params.toString()}`, headers: auth(ctx), provider: 'google', operation: 'find-ical' },
                { fetchImpl, schema: listSchema },
            );
            for (const item of json.items ?? []) {
                const parsed = googleEventSchema.safeParse(item);
                if (!parsed.success) continue;
                const event = normalizeGoogle(parsed.data, ctx.accountEmail);
                if (event.status === 'active' && !event.recurring) return event;
            }
            return null;
        },

        async respond(ctx, id, reply): Promise<ProviderEvent | null> {
            const url = `${eventsUrl(ctx)}/${encodeURIComponent(id)}`;
            const { json: copy } = await providerFetch({ method: 'GET', url, headers: auth(ctx), provider: 'google', operation: 'rsvp-read' }, { fetchImpl, schema: rawAttendeesSchema });
            if (copy.organizer?.self === true) {
                throw new ProviderBadRequestError({ provider: 'google', operation: 'rsvp', status: 400, code: 'organizer_copy', providerMessage: 'This is the organizer’s own copy.' });
            }
            const attendees = withOwnReply(copy.attendees ?? [], ctx.accountEmail, reply);
            if (!attendees) {
                throw new ProviderBadRequestError({ provider: 'google', operation: 'rsvp', status: 400, code: 'not_invited', providerMessage: 'The person is not on this event’s guest list.' });
            }
            const { json } = await providerFetch(
                {
                    method: 'PATCH',
                    url: `${url}?sendUpdates=all`,
                    headers: { ...auth(ctx), ...(copy.etag ? { 'If-Match': copy.etag } : {}) },
                    body: JSON.stringify({ attendees }),
                    provider: 'google',
                    operation: 'rsvp',
                },
                { fetchImpl, schema: googleEventSchema },
            );
            return normalizeGoogle(json, ctx.accountEmail);
        },
    };
}
