import { z } from 'zod';
import { GRAPH_API } from '../../integrations/integration.constants.js';
import { WATCH_STOP_TIMEOUT_MS } from './googleWatch.js';
import { providerFetch, ProviderNotFoundError } from './http.js';
import type { CalendarProviderAdapter, FetchImpl, WatchCreated } from './types.js';

/**
 * Microsoft Graph subscriptions for the webhooks (Calendar Phase 2 spec §7.5, §3.4; addendum §8.6; P2-7), app-only on
 * `users/{mailbox}/events` (`Calendars.Read` application is the least privilege; the CRM's `Calendars.ReadWrite`
 * covers it [V]; "any path starting with `me` can also be used with `users/{id}`" [V]).
 *
 * - subscribe: `POST /subscriptions` `{ changeType: 'created,updated,deleted', notificationUrl,
 *   lifecycleNotificationUrl, resource, expirationDateTime, clientState }`. Graph validates both URLs before it answers
 *   (webhook.routes.ts echoes `validationToken`). Outlook event subscriptions live at most 10,080 minutes ("under seven
 *   days" [V: subscription resource type, read 26 Nov 2026]); the CRM asks for 10,000 minutes and renews 3 days ahead.
 *   `clientState` ≤ 128 characters [V]; ours is `<connectionId>.<generation>.<43-character HMAC>` (≤ 105).
 * - renew: `PATCH /subscriptions/{id}` `{ expirationDateTime }` [V]; 404 → `'recreate'`.
 * - stop: `DELETE /subscriptions/{id}` [V] (404 = already gone).
 * - exists: `GET /subscriptions/{id}` (404 → false), the nightly backstop for a lost `subscriptionRemoved`.
 */

/** Requested life of a subscription (Graph's maximum for Outlook events is 10,080 minutes [V]). */
export const GRAPH_SUBSCRIPTION_MINUTES = 10_000;
export const GRAPH_SUBSCRIPTION_MAX_MINUTES = 10_080;

const subscriptionSchema = z.object({ id: z.string().min(1), expirationDateTime: z.string().nullish() });
const renewSchema = z.object({ expirationDateTime: z.string().nullish() }).nullish();

const subscriptionsUrl = `${GRAPH_API}/subscriptions`;

/** Graph's `expirationDateTime` → Date (the asked one when unreadable). Pure. */
export function graphExpiration(value: string | null | undefined, fallback: Date): Date {
    const ms = value ? Date.parse(value) : NaN;
    return Number.isNaN(ms) ? fallback : new Date(ms);
}

/** The asked expiry, never past Graph's maximum (pure). */
export function graphExpiry(expiresAt: Date, now: Date): Date {
    return new Date(Math.min(expiresAt.getTime(), now.getTime() + (GRAPH_SUBSCRIPTION_MAX_MINUTES - 5) * 60_000));
}

/** The `POST /subscriptions` body (pure, tested). */
export function graphSubscriptionBody(
    i: { address: string; lifecycleAddress?: string; token: string; expiresAt: Date },
    mailbox: string,
    now: Date,
): Record<string, unknown> {
    return {
        changeType: 'created,updated,deleted',
        notificationUrl: i.address,
        ...(i.lifecycleAddress ? { lifecycleNotificationUrl: i.lifecycleAddress } : {}),
        resource: `users/${mailbox}/events`,
        expirationDateTime: graphExpiry(i.expiresAt, now).toISOString(),
        clientState: i.token,
    };
}

export function graphWatchOps(fetchImpl?: FetchImpl, now: () => Date = () => new Date()): Pick<CalendarProviderAdapter, 'watch' | 'renewWatch' | 'stopWatch' | 'watchExists'> {
    const auth = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });
    return {
        async watch(ctx, request): Promise<WatchCreated> {
            const { json } = await providerFetch(
                { method: 'POST', url: subscriptionsUrl, headers: auth(ctx.accessToken), body: JSON.stringify(graphSubscriptionBody(request, ctx.mailbox, now())), provider: 'microsoft', operation: 'subscribe' },
                // Graph validates our URLs before it answers (≤ 10 s each), so allow longer than the default.
                { fetchImpl, attempts: 2, timeoutMs: 30_000, schema: subscriptionSchema },
            );
            return { externalId: json.id, expiresAt: graphExpiration(json.expirationDateTime, request.expiresAt) };
        },

        async renewWatch(ctx, channel, expiresAt) {
            const asked = graphExpiry(expiresAt, now());
            try {
                const { json } = await providerFetch(
                    {
                        method: 'PATCH',
                        url: `${subscriptionsUrl}/${encodeURIComponent(channel.externalId)}`,
                        headers: auth(ctx.accessToken),
                        body: JSON.stringify({ expirationDateTime: asked.toISOString() }),
                        provider: 'microsoft',
                        operation: 'subscription-renew',
                    },
                    { fetchImpl, attempts: 2, schema: renewSchema },
                );
                return { expiresAt: graphExpiration(json?.expirationDateTime, asked) };
            } catch (err) {
                if (err instanceof ProviderNotFoundError) return 'recreate';
                throw err;
            }
        },

        async stopWatch(ctx, channel) {
            try {
                await providerFetch(
                    { method: 'DELETE', url: `${subscriptionsUrl}/${encodeURIComponent(channel.externalId)}`, headers: auth(ctx.accessToken), provider: 'microsoft', operation: 'subscription-delete' },
                    { fetchImpl, attempts: 1, timeoutMs: WATCH_STOP_TIMEOUT_MS },
                );
            } catch (err) {
                if (err instanceof ProviderNotFoundError) return;
                throw err;
            }
        },

        async watchExists(ctx, channel) {
            try {
                await providerFetch(
                    { method: 'GET', url: `${subscriptionsUrl}/${encodeURIComponent(channel.externalId)}`, headers: auth(ctx.accessToken), provider: 'microsoft', operation: 'subscription-get' },
                    { fetchImpl, attempts: 2 },
                );
                return true;
            } catch (err) {
                if (err instanceof ProviderNotFoundError) return false;
                throw err;
            }
        },
    };
}
