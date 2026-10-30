import { StatusCodes } from 'http-status-codes';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { isTransactionUnavailableError, isWriteConflictError } from '../../utils/prismaErrors.js';

const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 50;
const LOCK_TIMEOUT_MS = 10_000;
/** sp_getapplock's @Resource is nvarchar(255). */
const MAX_LOCK_RESOURCE_LENGTH = 255;

/** An application lock was chosen as a deadlock victim; the whole transaction is safe to retry. */
class LockDeadlockError extends HttpError {
    constructor() {
        super('This record was changed by another request at the same time. Please try again.', StatusCodes.CONFLICT, {
            code: 'WRITE_CONFLICT',
        });
    }
}

const isRetryable = (err: unknown) =>
    err instanceof LockDeadlockError || isWriteConflictError(err) || isTransactionUnavailableError(err);

async function runWithRetry<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    isolationLevel: Prisma.TransactionIsolationLevel,
): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await prisma.$transaction(fn, { isolationLevel, maxWait: 5_000, timeout: 15_000 });
        } catch (err) {
            if (!isRetryable(err) || attempt >= MAX_ATTEMPTS) throw err;
            logger.warn({ attempt, isolationLevel }, 'Transaction conflict; retrying');
            await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt + Math.random() * RETRY_BASE_DELAY_MS));
        }
    }
}

/**
 * Runs `fn` in a READ COMMITTED transaction: the default for writes. Rules that READ COMMITTED alone can't make
 * race-free ("check for a duplicate, then insert", read-modify-write updates) take application locks with
 * `acquireLocks` / `lockRecords`, which serialize only the requests that touch the same value or record.
 * Creates also serialize per entity on their `SequenceCounter` row (`generateEntityCode`), so they call it first.
 * Deadlock victims and transactions that couldn't start in time are retried with jittered backoff.
 */
export function runInTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return runWithRetry(fn, Prisma.TransactionIsolationLevel.ReadCommitted);
}

/**
 * Runs `fn` in a SERIALIZABLE transaction, for multi-record workflows (lead conversion) that must see a stable
 * snapshot of everything they read. Retried like `runInTransaction`.
 */
export function runSerializable<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return runWithRetry(fn, Prisma.TransactionIsolationLevel.Serializable);
}

/**
 * Takes exclusive transaction-scoped application locks (`sp_getapplock`), released on commit / rollback, in one
 * round trip. Keys are compared byte-for-byte, so callers normalize values (e.g. lowercase names). Blank keys are
 * skipped; the rest are acquired in sorted order so two callers locking overlapping sets can't deadlock.
 */
export async function acquireLocks(tx: TransactionClient, keys: (string | null | undefined)[]): Promise<void> {
    const resources = [...new Set(keys.filter((key): key is string => Boolean(key)).map((key) => `crm:${key}`.slice(0, MAX_LOCK_RESOURCE_LENGTH)))].sort();
    if (resources.length === 0) return;

    const rows = await tx.$queryRaw<{ result: number }[]>`
        DECLARE @resource NVARCHAR(255), @result INT = 0;
        DECLARE lock_cursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT [value] FROM OPENJSON(${JSON.stringify(resources)}) ORDER BY CAST([key] AS INT);
        OPEN lock_cursor;
        FETCH NEXT FROM lock_cursor INTO @resource;
        WHILE @@FETCH_STATUS = 0 AND @result >= 0
        BEGIN
            EXEC @result = sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = ${LOCK_TIMEOUT_MS};
            FETCH NEXT FROM lock_cursor INTO @resource;
        END;
        CLOSE lock_cursor;
        DEALLOCATE lock_cursor;
        SELECT @result AS result;
    `;
    const result = rows[0]?.result ?? -999;
    if (result >= 0) return;
    if (result === -3) throw new LockDeadlockError();
    throw new HttpError('The server is busy right now. Please try again in a moment.', StatusCodes.SERVICE_UNAVAILABLE, {
        code: 'SERVER_BUSY',
    });
}

/**
 * Serializes writes to existing records (updates, deletes, conversion) so a read-modify-write can't overwrite or
 * resurrect a concurrent change.
 */
export function lockRecords(tx: TransactionClient, entity: LockedEntity, ids: string[]): Promise<void> {
    return acquireLocks(tx, ids.map((id) => `${entity}:id:${id}`));
}

export type LockedEntity = 'organization' | 'contact' | 'lead' | 'opportunity' | 'quotation' | 'product' | 'ticket';

/** Columns set when a core entity is soft-deleted. */
export const softDeleteData = (actor: AuthUser) => ({
    isDeleted: true,
    deletedAt: new Date(),
    updatedBy: actor.username,
});

export interface BulkDeleteResult {
    deleted: number;
    ids: string[];
    /** Requested ids that don't exist or were already deleted. */
    notFound: string[];
}
