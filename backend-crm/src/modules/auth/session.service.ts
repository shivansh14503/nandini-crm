import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isRedisReady, redis } from '../../config/redis.js';

const sessionKey = (userId: number, jti: string) => `session:${userId}:${jti}`;
const SCAN_BATCH_SIZE = 200;

export interface SessionMetadata {
    ip?: string;
    userAgent?: string;
}

/**
 * Redis-tracked login sessions (`session:{userId}:{jti}`), expiring with the JWT. A session that is
 * tracked but missing from Redis has been revoked (logout, deactivation, password change).
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

    /** Ends every tracked session of a user (e.g. after deactivation or a password change). */
    async revokeAll(userId: number): Promise<void> {
        if (!isRedisReady()) return;
        try {
            let cursor = '0';
            do {
                const [next, keys] = await redis.scan(cursor, 'MATCH', `session:${userId}:*`, 'COUNT', SCAN_BATCH_SIZE);
                cursor = next;
                if (keys.length > 0) await redis.unlink(...keys);
            } while (cursor !== '0');
        } catch (err) {
            logger.warn({ err: (err as Error).message, userId }, 'Revoking all sessions failed');
        }
    },
};
