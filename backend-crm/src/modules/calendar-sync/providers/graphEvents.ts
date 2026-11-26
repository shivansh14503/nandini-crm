import { ENV } from '../../../config/env.js';
import { GRAPH_MARKER_PROPERTY_ID } from '../sync.constants.js';
import { toGraphEvent, toGraphPatch } from '../sync.mapping.graph.js';
import { normalizeGraph } from '../sync.shapes.js';
import { windowsZone } from '../sync.timezones.js';
import { providerFetch, ProviderNotFoundError } from './http.js';
import { graphUserUrl } from './microsoft.js';
import type { CalendarProviderAdapter, CallCtx, FetchImpl } from './types.js';
import { graphEventSchema, type GraphEventWire } from './wire.js';

/**
 * Microsoft Graph v1.0 event operations of the push engine (Calendar Phase 2 spec §7.5, §9.4). Every call asks for
 * immutable ids; reads come back in the business zone's Windows name. `transactionId` = the requested id dedupes a
 * retried POST [V]. Graph has no "don't notify" switch: invitations go to whoever is listed (the push lists nobody on
 * a private copy) and reminders are written on create only. No undelete: a restore creates again. App-only token:
 * every URL is `/users/{mailbox}/events…` (addendum AC2; `/me` has no meaning app-only).
 */

type EventOps = Pick<CalendarProviderAdapter, 'createEvent' | 'patchEvent' | 'cancelEvent' | 'getEvent'>;

export const graphPreferHeader = () => `IdType="ImmutableId", outlook.timezone="${windowsZone(ENV.BUSINESS_TIMEZONE)}"`;

const graphEventsUrl = (ctx: CallCtx) => `${graphUserUrl(ctx.mailbox)}/events`;

export const graphEventUrl = (ctx: CallCtx, id: string) =>
    `${graphEventsUrl(ctx)}/${encodeURIComponent(id)}?$expand=${encodeURIComponent(`singleValueExtendedProperties($filter=id eq '${GRAPH_MARKER_PROPERTY_ID}')`)}`;

export function graphEventOps(fetchImpl?: FetchImpl): EventOps {
    const headers = (ctx: CallCtx, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${ctx.accessToken}`, Prefer: graphPreferHeader(), ...extra });

    const call = async (ctx: CallCtx, method: 'GET' | 'POST' | 'PATCH', url: string, operation: string, body?: unknown, extra: Record<string, string> = {}): Promise<GraphEventWire> => {
        const { json } = await providerFetch(
            { method, url, headers: headers(ctx, extra), ...(body === undefined ? {} : { body: JSON.stringify(body) }), provider: 'microsoft', operation },
            { fetchImpl, schema: graphEventSchema },
        );
        return json;
    };

    return {
        async createEvent(ctx, input) {
            const body = toGraphEvent(input.crm, { ...input.event, requestedId: input.requestedId, attendees: input.attendees });
            return normalizeGraph(await call(ctx, 'POST', graphEventsUrl(ctx), 'create-event', body));
        },

        async patchEvent(ctx, id, input) {
            const body = toGraphPatch(input.groups, input.crm, { timeZone: input.timeZone, attendees: input.attendees, description: input.description });
            const json = await call(ctx, 'PATCH', graphEventUrl(ctx, id), 'patch-event', body, input.etag ? { 'If-Match': input.etag } : {});
            return normalizeGraph(json);
        },

        async cancelEvent(ctx, id) {
            try {
                await providerFetch(
                    { method: 'DELETE', url: `${graphEventsUrl(ctx)}/${encodeURIComponent(id)}`, headers: headers(ctx), provider: 'microsoft', operation: 'cancel-event' },
                    { fetchImpl },
                );
                return 'cancelled';
            } catch (err) {
                if (err instanceof ProviderNotFoundError) return 'gone';
                throw err;
            }
        },

        async getEvent(ctx, id) {
            try {
                return normalizeGraph(await call(ctx, 'GET', graphEventUrl(ctx, id), 'get-event'));
            } catch (err) {
                if (err instanceof ProviderNotFoundError) return null;
                throw err;
            }
        },
    };
}
