import { toGoogleEvent, toGooglePatch } from '../sync.mapping.google.js';
import { normalizeGoogle } from '../sync.shapes.js';
import { ProviderBadRequestError, ProviderConflictError, providerFetch, ProviderNotFoundError, RequestedIdTakenError } from './http.js';
import { googleCalendarUrl } from './google.js';
import type { CalendarProviderAdapter, CallCtx, CreateEventInput, FetchImpl } from './types.js';
import { googleEventSchema, type GoogleEventWire } from './wire.js';

/**
 * Google Calendar v3 event operations of the push engine (Calendar Phase 2 spec §7.4, §9.2). `sendUpdates=all` only
 * when the push says so (D41); `If-Match` on patches (412 on a stale etag [V]); never `iCalUID` in a body. The token is
 * the impersonated employee's (service account with domain-wide delegation), so `calendars/primary` is theirs.
 */

type EventOps = Pick<CalendarProviderAdapter, 'createEvent' | 'patchEvent' | 'cancelEvent' | 'getEvent' | 'undeleteEvent'>;

export function googleEventOps(fetchImpl?: FetchImpl): EventOps {
    const eventsUrl = (ctx: CallCtx) => `${googleCalendarUrl(ctx.calendarId)}/events`;
    const eventUrl = (ctx: CallCtx, id: string) => `${eventsUrl(ctx)}/${encodeURIComponent(id)}`;
    const auth = (ctx: CallCtx) => ({ Authorization: `Bearer ${ctx.accessToken}` });
    const send = (sendUpdates: boolean) => `sendUpdates=${sendUpdates ? 'all' : 'none'}`;

    const call = async (ctx: CallCtx, method: 'GET' | 'POST' | 'PATCH', url: string, operation: string, body?: unknown, headers: Record<string, string> = {}): Promise<GoogleEventWire> => {
        const { json } = await providerFetch(
            { method, url, headers: { ...auth(ctx), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), provider: 'google', operation },
            { fetchImpl, schema: googleEventSchema },
        );
        return json;
    };

    const fullBody = (input: CreateEventInput) => toGoogleEvent(input.crm, { ...input.event, requestedId: input.requestedId, attendees: input.attendees });

    const getEvent: EventOps['getEvent'] = async (ctx, id) => {
        try {
            return normalizeGoogle(await call(ctx, 'GET', eventUrl(ctx, id), 'get-event'), ctx.accountEmail);
        } catch (err) {
            if (err instanceof ProviderNotFoundError) return null;
            throw err;
        }
    };

    /** Re-writes an event of ours with the full body (`status: 'confirmed'` brings a deleted one back [U]). */
    const rewrite = async (ctx: CallCtx, input: CreateEventInput, operation: string) => {
        const { id: _id, ...body } = fullBody(input);
        const json = await call(ctx, 'PATCH', `${eventUrl(ctx, input.requestedId)}?${send(input.sendUpdates)}`, operation, { ...body, status: 'confirmed' });
        return normalizeGoogle(json, ctx.accountEmail);
    };

    return {
        async createEvent(ctx, input) {
            try {
                const json = await call(ctx, 'POST', `${eventsUrl(ctx)}?${send(input.sendUpdates)}`, 'create-event', fullBody(input));
                return normalizeGoogle(json, ctx.accountEmail);
            } catch (err) {
                if (!(err instanceof ProviderConflictError)) throw err;
                // 409: the id exists. A retried create of ours (or our deleted copy) is adopted; anything else is not ours.
                const existing = await getEvent(ctx, input.requestedId);
                if (!existing || existing.crmActivityId !== input.event.activityId) {
                    throw new RequestedIdTakenError({ provider: 'google', operation: 'create-event', status: 409, code: 'requested_id_taken' });
                }
                return rewrite(ctx, input, 'adopt-event');
            }
        },

        async patchEvent(ctx, id, input) {
            const body = toGooglePatch(input.groups, input.crm, { timeZone: input.timeZone, attendees: input.attendees, description: input.description });
            const json = await call(ctx, 'PATCH', `${eventUrl(ctx, id)}?${send(input.sendUpdates)}`, 'patch-event', body, input.etag ? { 'If-Match': input.etag } : {});
            return normalizeGoogle(json, ctx.accountEmail);
        },

        async cancelEvent(ctx, id, o) {
            try {
                await providerFetch(
                    { method: 'DELETE', url: `${eventUrl(ctx, id)}?${send(o.sendUpdates)}`, headers: auth(ctx), provider: 'google', operation: 'cancel-event' },
                    { fetchImpl },
                );
                return 'cancelled';
            } catch (err) {
                // 404 / 410: already gone (deleted in the calendar, or a retried delete).
                if (err instanceof ProviderNotFoundError) return 'gone';
                throw err;
            }
        },

        getEvent,

        async undeleteEvent(ctx, id, input) {
            try {
                return await rewrite(ctx, { ...input, requestedId: id }, 'undelete-event');
            } catch (err) {
                if (err instanceof ProviderNotFoundError || err instanceof ProviderBadRequestError) return null;
                throw err;
            }
        },
    };
}
