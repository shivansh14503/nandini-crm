import { Redis, type RedisOptions } from 'ioredis';
import { ENV } from './env.js';
import { logger } from './logger.js';

const MAX_RECONNECT_DELAY_MS = 30_000;
/** ioredis emits an error per reconnect attempt; log the outage once per this interval instead. */
const ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Builds a Redis connection from REDIS_URL. The app's shared client (below) fails commands immediately while
 * disconnected so callers can fall back to the database; BullMQ (Phase 4) needs its own connection created
 * with `{ maxRetriesPerRequest: null }`.
 */
export function createRedisConnection(overrides: RedisOptions = {}): Redis {
    let lastErrorLoggedAt = 0;
    const client = new Redis(ENV.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (attempt) => Math.min(attempt * 1_000, MAX_RECONNECT_DELAY_MS),
        ...overrides,
    });

    client.on('ready', () => logger.info('Connected to Redis'));
    client.on('error', (err: Error) => {
        const now = Date.now();
        if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
        lastErrorLoggedAt = now;
        logger.warn({ err: err.message }, 'Redis unavailable — caching, rate limiting and session revocation degrade gracefully');
    });

    return client;
}

/** Shared client for caching, rate limiting and session tracking. */
export const redis = createRedisConnection();

export function isRedisReady(): boolean {
    return redis.status === 'ready';
}

/** Starts connecting without blocking startup; Redis being down must never stop the API. */
export function connectRedis(): void {
    redis.connect().catch(() => {
        // Logged by the 'error' handler; retryStrategy keeps reconnecting in the background.
    });
}
