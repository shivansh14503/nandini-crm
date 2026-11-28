/**
 * Standalone worker process: `npm run worker`. Run it alongside the API with RUN_WORKERS=false on the API
 * so imports don't compete with request handling for CPU.
 */
import { logger } from '../config/logger.js';
import { connectDatabase, prisma } from '../config/prisma.js';
import { connectRedis, redis } from '../config/redis.js';
import { dropUnreadCountsOnRedisReady } from '../modules/notifications/notification.producer.js';
import { startMailConfigRefresh, stopMailConfigRefresh } from '../modules/email/email.settings.js';
import { closeMail } from '../services/mail.service.js';
import { closeQueues } from './queues.js';
import { startWorkers, stopWorkers } from './workers/index.js';

async function main(): Promise<void> {
    // Reminders write notifications: unread counts invalidated while Redis was unreachable are dropped on reconnect.
    dropUnreadCountsOnRedisReady();
    connectRedis();
    await connectDatabase();
    startMailConfigRefresh();
    startWorkers();

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) return;
        stopping = true;
        logger.info({ signal }, 'Stopping workers');
        await stopWorkers();
        closeMail();
        stopMailConfigRefresh();
        await Promise.allSettled([closeQueues(), prisma.$disconnect(), redis.quit()]);
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: Error) => {
    logger.fatal({ err: err.message }, 'Worker process failed to start');
    process.exit(1);
});
