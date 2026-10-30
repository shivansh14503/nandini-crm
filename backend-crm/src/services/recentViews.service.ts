import { logger } from '../config/logger.js';
import { isRedisReady, redis } from '../config/redis.js';

const MAX_RECENT = 20;
const RECENT_TTL_SECONDS = 30 * 24 * 60 * 60;

const recentKey = (userId: number, entity: string) => `recent:${userId}:${entity}`;

/**
 * Per-user "recently viewed" records (a Redis sorted set scored by view time), behind flags such as
 * `ExtendedOrganization.isRecentlyViewed`. Without Redis nothing is recorded and lists report no recent views.
 */
export const recentViewsService = {
    async record(userId: number, entity: string, recordId: string): Promise<void> {
        if (!isRedisReady()) return;
        const key = recentKey(userId, entity);
        try {
            await redis
                .multi()
                .zadd(key, Date.now(), recordId)
                .zremrangebyrank(key, 0, -(MAX_RECENT + 1))
                .expire(key, RECENT_TTL_SECONDS)
                .exec();
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Could not record recent view');
        }
    },

    /** Most recent first. */
    async list(userId: number, entity: string): Promise<string[]> {
        if (!isRedisReady()) return [];
        try {
            return await redis.zrevrange(recentKey(userId, entity), 0, MAX_RECENT - 1);
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Could not read recent views');
            return [];
        }
    },

    async forget(entity: string, userId: number, recordIds: string[]): Promise<void> {
        if (!isRedisReady() || recordIds.length === 0) return;
        await redis.zrem(recentKey(userId, entity), ...recordIds).catch(() => undefined);
    },
};
