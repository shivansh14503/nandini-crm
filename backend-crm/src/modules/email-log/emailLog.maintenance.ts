import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import { MAILBOX_LEASE_MS, ORPHAN_GRACE_MS, PURGE_BATCH, RETENTION_BATCH, RETENTION_MAX_BATCHES } from './emailLog.constants.js';
import { loadEmailLogContext } from './emailLog.ingest.js';

/**
 * Housekeeping of logged emails (design note EL10). Every delete is bounded (batches of 500, short statements, no long
 * transaction on Azure SQL); copies and links go with their email (FK CASCADE).
 *   - nightly (inside the 00:25 calendar nightly wake): emails older than the retention, at most 20 batches a night, then
 *     emails left without any copy for a day (a run that crashed between its rows; a purge already removes its own),
 *     then, while "Keep a short snippet" is off, snippets still stored (≤ 20 batches).
 *   - purge (admin, People dialog): takes the person's mailbox lease and stamps `purgedAt` (clearing the cursor), then
 *     deletes the person's copies and every email left without a copy, then frees the lease. A run that was working
 *     sees the purge and removes what it stored; mail from before `purgedAt` is never logged again.
 *   - snippets off (admin save): stored snippets are cleared in bounded batches at once; the nightly finishes the rest.
 */

/** `now` minus whole months (calendar months, UTC). Pure. */
export function monthsBefore(now: Date, months: number): Date {
    const d = new Date(now.getTime());
    d.setUTCMonth(d.getUTCMonth() - months);
    return d;
}

/** Deletes emails matching `where`, by id batches; returns how many. */
async function deleteEmailsWhere(where: Prisma.LoggedEmailWhereInput, maxBatches: number): Promise<number> {
    let deleted = 0;
    for (let i = 0; i < maxBatches; i += 1) {
        const ids = (await prisma.loggedEmail.findMany({ where, select: { id: true }, take: RETENTION_BATCH })).map((r) => r.id);
        if (ids.length === 0) break;
        deleted += (await prisma.loggedEmail.deleteMany({ where: { id: { in: ids } } })).count;
        if (ids.length < RETENTION_BATCH) break;
    }
    return deleted;
}

/** Clears stored snippets (snippets switched off), by id batches; returns how many emails were cleared. */
export async function clearSnippets(maxBatches: number): Promise<number> {
    let cleared = 0;
    for (let i = 0; i < maxBatches; i += 1) {
        const ids = (await prisma.loggedEmail.findMany({ where: { snippet: { not: null } }, select: { id: true }, take: RETENTION_BATCH })).map((r) => r.id);
        if (ids.length === 0) break;
        cleared += (await prisma.loggedEmail.updateMany({ where: { id: { in: ids } }, data: { snippet: null } })).count;
        if (ids.length < RETENTION_BATCH) break;
    }
    return cleared;
}

/**
 * The nightly step: retention, then orphans, then leftover snippets while snippets are off. Runs whatever the company
 * switch says (old rows must still age out).
 */
export async function runEmailLogNightly(now: Date = new Date()): Promise<{ expired: number; orphans: number; snippetsCleared: number }> {
    const { settings } = await loadEmailLogContext();
    const cutoff = monthsBefore(now, settings.retentionMonths);
    const expired = await deleteEmailsWhere({ sentAt: { lt: cutoff } }, RETENTION_MAX_BATCHES);
    const orphans = await deleteEmailsWhere({ copies: { none: {} }, createdAt: { lt: new Date(now.getTime() - ORPHAN_GRACE_MS) } }, 4);
    const snippetsCleared = settings.storeSnippets ? 0 : await clearSnippets(RETENTION_MAX_BATCHES);
    if (expired + orphans + snippetsCleared > 0) logger.info({ expired, orphans, snippetsCleared, retentionMonths: settings.retentionMonths }, 'Email logging retention');
    return { expired, orphans, snippetsCleared };
}

/**
 * Starts a purge: takes the mailbox lease whoever holds it (a working run's final write is then dropped and it removes
 * what it stored, emailLog.ingest.ts), stamps `purgedAt` and clears the cursor (the next run starts from a fresh
 * baseline that never reaches before the purge). Returns the purge's lease id. One statement, no transaction.
 */
export async function beginPurge(username: string, admin: string, now: Date): Promise<string> {
    const leaseId = `purge-${randomUUID()}`;
    const data = { purgedAt: now, purgedBy: admin, cursorJson: null, loggedCount: 0, leaseId, leaseUntil: new Date(now.getTime() + MAILBOX_LEASE_MS) };
    await prisma.loggedEmailMailbox.upsert({ where: { username }, create: { username, ...data }, update: data });
    return leaseId;
}

/** Frees the purge's lease (only while the purge still holds it). */
export async function endPurge(username: string, leaseId: string): Promise<void> {
    await prisma.loggedEmailMailbox.updateMany({ where: { username, leaseId }, data: { leaseId: null, leaseUntil: null } });
}

/** Deletes one person's copies (bounded loop) and every email left without a copy. Not audited here (the caller is). */
export async function purgeMailboxCopies(username: string): Promise<{ copies: number; emails: number }> {
    let copies = 0;
    let emails = 0;
    for (;;) {
        const batch = await prisma.loggedEmailCopy.findMany({ where: { username }, select: { id: true, emailId: true }, take: PURGE_BATCH });
        if (batch.length === 0) break;
        copies += (await prisma.loggedEmailCopy.deleteMany({ where: { id: { in: batch.map((c) => c.id) } } })).count;
        const emailIds = [...new Set(batch.map((c) => c.emailId))];
        emails += (await prisma.loggedEmail.deleteMany({ where: { id: { in: emailIds }, copies: { none: {} } } })).count;
        if (batch.length < PURGE_BATCH) break;
    }
    // Emails still owned by this person but held by colleagues stay (their copies); the owner name stays as history.
    return { copies, emails };
}

/** Whether the server lets email logging run at all (EMAIL_LOG_ENABLED). */
export const emailLogServerEnabled = (): boolean => ENV.INTEGRATIONS.EMAIL_LOG_ENABLED;
