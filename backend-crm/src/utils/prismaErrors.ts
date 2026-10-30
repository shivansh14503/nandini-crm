import { Prisma } from '../generated/prisma/client.js';

/**
 * True when SQL Server aborted the transaction as a deadlock victim / serialization failure, so retrying the
 * whole transaction is safe. Prisma reports it as P2034, or (for raw queries through the MSSQL driver adapter)
 * as P2010 with the adapter's `TransactionWriteConflict` classification.
 */
export function isWriteConflictError(err: unknown): boolean {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (err.code === 'P2034') return true;
    const cause = (err.meta as { driverAdapterError?: { cause?: { kind?: unknown } } } | undefined)?.driverAdapterError?.cause;
    return cause?.kind === 'TransactionWriteConflict';
}

/** P2028: the transaction couldn't start in time (pool exhausted) or had already been closed. */
export function isTransactionUnavailableError(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2028';
}
