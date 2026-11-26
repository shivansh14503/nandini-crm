import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { HttpError } from '../../utils/httpError.js';
import { BUSY_RATE_LIMIT, BUSY_RATE_WINDOW_SECONDS } from './busy.constants.js';

/**
 * `GET /api/activities/busy`: 60 requests per user per minute (spec §12.1). Counted in Redis; while Redis can't count
 * (down, or a command failing) an in-process counter takes over instead of failing open, because Redis down also means
 * no busy-times cache, and every request would then reach Google / Microsoft.
 */

const MESSAGE = 'Too many availability checks. Wait a minute and try again.';
const limitKey = (req: Request) => `user:${req.user?.id ?? req.ip ?? 'unknown'}`;

const localHits = new Map<string, { count: number; resetAt: number }>();

/** The in-process counter (exported for tests). */
export function localBusyLimit(k: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const entry = localHits.get(k);
    if (!entry || entry.resetAt <= now) {
        if (localHits.size > 5_000) localHits.clear();
        localHits.set(k, { count: 1, resetAt: now + BUSY_RATE_WINDOW_SECONDS * 1000 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    return { allowed: entry.count <= BUSY_RATE_LIMIT, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

/** Tests: forget the in-process counts. */
export function resetLocalBusyLimit(): void {
    localHits.clear();
}

function localBusyLimiter(req: Request, res: Response, next: NextFunction): void {
    const { allowed, retryAfterSeconds } = localBusyLimit(limitKey(req));
    if (allowed) return next();
    res.setHeader('Retry-After', String(retryAfterSeconds));
    next(new HttpError(MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' }));
}

export const busyLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:activity-busy',
    max: BUSY_RATE_LIMIT,
    windowSeconds: BUSY_RATE_WINDOW_SECONDS,
    keyGenerator: limitKey,
    message: MESSAGE,
    fallback: localBusyLimiter,
});
