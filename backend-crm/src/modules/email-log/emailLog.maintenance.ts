import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ORPHAN_GRACE_MS, PURGE_BATCH, RETENTION_BATCH, RETENTION_MAX_BATCHES } from './emailLog.constants.js';
import { loadEmailLogContext } from './emailLog.ingest.js';

/**
 * Housekeeping of logged emails (design note EL10). Every delete is bounded (batches of 500, short statements, no long
 * transaction on Azure SQL); copies and links go with their email (FK CASCADE).
 *   - nightly (inside the 00:25 calendar nightly wake): emails older than the retention, at most 20 batches a night, then
 *     emails left without any copy for a day (a run that crashed between its rows; a purge already removes its own).
 *   - purge (admin, People dialog): one person's copies, then every email left without a copy.
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

/** The nightly step: retention, then orphans. Runs whatever the company switch says (old rows must still age out). */
export async function runEmailLogNightly(now: Date = new Date()): Promise<{ expired: number; orphans: number }> {
    const { settings } = await loadEmailLogContext();
    const cutoff = monthsBefore(now, settings.retentionMonths);
    const expired = await deleteEmailsWhere({ sentAt: { lt: cutoff } }, RETENTION_MAX_BATCHES);
    const orphans = await deleteEmailsWhere({ copies: { none: {} }, createdAt: { lt: new Date(now.getTime() - ORPHAN_GRACE_MS) } }, 4);
    if (expired + orphans > 0) logger.info({ expired, orphans, retentionMonths: settings.retentionMonths }, 'Email logging retention');
    return { expired, orphans };
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
