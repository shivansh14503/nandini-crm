import { z } from 'zod';
import { GOOGLE_CALENDAR_API } from '../../integrations/integration.constants.js';
import { googleCalendarUrl } from './google.js';
import { providerFetch, ProviderNotFoundError } from './http.js';
import type { CalendarProviderAdapter, FetchImpl, WatchCreated } from './types.js';

/**
 * Google push channels for the webhooks (Calendar Phase 2 spec §7.4, §3.4; addendum §8.6; P2-7), as the impersonated
 * employee (`calendar.events.owned` covers `events.watch` [V]).
 *
 * - watch: `POST /calendars/primary/events/watch` `{ id, type: 'web_hook', address, token, params: { ttl } }` →
 *   `resourceId`, `expiration` (ms since the epoch, as a string) [V]. The address must be https with a valid
 *   certificate [V]; no domain verification is needed [V: the push guide names none]. Google may answer an earlier
 *   expiration than asked ("the more restrictive value is used" [V]); the stored expiry is Google's.
 * - stop: `POST /channels/stop` `{ id, resourceId }` [V]. Google has no renew call [V]: a new channel is created and the
 *   old one stopped (sync.channels.ts). A channel Google no longer knows (404) counts as stopped.
 * The token is never logged (providerFetch messages carry no body; logger.ts redacts `x-goog-channel-token`).
 */

/** Longest channel life asked for: 7 days (`params.ttl`, seconds). */
export const GOOGLE_WATCH_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Stop calls are best effort and short. */
export const WATCH_STOP_TIMEOUT_MS = 5_000;

const watchSchema = z.object({ resourceId: z.string().min(1), expiration: z.union([z.string(), z.number()]).nullish() });

/** The `events.watch` body (pure, tested). */
export function googleWatchBody(i: { channelId: string; address: string; token: string; expiresAt: Date }, now: Date): Record<string, unknown> {
    const ttl = Math.max(60, Math.min(GOOGLE_WATCH_TTL_SECONDS, Math.floor((i.expiresAt.getTime() - now.getTime()) / 1000)));
    return { id: i.channelId, type: 'web_hook', address: i.address, token: i.token, params: { ttl: String(ttl) } };
}

/** Google's `expiration` (ms, string or number) → Date; the asked expiry when it is missing or unreadable. Pure. */
export function googleExpiration(value: string | number | null | undefined, fallback: Date): Date {
    const ms = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(ms) && ms > 0 ? new Date(ms) : fallback;
}

export function googleWatchOps(fetchImpl?: FetchImpl, now: () => Date = () => new Date()): Pick<CalendarProviderAdapter, 'watch' | 'stopWatch'> {
    return {
        async watch(ctx, request): Promise<WatchCreated> {
            const { json } = await providerFetch(
                {
                    method: 'POST',
                    url: `${googleCalendarUrl(ctx.calendarId)}/events/watch`,
                    headers: { Authorization: `Bearer ${ctx.accessToken}` },
                    body: JSON.stringify(googleWatchBody(request, now())),
                    provider: 'google',
                    operation: 'watch',
                },
                { fetchImpl, attempts: 2, schema: watchSchema },
            );
            return { externalId: json.resourceId, expiresAt: googleExpiration(json.expiration, request.expiresAt) };
        },

        async stopWatch(ctx, channel): Promise<void> {
            try {
                await providerFetch(
                    {
                        method: 'POST',
                        url: `${GOOGLE_CALENDAR_API}/channels/stop`,
                        headers: { Authorization: `Bearer ${ctx.accessToken}` },
                        body: JSON.stringify({ id: channel.channelId, resourceId: channel.externalId }),
                        provider: 'google',
                        operation: 'watch-stop',
                    },
                    { fetchImpl, attempts: 1, timeoutMs: WATCH_STOP_TIMEOUT_MS },
                );
            } catch (err) {
                if (err instanceof ProviderNotFoundError) return;
                throw err;
            }
        },
    };
}
