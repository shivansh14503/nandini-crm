import { isRedisReady, redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/** Key namespaces used across the app; invalidate with a trailing `*`, e.g. `cacheService.invalidatePattern(CACHE_KEYS.lookups('*'))`. */
export const CACHE_KEYS = {
    lookups: (name: string) => `cache:lookups:${name}`,
    addressMaster: 'cache:address-master',
    dashboard: (name: string) => `cache:dashboard:${name}`,
    search: (query: string) => `cache:search:${query}`,
} as const;

const SCAN_BATCH_SIZE = 200;

/**
 * Redis-backed cache that never takes the API down: when Redis is unreachable every call logs at debug level
 * and falls through to the source of truth (the fetcher / database).
 */
export const cacheService = {
    /** Returns the cached JSON value for `key`, or runs `fetcher`, caches its result for `ttlSeconds` and returns it. */
    async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
        if (isRedisReady()) {
            try {
                const cached = await redis.get(key);
                if (cached !== null) return JSON.parse(cached) as T;
            } catch (err) {
                logger.warn({ err: (err as Error).message, key }, 'Cache read failed; using database');
            }
        }

        const value = await fetcher();

        if (isRedisReady() && value !== undefined) {
            // Fire-and-forget: a failed cache write must not fail or slow the request.
            redis.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch((err: Error) => {
                logger.warn({ err: err.message, key }, 'Cache write failed');
            });
        }
        return value;
    },

    async invalidate(...keys: string[]): Promise<void> {
        if (!isRedisReady() || keys.length === 0) return;
        try {
            await redis.unlink(...keys);
        } catch (err) {
            logger.warn({ err: (err as Error).message, keys }, 'Cache invalidation failed');
        }
    },

    /** Deletes every key matching a glob pattern (e.g. `cache:lookups:*`), using SCAN so Redis is never blocked. */
    async invalidatePattern(pattern: string): Promise<void> {
        if (!isRedisReady()) return;
        try {
            let cursor = '0';
            do {
                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_BATCH_SIZE);
                cursor = nextCursor;
                if (keys.length > 0) await redis.unlink(...keys);
            } while (cursor !== '0');
        } catch (err) {
            logger.warn({ err: (err as Error).message, pattern }, 'Cache pattern invalidation failed');
        }
    },

    /**
     * Drops every cache an entity write can make stale: that entity's lookups, global search results and
     * dashboard aggregates. Call after the write's transaction commits.
     */
    async invalidateEntityCaches(entity: CachedEntity): Promise<void> {
        await Promise.all([
            cacheService.invalidatePattern(`${CACHE_KEYS.lookups(entity)}*`),
            cacheService.invalidatePattern(`${CACHE_KEYS.search('')}*`),
            cacheService.invalidatePattern(`${CACHE_KEYS.dashboard('')}*`),
        ]);
    },
};

export type CachedEntity = 'organizations' | 'contacts' | 'leads' | 'opportunities' | 'quotations' | 'products' | 'tickets' | 'users';
