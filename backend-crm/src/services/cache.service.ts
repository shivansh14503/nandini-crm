import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { isRedisReady, redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/** Key namespaces used across the app; invalidate with a trailing `*`, e.g. `cacheService.invalidatePattern(CACHE_KEYS.lookups('*'))`. */
export const CACHE_KEYS = {
    lookups: (name: string) => `cache:lookups:${name}`,
    addressMaster: 'cache:address-master',
    dashboard: (name: string) => `cache:dashboard:${name}`,
    search: (query: string) => `cache:search:${query}`,
    /** A user's unread notification count (navbar bell), read with `getOrSetGuarded`; dropped by every write to their notifications. */
    notificationsUnread: (username: string) => `cache:notifications:unread:${username.trim().toLowerCase()}`,
} as const;

const SCAN_BATCH_SIZE = 200;

/** Prefix of the placeholder a guarded read-through writes while it reads the source (never valid JSON). */
const GUARD_PREFIX = 'pending:';
/**
 * Default placeholder lifetime: longer than one database read can take (a cold connect is up to 30 s, the driver's
 * request timeout 15 s, and a paused Azure SQL Serverless database takes up to a minute to resume). A read that
 * outlives its placeholder is simply not cached (the compare-and-set finds no placeholder or another reader's); a
 * placeholder left behind by a crash keeps that one key uncached, never stale, until it expires.
 */
const GUARD_TTL_SECONDS = 90;
/** KEYS[1] = key; ARGV = expected placeholder, new value ('' deletes), TTL. Atomic compare-and-set. */
const SWAP_IF_GUARD = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[2] == '' then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3])) end
return 1`;

/** The Redis calls of a guarded read-through (the shared client below, or a test double). */
export interface GuardStore {
    get(key: string): Promise<string | null>;
    /** SET key value EX ttl, with NX when `onlyIfAbsent`; true when written. */
    put(key: string, value: string, ttlSeconds: number, onlyIfAbsent: boolean): Promise<boolean>;
    /** Sets `key` to `value` (null deletes it) only while it still holds `expected`, atomically; true when done. */
    swap(key: string, expected: string, value: string | null, ttlSeconds: number): Promise<boolean>;
}

/** A `GuardStore` on an ioredis client (the shared one below; tests pass their own). */
export function redisGuardStore(client: Redis): GuardStore {
    return {
        get: (key) => client.get(key),
        put: async (key, value, ttlSeconds, onlyIfAbsent) =>
            (onlyIfAbsent ? await client.set(key, value, 'EX', ttlSeconds, 'NX') : await client.set(key, value, 'EX', ttlSeconds)) === 'OK',
        swap: async (key, expected, value, ttlSeconds) => (await client.eval(SWAP_IF_GUARD, 1, key, expected, value ?? '', String(ttlSeconds))) === 1,
    };
}

const sharedGuardStore = redisGuardStore(redis);

/**
 * Deletes every key matching a glob pattern with `SCAN` + `UNLINK` (never `KEYS`, so Redis is never blocked). SCAN
 * matches key names whatever they hold, so a guarded read's placeholder is deleted with the values; one written
 * after the scan started belongs to a read that began after the write committed, so missing it is harmless.
 */
export async function unlinkMatching(client: Pick<Redis, 'scan' | 'unlink'>, pattern: string): Promise<void> {
    let cursor = '0';
    do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_BATCH_SIZE);
        cursor = nextCursor;
        if (keys.length > 0) await client.unlink(...keys);
    } while (cursor !== '0');
}

export interface GuardedReadOptions {
    /** Skip the cached value: read the source and cache what it says now (still guarded). */
    refresh?: boolean;
    /** Placeholder lifetime (default 90 s, see `GUARD_TTL_SECONDS`); longer for a source read that can take longer. */
    placeholderTtlSeconds?: number;
}

/**
 * Read-through that never caches a value an invalidation has made stale. On a miss it first writes a placeholder
 * token (`SET … NX`), then reads the source, then replaces the placeholder with the value only if the placeholder is
 * still there (Lua compare-and-set). An invalidation (`UNLINK`, `SCAN` + `UNLINK`) between the read and the write
 * removes the placeholder, so the stale value is dropped and the next read goes to the source. A reader that finds
 * another's placeholder reads the source without caching. Redis down or failing: the source, uncached.
 */
export async function guardedReadThrough<T>(
    store: GuardStore,
    ready: () => boolean,
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
    options: GuardedReadOptions = {},
): Promise<T> {
    let guard: string | null = null;
    if (ready()) {
        try {
            const cached = options.refresh ? null : await store.get(key);
            if (cached !== null && !cached.startsWith(GUARD_PREFIX)) return JSON.parse(cached) as T;
            if (cached === null) {
                const token = `${GUARD_PREFIX}${randomUUID()}`;
                if (await store.put(key, token, options.placeholderTtlSeconds ?? GUARD_TTL_SECONDS, !options.refresh)) guard = token;
            }
        } catch (err) {
            logger.warn({ err: (err as Error).message, key }, 'Cache read failed; using database');
        }
    }

    let value: T;
    try {
        value = await fetcher();
    } catch (err) {
        if (guard) store.swap(key, guard, null, 0).catch(() => undefined);
        throw err;
    }

    if (guard && ready()) {
        // Fire-and-forget, like getOrSet: a failed cache write must not fail or slow the request.
        store.swap(key, guard, value === undefined ? null : JSON.stringify(value), ttlSeconds).catch((err: Error) => {
            logger.warn({ err: err.message, key }, 'Cache write failed');
        });
    }
    return value;
}

/**
 * Redis-backed cache that never takes the API down: when Redis is unreachable every call logs at debug level
 * and falls through to the source of truth (the fetcher / database).
 *
 * Pick the read by the key, and read a key only one way: `getOrSetGuarded` for anything a CRM write invalidates
 * (lookups, form configs, search, unread counts), `getOrSet` for keys only their TTL expires (data the CRM never
 * writes, such as DNS answers). A plain read of a guarded key would overwrite its placeholder.
 */
export const cacheService = {
    /**
     * Returns the cached JSON value for `key`, or runs `fetcher`, caches its result for `ttlSeconds` and returns it.
     * Not safe for a key that writes invalidate: a value read just before a write can be cached just after its
     * invalidation and served until the TTL. Use `getOrSetGuarded` there.
     */
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

    /**
     * `getOrSet` for a value whose writers invalidate it: a source read that overlaps an invalidation is not cached
     * (see `guardedReadThrough`). Only for keys read this way (they briefly hold a placeholder). Costs one more round
     * trip than `getOrSet` on a miss (the placeholder); a hit is the same single `GET`.
     */
    getOrSetGuarded<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, options: GuardedReadOptions = {}): Promise<T> {
        return guardedReadThrough(sharedGuardStore, isRedisReady, key, ttlSeconds, fetcher, options);
    },

    async invalidate(...keys: string[]): Promise<void> {
        if (!isRedisReady() || keys.length === 0) return;
        try {
            await redis.unlink(...keys);
        } catch (err) {
            logger.warn({ err: (err as Error).message, keys }, 'Cache invalidation failed');
        }
    },

    /** Deletes every key matching a glob pattern (e.g. `cache:lookups:*`), placeholders included (`unlinkMatching`). */
    async invalidatePattern(pattern: string): Promise<void> {
        if (!isRedisReady()) return;
        try {
            await unlinkMatching(redis, pattern);
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

export type CachedEntity =
    | 'organizations'
    | 'contacts'
    | 'leads'
    | 'opportunities'
    | 'quotations'
    | 'products'
    | 'tickets'
    | 'contracts'
    | 'activities'
    | 'referrals'
    | 'users'
    | 'partner-companies';
