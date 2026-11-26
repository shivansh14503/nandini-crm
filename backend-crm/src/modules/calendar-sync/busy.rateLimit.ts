import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../../config/logger.js';
import { isRedisReady, redis } from '../../config/redis.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { HttpError } from '../../utils/httpError.js';
import { BUSY_PROVIDER_CALL_BUDGET, BUSY_RATE_LIMIT, BUSY_RATE_WINDOW_SECONDS } from './busy.constants.js';

/**
 * `GET /api/activities/busy`: 60 requests per user per minute (spec §12.1). Counted in Redis; while Redis can't count
 * (down, or a command failing) an in-process counter takes over instead of failing open, because Redis down also means
 * no busy-times cache, and every request would then reach Google / Microsoft.
 *
 * A request can cost several provider calls (people × 14-day windows, the per-colleague fallback), so provider calls
 * have their own budget per user per minute (`takeProviderCall`), counted the same way.
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

const localCalls = new Map<string, { count: number; resetAt: number }>();

/** The in-process provider-call counter (exported for tests). */
export function localProviderCall(k: string, now: number = Date.now()): boolean {
    const entry = localCalls.get(k);
    if (!entry || entry.resetAt <= now) {
        if (localCalls.size > 5_000) localCalls.clear();
        localCalls.set(k, { count: 1, resetAt: now + BUSY_RATE_WINDOW_SECONDS * 1000 });
        return true;
    }
    entry.count += 1;
    return entry.count <= BUSY_PROVIDER_CALL_BUDGET;
}

/**
 * One provider call of `userKey`'s budget (`BUSY_PROVIDER_CALL_BUDGET` per minute): true when it may be made. Redis
 * fixed window (SET NX EX, then INCR, as the request limiter); the in-process counter while Redis can't count.
 */
export async function takeProviderCall(userKey: string): Promise<boolean> {
    const k = `ratelimit:activity-busy-calls:${userKey}`;
    if (isRedisReady()) {
        try {
            const results = await redis.multi().set(k, 0, 'EX', BUSY_RATE_WINDOW_SECONDS, 'NX').incr(k).exec();
            const count = Number(results?.[1]?.[1]);
            if (Number.isFinite(count)) return count <= BUSY_PROVIDER_CALL_BUDGET;
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Busy times call budget unavailable in Redis; counting in process');
        }
    }
    return localProviderCall(k);
}

/** Tests: forget the in-process counts. */
export function resetLocalBusyLimit(): void {
    localHits.clear();
    localCalls.clear();
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
