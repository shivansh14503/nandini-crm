import { prisma, type TransactionClient } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { auditQueue, tryEnqueue } from '../jobs/queues.js';

export type AuditEntityType = 'Organization' | 'Contact' | 'Lead' | 'Opportunity' | 'Quotation' | 'Product' | 'Ticket' | 'User' | 'Import';

export type AuditAction =
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'STATUS_CHANGE'
    | 'CONVERT'
    | 'IMPORT'
    | 'LOGIN'
    | 'LOGIN_FAILED'
    | 'LOGOUT';

export interface AuditEntry {
    entityType: AuditEntityType;
    entityId: string;
    action: AuditAction;
    changedBy: string;
    /** A `{ field: { from, to } }` diff for updates, or a snapshot / summary for other actions. */
    changes?: unknown;
}

/** Fields that change on every write and would only add noise to a diff. */
const IGNORED_FIELDS = new Set(['updatedAt', 'updatedBy', 'isRecentlyViewed', 'isMyAccount']);

/** Shallow field-level diff of two DTOs (nested values such as email lists compare by JSON). */
export function diffRecords(before: object, after: object): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const a = before as Record<string, unknown>;
    const b = after as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (IGNORED_FIELDS.has(key)) continue;
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changes[key] = { from: a[key], to: b[key] };
    }
    return changes;
}

const toRow = (entry: AuditEntry) => ({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    changedBy: entry.changedBy,
    changesJson: entry.changes === undefined ? null : JSON.stringify(entry.changes),
});

/**
 * Two write paths:
 *  • `record` / `recordMany` write inside the caller's transaction. Used for every data change, so a change
 *    and its audit entry commit (or roll back) together; an audit trail that can lose entries isn't one.
 *  • `enqueue` hands events that have no transaction of their own (logins, import summaries) to the BullMQ
 *    audit queue, falling back to a direct write when Redis is unavailable.
 */
export const auditService = {
    async record(tx: TransactionClient, entry: AuditEntry): Promise<void> {
        await tx.auditLog.create({ data: toRow(entry) });
    },

    async recordMany(tx: TransactionClient, entries: AuditEntry[]): Promise<void> {
        if (entries.length === 0) return;
        await tx.auditLog.createMany({ data: entries.map(toRow) });
    },

    /** Direct write outside a transaction (the audit worker and the no-Redis fallback). */
    async write(entry: AuditEntry): Promise<void> {
        await prisma.auditLog.create({ data: toRow(entry) });
    },

    /** Fire-and-forget: never throws, so auditing can't break the action being audited. */
    async enqueue(entry: AuditEntry): Promise<void> {
        try {
            const jobId = await tryEnqueue(auditQueue, entry.action, entry);
            if (!jobId) await auditService.write(entry);
        } catch (err) {
            logger.error({ err: (err as Error).message, entry: { ...entry, changes: undefined } }, 'Failed to record audit event');
        }
    },
};
