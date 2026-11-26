import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { createRateLimiter, rateLimitHit } from '../../middlewares/rateLimiter.js';
import { HttpError } from '../../utils/httpError.js';
import { BOOKING_RATE_LIMITS } from './bookingLink.constants.js';

/**
 * Rate limits of the public booking page (BOOKING_RATE_LIMITS). Counted in Redis (fixed windows, `ratelimit:booking-*`);
 * whenever Redis can't count (down, or a command failing), an in-process counter takes over instead of letting the
 * request through: these routes are open to the internet, read calendars and write activities. Per process, so with N
 * API instances the fallback allows up to N times the limit.
 *
 * The per-IP limits are route middleware and count every request. The per-link limits (`chargeLink`) are charged by
 * the service only once a request is a real attempt: a live link and a valid query (slots), or a valid, unused slot
 * token this server signed (book). So junk requests (bad slug, empty body, honeypot, forged or expired token) only use
 * up their own IP's quota and can't lock a link's visitors out.
 */

const MESSAGE = 'Too many requests. Please wait a little and try again.';

const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 20_000;

/** One hit on the in-process counter `key` (exported for tests). */
export function localHit(key: string, max: number, windowSeconds: number, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const entry = windows.get(key);
    if (!entry || entry.resetAt <= now) {
        if (windows.size >= MAX_KEYS) {
            for (const [k, e] of windows) if (e.resetAt <= now) windows.delete(k);
            if (windows.size >= MAX_KEYS) windows.clear();
        }
        windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    return { allowed: entry.count <= max, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

/** Tests: forget the in-process counts. */
export function resetLocalBookingLimits(): void {
    windows.clear();
}

const byIp = (req: Request) => `ip:${req.ip ?? 'unknown'}`;

function limiter(name: string, limit: { max: number; windowSeconds: number }, keyGenerator: (req: Request) => string) {
    const keyPrefix = `ratelimit:booking-${name}`;
    const fallback = (req: Request, res: Response, next: NextFunction) => {
        const { allowed, retryAfterSeconds } = localHit(`${keyPrefix}:${keyGenerator(req)}`, limit.max, limit.windowSeconds);
        if (allowed) return next();
        res.setHeader('Retry-After', String(retryAfterSeconds));
        next(new HttpError(MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' }));
    };
    return createRateLimiter({ keyPrefix, max: limit.max, windowSeconds: limit.windowSeconds, keyGenerator, message: MESSAGE, fallback });
}

export const bookingLimiters = {
    view: limiter('view', BOOKING_RATE_LIMITS.view, byIp),
    slotsPerIp: limiter('slots-ip', BOOKING_RATE_LIMITS.slotsPerIp, byIp),
    bookPerIp: limiter('book-ip', BOOKING_RATE_LIMITS.bookPerIp, byIp),
};

/** A per-link limit was reached (429 RATE_LIMITED; the public router adds `Retry-After`). */
export class BookingRateLimitError extends HttpError {
    readonly retryAfterSeconds: number;
    constructor(retryAfterSeconds: number) {
        super(MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' });
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/** Per-link limits, keyed by the link's id (not the slug text a request names). */
const LINK_LIMITS = {
    slots: { name: 'slots-link', ...BOOKING_RATE_LIMITS.slotsPerLink },
    book: { name: 'book-link', ...BOOKING_RATE_LIMITS.bookPerLink },
} as const;

/** One hit on link `linkId`'s `kind` counter; throws BookingRateLimitError past the limit. */
export async function chargeLink(kind: keyof typeof LINK_LIMITS, linkId: string): Promise<void> {
    const { name, max, windowSeconds } = LINK_LIMITS[kind];
    const key = `ratelimit:booking-${name}:link:${linkId}`;
    const state = await rateLimitHit(key, windowSeconds);
    if (state) {
        if (state.count > max) throw new BookingRateLimitError(state.ttl);
        return;
    }
    const local = localHit(key, max, windowSeconds);
    if (!local.allowed) throw new BookingRateLimitError(local.retryAfterSeconds);
}
