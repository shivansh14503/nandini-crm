import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../generated/prisma/client.js';
import { ENV } from './env.js';
import { logger } from './logger.js';

/** Single Prisma client for the process, connected through the SQL Server driver adapter (Prisma 7). */
export const prisma = new PrismaClient({
    adapter: new PrismaMssql(ENV.DATABASE_URL),
    log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
    ],
});

prisma.$on('warn', (event) => logger.warn({ target: event.target }, event.message));
prisma.$on('error', (event) => logger.error({ target: event.target }, event.message));

/** Interactive-transaction client, for helpers that must run inside `prisma.$transaction(async (tx) => …)`. */
export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const MAX_CONNECT_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

/** Opens the pool (fails fast on bad credentials) before the server starts accepting requests.
 * Retries up to 3 times to allow Azure SQL Serverless auto-pause resumption.
 */
export async function connectDatabase(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
        try {
            await prisma.$connect();
            await prisma.$queryRaw`SELECT 1`;
            logger.info('Connected to SQL Server');
            return;
        } catch (err) {
            await prisma.$disconnect().catch(() => {});
            if (attempt < MAX_CONNECT_RETRIES) {
                logger.warn(
                    { attempt, maxRetries: MAX_CONNECT_RETRIES, err: (err as Error).message },
                    'Database connection attempt failed, retrying (Azure SQL may be waking up)...'
                );
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            } else {
                throw err;
            }
        }
    }
}

let keepAliveTimer: NodeJS.Timeout | undefined;

/**
 * Runs `SELECT 1` on an interval so the pool never sits idle overnight. Without it the first request of the
 * day waits for dead sockets to be replaced (and for Azure SQL Serverless to resume from auto-pause), which
 * outlasts the frontend's request timeout and surfaces as "signal timed out" on the login page.
 */
export function startDatabaseKeepAlive(intervalMs = ENV.DB_KEEPALIVE_INTERVAL_MS): void {
    if (intervalMs <= 0 || keepAliveTimer) return;
    keepAliveTimer = setInterval(() => {
        prisma.$queryRaw`SELECT 1`.catch((err: Error) =>
            logger.warn({ err: err.message }, 'Database keep-alive ping failed; the pool will reconnect on next use')
        );
    }, intervalMs);
    keepAliveTimer.unref();
}

export function stopDatabaseKeepAlive(): void {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = undefined;
}
