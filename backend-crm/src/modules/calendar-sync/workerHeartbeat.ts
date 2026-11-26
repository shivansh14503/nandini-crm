import { isRedisReady, redis } from '../../config/redis.js';
import { WORKER_HEARTBEAT_KEY, WORKER_HEARTBEAT_TTL_SECONDS } from './sync.constants.js';

/**
 * The calendar sync worker's heartbeat (Calendar Phase 2 P2-3b): the worker writes `calendar:worker:heartbeat` (ISO
 * time, 120 s TTL) every minute while Redis is up; Admin › API Integrations shows "Last seen …" from it. Redis only:
 * never a database write. Null when Redis is down or no worker wrote it within the TTL.
 */

export async function writeWorkerHeartbeat(now: Date = new Date()): Promise<void> {
    if (!isRedisReady()) return;
    await redis.set(WORKER_HEARTBEAT_KEY, now.toISOString(), 'EX', WORKER_HEARTBEAT_TTL_SECONDS).catch(() => undefined);
}

export async function readWorkerHeartbeat(): Promise<{ lastSeenAt: string } | null> {
    if (!isRedisReady()) return null;
    try {
        const value = await redis.get(WORKER_HEARTBEAT_KEY);
        return value && !Number.isNaN(Date.parse(value)) ? { lastSeenAt: value } : null;
    } catch {
        return null;
    }
}

/**
 * The admin page's "Sync worker" line (P2-3c): `running` (a heartbeat within the last 2 minutes), `not_seen` (Redis is
 * up but no worker wrote one: it isn't running, or RUN_WORKERS / `npm run worker` was not started), `no_redis` (Redis is
 * down or not configured: there is no heartbeat to read; the API pushes in-process meanwhile).
 */
export const WORKER_STATUSES = ['running', 'not_seen', 'no_redis'] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export function workerStatusOf(redisReady: boolean, heartbeat: { lastSeenAt: string } | null): WorkerStatus {
    if (!redisReady) return 'no_redis';
    return heartbeat ? 'running' : 'not_seen';
}

export const isHeartbeatRedisReady = (): boolean => isRedisReady();
