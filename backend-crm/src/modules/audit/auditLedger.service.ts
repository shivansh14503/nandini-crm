import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { Prisma, PrismaClient, type AuditDigest } from '../../generated/prisma/client.js';
import { auditLedgerQueue, isQueueAvailable, tryEnqueue } from '../../jobs/queues.js';
import { auditService } from '../../services/audit.service.js';
import { currentAuditOrigin, type AuditOrigin } from '../../services/auditContext.js';
import type { AuthUser } from '../../types/user.types.js';
import { displayTime } from './audit.format.js';
import { databaseFolder, digestFileName, isVerificationFailure, ledgerTime, parseDigest, sqlError, type LedgerDigest } from './auditLedger.js';

/**
 * Tamper evidence for the audit log (Admin › Audit Log › Integrity). AuditLog is a SQL Server append-only ledger
 * table: every transaction is hashed into a chain of blocks. A digest is the hash of the latest block; saved where
 * the database can't reach (AUDIT_DIGEST_DIR), it lets `sys.sp_verify_database_ledger` prove later that no entry
 * was changed or removed since, even by someone with full control of the database.
 *  • A digest is saved every night at 00:15 (business timezone) by the `crm-audit-ledger` queue, and on demand.
 *  • "Verify integrity" checks the ledger against every saved digest file plus a fresh one, as a background job (it
 *    reads the whole ledger: ~100 s per million entries) on its own connection with a long timeout. The result is a
 *    LEDGER_VERIFY entry: INFO when verified, CRITICAL when the ledger doesn't match, WARNING when it couldn't run.
 * Needs ALLOW_SNAPSHOT_ISOLATION (migration 20261123120000) and, for a login that isn't db_owner,
 * `GRANT VIEW LEDGER CONTENT` and `GRANT GENERATE LEDGER DIGEST`.
 */

const VERIFY_JOB_ID = 'ledger-verify';
const DIGEST_SCHEDULER_ID = 'audit-ledger-digest';
/** 00:15 every night in the business timezone. */
export const DIGEST_PATTERN = '15 0 * * *';

export type DigestSource = 'JOB' | 'MANUAL' | 'VERIFY';

export interface VerifyJobData {
    by: string;
    startedAt: string;
    origin?: AuditOrigin;
}

/** One connection with a long request timeout: verification outlasts the shared pool's 15 s default. */
let verifyClient: PrismaClient | undefined;
function longRunningClient(): PrismaClient {
    const url = `${ENV.DATABASE_URL.replace(/;\s*(socketTimeout|connectionLimit)=[^;]*/gi, '')};socketTimeout=${ENV.AUDIT.VERIFY_TIMEOUT_MS};connectionLimit=1`;
    verifyClient ??= new PrismaClient({ adapter: new PrismaMssql(url) });
    return verifyClient;
}

/** In-process verification when Redis is down (the queue's job marks a run otherwise). */
let localRun: VerifyJobData | null = null;

const digestFolder = (database: string) => path.join(ENV.AUDIT.DIGEST_DIR, databaseFolder(database));

async function databaseName(): Promise<string> {
    const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT DB_NAME() AS [name]`;
    return row.name;
}

/** The ledger's latest block as a digest; null while the ledger has no closed block. */
async function currentDigest(): Promise<LedgerDigest | null> {
    const [row] = await prisma.$queryRaw<{ latest_digest: string | null }[]>`EXEC sys.sp_generate_database_ledger_digest`;
    return parseDigest(row?.latest_digest);
}

/** Every digest file saved for this database (unreadable ones counted, not used). */
async function savedDigests(database: string): Promise<{ digests: LedgerDigest[]; unreadable: number }> {
    let names: string[] = [];
    try {
        names = (await readdir(digestFolder(database))).filter((name) => name.endsWith('.json'));
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const digests: LedgerDigest[] = [];
    let unreadable = 0;
    for (const name of names.sort()) {
        const digest = parseDigest(await readFile(path.join(digestFolder(database), name), 'utf8').catch(() => null));
        if (digest && digest.database_name === database) digests.push(digest);
        else unreadable += 1;
    }
    return { digests, unreadable };
}

/** Writes a digest file unless it exists (files are never overwritten). */
async function writeDigestFile(database: string, fileName: string, json: string): Promise<void> {
    await mkdir(digestFolder(database), { recursive: true });
    await writeFile(path.join(digestFolder(database), fileName), json, { flag: 'wx' }).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'EEXIST') throw err;
    });
}

function digestDto(row: AuditDigest) {
    return {
        id: row.id,
        blockId: String(row.blockId),
        digestTime: row.digestTime.toISOString(),
        time: displayTime(row.digestTime),
        source: row.source as DigestSource,
        createdBy: row.createdBy,
    };
}

/**
 * Saves the current digest: a file under AUDIT_DIGEST_DIR (never overwritten) and an AuditDigest row. A block that
 * is already saved (nothing written since) returns the saved digest instead.
 */
export async function saveDigest(source: DigestSource, by: string): Promise<AuditDigest | null> {
    const digest = await currentDigest();
    if (!digest) return null;
    const last = await prisma.auditDigest.findFirst({ orderBy: { id: 'desc' } });
    const saved = last && last.blockId === BigInt(digest.block_id) && last.hash === digest.hash;
    // Only while its file is still there: the database row is never copied back into the digest folder.
    if (saved && (await access(path.join(digestFolder(digest.database_name), last.fileName)).then(() => true, () => false))) return last;
    const json = JSON.stringify(digest);
    const fileName = digestFileName(digest);
    await writeDigestFile(digest.database_name, fileName, json);
    return prisma.auditDigest.create({
        data: {
            blockId: BigInt(digest.block_id),
            hash: digest.hash,
            lastCommitTime: ledgerTime(digest.last_transaction_commit_time),
            digestTime: ledgerTime(digest.digest_time) ?? new Date(),
            digestJson: json,
            fileName,
            source,
            createdBy: by,
        },
    });
}

export interface VerifyOutcome {
    result: 'verified' | 'failed' | 'error';
    message: string;
    digests: number;
    unreadableFiles: number;
    upToBlock: number | null;
    durationMs: number;
}

/** Checks the ledger against the saved digest files plus a fresh digest, and records a LEDGER_VERIFY entry. */
export async function runVerify(data: VerifyJobData): Promise<VerifyOutcome> {
    const started = Date.now();
    let outcome: VerifyOutcome;
    let database = 'database';
    try {
        database = await databaseName();
        const fresh = await saveDigest('VERIFY', data.by);
        const { digests, unreadable } = await savedDigests(database);
        const upToBlock = digests.reduce<number | null>((max, digest) => (max === null || digest.block_id > max ? digest.block_id : max), null);
        if (digests.length === 0) {
            outcome = {
                result: 'error',
                message: fresh ? 'No digest file could be read back from the digest folder.' : 'The ledger has no blocks to verify yet.',
                digests: 0,
                unreadableFiles: unreadable,
                upToBlock: null,
                durationMs: Date.now() - started,
            };
        } else {
            await longRunningClient().$executeRaw(Prisma.sql`EXEC sys.sp_verify_database_ledger ${JSON.stringify(digests)}`);
            outcome = {
                result: 'verified',
                message: `${digests.length} digest${digests.length === 1 ? '' : 's'}, up to block ${upToBlock}: no changes found`,
                digests: digests.length,
                unreadableFiles: unreadable,
                upToBlock,
                durationMs: Date.now() - started,
            };
        }
    } catch (err) {
        const { code, message } = sqlError(err);
        const failed = isVerificationFailure(code);
        logger.error({ code, err: message }, failed ? 'Audit ledger verification FAILED' : 'Audit ledger verification could not run');
        outcome = {
            result: failed ? 'failed' : 'error',
            message: failed
                ? `The audit log doesn't match its saved digests: entries were changed or removed outside the application (SQL Server error ${code}).`
                : `The check could not run: ${message}`,
            digests: 0,
            unreadableFiles: 0,
            upToBlock: null,
            durationMs: Date.now() - started,
        };
    }
    await auditService.write({
        entityType: 'AuditLedger',
        entityId: database,
        action: 'LEDGER_VERIFY',
        changedBy: data.by,
        severity: outcome.result === 'verified' ? 'INFO' : outcome.result === 'failed' ? 'CRITICAL' : 'WARNING',
        changes: outcome,
        origin: data.origin,
    });
    return outcome;
}

/** The run in progress (queue job or in-process), if any. */
async function runningVerify(): Promise<VerifyJobData | null> {
    if (localRun) return localRun;
    if (!isQueueAvailable()) return null;
    try {
        const job = await auditLedgerQueue().getJob(VERIFY_JOB_ID);
        if (!job) return null;
        const state = await job.getState();
        return state === 'active' || state === 'waiting' || state === 'delayed' || state === 'prioritized' ? (job.data as VerifyJobData) : null;
    } catch {
        return null;
    }
}

export const auditLedgerService = {
    /** Digests saved, the last check and whether one is running. */
    async status() {
        const [count, latest, lastCheck, running] = await Promise.all([
            prisma.auditDigest.count(),
            prisma.auditDigest.findFirst({ orderBy: { id: 'desc' } }),
            prisma.auditLog.findFirst({ where: { action: 'LEDGER_VERIFY' }, orderBy: { id: 'desc' } }),
            runningVerify(),
        ]);
        const check = lastCheck ? (JSON.parse(lastCheck.changesJson ?? '{}') as Partial<VerifyOutcome>) : null;
        return {
            digestDirConfigured: ENV.AUDIT.DIGEST_DIR_CONFIGURED,
            schedule: `Every night at 00:15 (${ENV.BUSINESS_TIMEZONE})`,
            digests: { count, latest: latest ? digestDto(latest) : null },
            lastCheck:
                lastCheck && check
                    ? {
                          entryId: String(lastCheck.id),
                          createdAt: lastCheck.createdAt.toISOString(),
                          time: displayTime(lastCheck.createdAt),
                          changedBy: lastCheck.changedBy,
                          result: check.result ?? 'error',
                          message: check.message ?? '',
                          digests: check.digests ?? 0,
                          upToBlock: check.upToBlock ?? null,
                          durationMs: check.durationMs ?? null,
                      }
                    : null,
            running: running ? { by: running.by, startedAt: running.startedAt } : null,
        };
    },

    /** "Save a digest now". */
    async digestNow(user: AuthUser) {
        const row = await saveDigest('MANUAL', user.username);
        return { digest: row ? digestDto(row) : null, status: await auditLedgerService.status() };
    },

    /** Starts "Verify integrity" unless a run is already going; returns the status (the screen polls it). */
    async verify(user: AuthUser) {
        if (!(await runningVerify())) {
            const data: VerifyJobData = { by: user.username, startedAt: new Date().toISOString(), origin: currentAuditOrigin() };
            const jobId = await tryEnqueue(auditLedgerQueue, 'verify', data, { jobId: VERIFY_JOB_ID });
            if (!jobId) {
                localRun = data;
                void runVerify(data)
                    .catch((err: Error) => logger.error({ err: err.message }, 'Audit ledger verification crashed'))
                    .finally(() => {
                        localRun = null;
                    });
            }
        }
        return auditLedgerService.status();
    },

    /** Nightly: today's digest. */
    async nightly() {
        const row = await saveDigest('JOB', 'system');
        logger.info({ blockId: row ? String(row.blockId) : null }, 'Audit ledger digest saved');
    },

    /** Keeps the nightly digest scheduled (one scheduler for every process). */
    async schedule() {
        if (!isQueueAvailable()) {
            logger.warn('Redis is unavailable: the nightly audit ledger digest is not scheduled until it is back');
            return;
        }
        try {
            await auditLedgerQueue().upsertJobScheduler(DIGEST_SCHEDULER_ID, { pattern: DIGEST_PATTERN, tz: ENV.BUSINESS_TIMEZONE }, { name: 'digest' });
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Could not schedule the nightly audit ledger digest');
        }
    },
};
