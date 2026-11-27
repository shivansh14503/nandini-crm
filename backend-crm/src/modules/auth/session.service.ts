import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isRedisReady, redis } from '../../config/redis.js';
import { parseSessionRecord, sessionKey, sessionKeyPattern, type SessionRecord } from './sessionRecord.js';

export type { SessionRecord } from './sessionRecord.js';

const SCAN_BATCH_SIZE = 200;
/** Most sessions one user's list returns (a user rarely has more than a handful; this only bounds a runaway). */
const MAX_LISTED_SESSIONS = 200;

export interface SessionMetadata {
    ip?: string;
    userAgent?: string;
}

/** Every session key of a user, one SCAN batch at a time (never KEYS, so Redis is never blocked). */
async function* sessionKeyBatches(userId: number): AsyncGenerator<string[]> {
    let cursor = '0';
    do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', sessionKeyPattern(userId), 'COUNT', SCAN_BATCH_SIZE);
        cursor = next;
        if (keys.length > 0) yield keys;
    } while (cursor !== '0');
}

/**
 * Redis-tracked login sessions (`session:{userId}:{jti}`), expiring with the JWT. A session that is
 * tracked but missing from Redis has been revoked (logout, a password change, "Sign out" on My Profile).
 */
export const sessionService = {
    /** Records a new session; returns false (untracked) when Redis is unavailable. */
    async create(userId: number, jti: string, metadata: SessionMetadata): Promise<boolean> {
        if (!isRedisReady()) return false;
        try {
            const value = JSON.stringify({ ...metadata, createdAt: new Date().toISOString() });
            await redis.set(sessionKey(userId, jti), value, 'EX', ENV.SESSION_TTL_SECONDS);
            return true;
        } catch (err) {
            logger.warn({ err: (err as Error).message, userId }, 'Could not record session; continuing untracked');
            return false;
        }
    },

    /** True if active, false if revoked/expired, null when Redis can't be asked (callers then trust the JWT). */
    async isActive(userId: number, jti: string): Promise<boolean | null> {
        if (!isRedisReady()) return null;
        try {
            return (await redis.exists(sessionKey(userId, jti))) === 1;
        } catch (err) {
            logger.warn({ err: (err as Error).message, userId }, 'Session lookup failed; trusting token');
            return null;
        }
    },

    async revoke(userId: number, jti: string): Promise<void> {
        if (!isRedisReady()) return;
        await redis.del(sessionKey(userId, jti)).catch((err: Error) => {
            logger.warn({ err: err.message, userId }, 'Session revoke failed');
        });
    },

    /**
     * Ends one session of a user ("Sign out" on a row of My Profile › Security). True when it was signed out, false
     * when there was no such session, null when Redis can't be asked.
     */
    async revokeOne(userId: number, jti: string): Promise<boolean | null> {
        if (!isRedisReady()) return null;
        try {
            return (await redis.del(sessionKey(userId, jti))) > 0;
        } catch (err) {
            logger.warn({ err: (err as Error).message, userId }, 'Session revoke failed');
            return null;
        }
    },

    /**
     * Ends every tracked session of a user (Admin › Users: deactivation, a password reset, a role change). Returns how
     * many were ended, or null when Redis can't be asked or failed partway (some may still be signed in).
     */
    async revokeAll(userId: number): Promise<number | null> {
        if (!isRedisReady()) return null;
        let revoked = 0;
        try {
            for await (const keys of sessionKeyBatches(userId)) revoked += await redis.unlink(...keys);
        } catch (err) {
            logger.warn({ err: (err as Error).message, userId, revoked }, 'Revoking all sessions failed');
            return null;
        }
        return revoked;
    },

    /**
     * Ends every tracked session of a user except `keepJti` (the request's own session): after a password change and
     * for "Sign out of all other sessions". Returns how many were ended, or null when Redis can't be asked or failed
     * partway (some sessions may still be signed in, so callers must not report success).
     */
    async revokeAllExcept(userId: number, keepJti: string): Promise<number | null> {
        if (!isRedisReady()) return null;
        const keep = sessionKey(userId, keepJti);
        let revoked = 0;
        try {
            for await (const keys of sessionKeyBatches(userId)) {
                const others = keys.filter((key) => key !== keep);
                if (others.length > 0) revoked += await redis.unlink(...others);
            }
        } catch (err) {
            logger.warn({ err: (err as Error).message, userId, revoked }, 'Revoking other sessions failed');
            return null;
        }
        return revoked;
    },

    /**
     * Every tracked session of a user with its sign-in details and expiry (unsorted), or null when Redis can't be
     * asked. Rows that vanish between SCAN and GET are skipped; a row that isn't valid JSON is listed without details.
     */
    async list(userId: number): Promise<SessionRecord[] | null> {
        if (!isRedisReady()) return null;
        try {
            const records: SessionRecord[] = [];
            const seen = new Set<string>();
            for await (const batch of sessionKeyBatches(userId)) {
                // SCAN may return a key more than once.
                const keys = batch.filter((key) => !seen.has(key) && seen.add(key));
                if (keys.length === 0) continue;
                const pipeline = redis.pipeline();
                for (const key of keys) pipeline.get(key).pttl(key);
                const results = (await pipeline.exec()) ?? [];
                const now = new Date();
                keys.forEach((key, index) => {
                    const [getError, value] = results[index * 2] ?? [];
                    const [ttlError, ttl] = results[index * 2 + 1] ?? [];
                    if (getError || ttlError) return;
                    const record = parseSessionRecord(key, typeof value === 'string' ? value : null, Number(ttl), now);
                    if (record) records.push(record);
                });
                if (records.length >= MAX_LISTED_SESSIONS) break;
            }
            return records.slice(0, MAX_LISTED_SESSIONS);
        } catch (err) {
            logger.warn({ err: (err as Error).message, userId }, 'Listing sessions failed');
            return null;
        }
    },
};
