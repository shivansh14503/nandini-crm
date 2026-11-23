/**
 * SQL Server ledger digests and verification results (pure, unit tested in auditLedger.test.ts). The database work
 * is in auditLedger.service.ts.
 */

/** `latest_digest` of `sys.sp_generate_database_ledger_digest`. */
export interface LedgerDigest {
    database_name: string;
    block_id: number;
    hash: string;
    last_transaction_commit_time: string;
    digest_time: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A digest as SQL Server writes it; null when the text isn't one (no ledger block yet, a damaged file). */
export function parseDigest(json: string | null | undefined): LedgerDigest | null {
    if (!json) return null;
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch {
        return null;
    }
    if (!isObject(value)) return null;
    const { database_name, block_id, hash, last_transaction_commit_time, digest_time } = value;
    if (typeof database_name !== 'string' || !database_name) return null;
    if (typeof block_id !== 'number' || !Number.isInteger(block_id) || block_id < 0) return null;
    if (typeof hash !== 'string' || !/^0x[0-9A-Fa-f]{64}$/.test(hash)) return null;
    if (typeof digest_time !== 'string' || Number.isNaN(Date.parse(digest_time))) return null;
    return {
        database_name,
        block_id,
        hash,
        last_transaction_commit_time: typeof last_transaction_commit_time === 'string' ? last_transaction_commit_time : '',
        digest_time,
    };
}

/** SQL Server's date-times carry no zone and are UTC (`2026-11-23T05:41:12.3466667`). */
export function ledgerTime(value: string): Date | null {
    if (!value) return null;
    const time = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
    return Number.isNaN(time) ? null : new Date(time);
}

/** `2026-11-23T054112Z-block-42.json`: sorts by time; a folder per database keeps databases apart. */
export function digestFileName(digest: LedgerDigest): string {
    const time = (ledgerTime(digest.digest_time) ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '');
    return `${time}-block-${digest.block_id}.json`;
}

/** A database name made safe as one folder name. */
export const databaseFolder = (name: string): string => name.replace(/[^A-Za-z0-9_.-]/g, '_') || 'database';

/**
 * Errors `sys.sp_verify_database_ledger` raises when the ledger doesn't match a digest or its own hashes (a row,
 * block or transaction was changed): 37368 (block hash ≠ digest), 37369 (digest block not found), 37392 (the
 * summary "Ledger verification failed"), and the other ledger-verification errors in 37360–37399. Anything else
 * (permissions, a timeout, snapshot isolation off) means the check couldn't run, which is not evidence of tampering.
 */
export function isVerificationFailure(code: number | null | undefined): boolean {
    return typeof code === 'number' && code >= 37360 && code <= 37399;
}

/** The SQL Server error number and message inside a Prisma / driver adapter error. */
export function sqlError(err: unknown): { code: number | null; message: string } {
    const seen = new Set<unknown>();
    let code: number | null = null;
    let message = err instanceof Error ? err.message : String(err);
    // Walk the error and its causes / meta: the adapter nests the driver error a few levels down.
    const visit = (value: unknown, depth: number) => {
        if (!isObject(value) || seen.has(value) || depth > 6) return;
        seen.add(value);
        for (const key of ['number', 'originalCode', 'code']) {
            const raw = value[key];
            const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{3,6}$/.test(raw) ? Number(raw) : NaN;
            if (code === null && Number.isInteger(n) && n >= 100) code = n;
        }
        for (const key of ['originalMessage', 'message']) {
            const raw = value[key];
            if (typeof raw === 'string' && raw && code !== null && key === 'originalMessage') message = raw;
        }
        for (const key of ['cause', 'meta', 'driverAdapterError', 'originalError', 'info', 'precedingErrors']) visit(value[key], depth + 1);
    };
    visit(err, 0);
    return { code, message: message.replace(/\s+/g, ' ').trim().slice(0, 1000) };
}
