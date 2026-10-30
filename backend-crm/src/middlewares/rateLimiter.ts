import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ENV } from '../config/env.js';
import { logger } from '../config/logger.js';
import { isRedisReady, redis } from '../config/redis.js';
import { HttpError } from '../utils/httpError.js';

interface WindowState {
    count: number;
    /** Seconds until the window resets. */
    ttl: number;
}

/**
 * Fixed-window counter: the first hit creates the key with its expiry (SET … NX EX), later hits only INCR,
 * so the window never extends. Returns null when Redis is unavailable (callers fail open).
 */
async function hit(key: string, windowSeconds: number): Promise<WindowState | null> {
    if (!isRedisReady()) return null;
    try {
        const results = await redis.multi().set(key, 0, 'EX', windowSeconds, 'NX').incr(key).ttl(key).exec();
        const count = Number(results?.[1]?.[1]);
        const ttl = Number(results?.[2]?.[1]);
        return Number.isFinite(count) ? { count, ttl: ttl > 0 ? ttl : windowSeconds } : null;
    } catch (err) {
        logger.warn({ err: (err as Error).message, key }, 'Rate limiter unavailable; allowing request');
        return null;
    }
}

async function peek(key: string): Promise<WindowState | null> {
    if (!isRedisReady()) return null;
    try {
        const [count, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
        return count === null ? { count: 0, ttl: 0 } : { count: Number(count), ttl: Math.max(ttl, 0) };
    } catch (err) {
        logger.warn({ err: (err as Error).message, key }, 'Rate limiter unavailable; allowing request');
        return null;
    }
}

function tooManyRequests(res: Response, retryAfterSeconds: number, message: string): HttpError {
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return new HttpError(message, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' });
}

export interface RateLimiterOptions {
    /** Redis key namespace, e.g. `ratelimit:api`. */
    keyPrefix: string;
    max: number;
    windowSeconds: number;
    keyGenerator?: (req: Request) => string;
    message?: string;
}

/** Generic Redis-backed limiter counting every request. Fails open (allows traffic) if Redis is down. */
export function createRateLimiter(options: RateLimiterOptions) {
    const { keyPrefix, max, windowSeconds, keyGenerator = (req) => req.ip ?? 'unknown' } = options;
    const message = options.message ?? 'Too many requests. Please try again later.';

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const state = await hit(`${keyPrefix}:${keyGenerator(req)}`, windowSeconds);
        if (!state) return next();

        res.setHeader('RateLimit-Limit', String(max));
        res.setHeader('RateLimit-Remaining', String(Math.max(max - state.count, 0)));
        res.setHeader('RateLimit-Reset', String(state.ttl));

        if (state.count > max) return next(tooManyRequests(res, state.ttl, message));
        next();
    };
}

// ── Login brute-force protection ─────────────────────────────────────────────
// Only failed attempts count (keyed `ratelimit:login:{ip}`), so users behind one office NAT aren't
// locked out by their colleagues' successful logins.

const loginKey = (ip: string | undefined) => `ratelimit:login:${ip ?? 'unknown'}`;
const LOGIN_LIMIT_MESSAGE = 'Too many failed login attempts. Please try again later.';

export const loginRateLimit = {
    /** Middleware: rejects with 429 once the IP has used up its failed attempts for the window. */
    async guard(req: Request, res: Response, next: NextFunction): Promise<void> {
        const state = await peek(loginKey(req.ip));
        if (state && state.count >= ENV.RATE_LIMIT.LOGIN_MAX) {
            return next(tooManyRequests(res, state.ttl || ENV.RATE_LIMIT.LOGIN_WINDOW_SECONDS, LOGIN_LIMIT_MESSAGE));
        }
        next();
    },

    async recordFailure(ip: string | undefined): Promise<void> {
        await hit(loginKey(ip), ENV.RATE_LIMIT.LOGIN_WINDOW_SECONDS);
    },

    async reset(ip: string | undefined): Promise<void> {
        if (!isRedisReady()) return;
        await redis.del(loginKey(ip)).catch((err: Error) => {
            logger.warn({ err: err.message }, 'Failed to reset login rate limit');
        });
    },
};
