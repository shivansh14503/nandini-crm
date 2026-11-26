import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { HttpError } from '../../utils/httpError.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';
import { MANUAL_PULL_MIN_INTERVAL_MS, PAGE_PULL_MIN_INTERVAL_MS, type PullRequestStatus } from './sync.constants.js';
import { enqueuePull } from './sync.wake.js';

/**
 * On-demand pulls (Calendar Phase 2 spec D24, §10.3; P2-5): the employee's own "Sync now", the silent pull when the
 * calendar page opens, and the admin's "Sync now" on Admin › API Integrations › People.
 *
 * - Only a live row in `ok` pulls. A pull no sooner than 30 s (Sync now) / 3 minutes (page) after the last one or the
 *   last request (in-process memory per connection, so repeated clicks don't queue repeated jobs).
 * - Redis up: a `pull` job (`queued`); jobs of one connection within 10 s share one id. Redis down: the pull runs in
 *   the API process, awaited (`done`, with the number of activities it changed), still under the lease and the
 *   `job:calendar-sync` audit origin.
 * - Route rate limits: 6 / minute per user (Redis, in-process while Redis can't count).
 * No provider text or error code reaches the employee: the answer is a fixed status.
 */

export { PULL_REQUEST_STATUSES, type PullRequestStatus } from './sync.constants.js';

export interface PullRequestResult {
    status: PullRequestStatus;
    /** Activities changed (in-process pulls only). */
    changed?: number;
    /** max(lastPushedAt, lastPulledAt) after the request. */
    lastSyncedAt: string | null;
}

export type OnDemandReason = 'manual' | 'page' | 'admin';

const lastRequested = new Map<string, number>();
export function resetPullRequestsForTests(): void {
    lastRequested.clear();
    localHits.clear();
}

const latest = (...dates: (Date | null | undefined)[]): string | null => {
    const times = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime());
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
};

/** Pulls `username`'s live calendar now (or queues it). */
export async function requestPull(username: string, reason: OnDemandReason, now: Date = new Date()): Promise<PullRequestResult> {
    const row = await prisma.calendarConnection.findFirst({
        where: { username, status: { in: [...LIVE_CONNECTION_STATUSES] } },
        select: { id: true, status: true, lastPulledAt: true, lastPushedAt: true },
    });
    if (!row) return { status: 'not_synced', lastSyncedAt: null };
    const lastSyncedAt = latest(row.lastPulledAt, row.lastPushedAt);
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return { status: 'off', lastSyncedAt };
    if (row.status !== 'ok') return { status: 'not_ready', lastSyncedAt };
    const minInterval = reason === 'page' ? PAGE_PULL_MIN_INTERVAL_MS : MANUAL_PULL_MIN_INTERVAL_MS;
    const last = Math.max(row.lastPulledAt?.getTime() ?? 0, lastRequested.get(row.id) ?? 0);
    if (now.getTime() - last < minInterval) return { status: 'recent', lastSyncedAt };
    if (lastRequested.size > 5_000) lastRequested.clear();
    lastRequested.set(row.id, now.getTime());

    if ((await enqueuePull(row.id, reason, now)) !== null) return { status: 'queued', lastSyncedAt };
    // Redis down: in-process (sync.pull imports the activity services; loaded on demand).
    const { pullConnection } = await import('./sync.pull.js');
    try {
        const result = await pullConnection(row.id, reason);
        const after = await prisma.calendarConnection.findUnique({ where: { id: row.id }, select: { lastPulledAt: true, lastPushedAt: true } });
        const synced = latest(after?.lastPulledAt, after?.lastPushedAt);
        if (result.status === 'done') {
            const c = result.counts;
            return { status: 'done', changed: c.applied + c.deleted + c.relinked + c.unsupported, lastSyncedAt: synced };
        }
        if (result.status === 'busy') return { status: 'busy', lastSyncedAt: synced };
        if (result.status === 'skipped') return { status: 'not_ready', lastSyncedAt: synced };
        return { status: 'failed', lastSyncedAt: synced };
    } catch (err) {
        logger.warn({ connectionId: row.id, err: (err as Error).message }, 'In-process calendar pull failed');
        return { status: 'failed', lastSyncedAt };
    }
}

// ── Route rate limit (6 / minute per user) ────────────────────────────────────────────────────────────────

export const PULL_REQUEST_LIMIT = 6;
const WINDOW_SECONDS = 60;
const MESSAGE = 'Too many sync requests. Wait a minute and try again.';
const limitKey = (req: Request) => `user:${req.user?.id ?? req.ip ?? 'unknown'}`;
const localHits = new Map<string, { count: number; resetAt: number }>();

/** The in-process counter while Redis can't count (exported for tests). */
export function localPullRequestLimit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const entry = localHits.get(key);
    if (!entry || entry.resetAt <= now) {
        if (localHits.size > 5_000) localHits.clear();
        localHits.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    return { allowed: entry.count <= PULL_REQUEST_LIMIT, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

function localLimiter(req: Request, res: Response, next: NextFunction): void {
    const { allowed, retryAfterSeconds } = localPullRequestLimit(limitKey(req));
    if (allowed) return next();
    res.setHeader('Retry-After', String(retryAfterSeconds));
    next(new HttpError(MESSAGE, StatusCodes.TOO_MANY_REQUESTS, { code: 'RATE_LIMITED' }));
}

export const pullRequestLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:calendar-sync-now',
    max: PULL_REQUEST_LIMIT,
    windowSeconds: WINDOW_SECONDS,
    keyGenerator: limitKey,
    message: MESSAGE,
    fallback: localLimiter,
});
