/**
 * Standalone worker process: `npm run worker`. Run it alongside the API with RUN_WORKERS=false on the API
 * so imports don't compete with request handling for CPU.
 */
import { logger } from '../config/logger.js';
import { connectDatabase, prisma } from '../config/prisma.js';
import { connectRedis, redis } from '../config/redis.js';
import { closeQueues } from './queues.js';
import { startWorkers, stopWorkers } from './workers/index.js';

async function main(): Promise<void> {
    connectRedis();
    await connectDatabase();
    startWorkers();

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) return;
        stopping = true;
        logger.info({ signal }, 'Stopping workers');
        await stopWorkers();
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
