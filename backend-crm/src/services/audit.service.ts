import { prisma, type TransactionClient } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import type { Prisma } from '../generated/prisma/client.js';
import { auditQueue, tryEnqueue } from '../jobs/queues.js';
import {
    categoryFor,
    changedFieldsOf,
    moduleFor,
    redact,
    severityFor,
    type AuditAction,
    type AuditEntityType,
    type AuditSeverity,
} from './auditCatalog.js';
import { currentAuditOrigin, currentRevertTarget, type AuditOrigin } from './auditContext.js';
import { labelKey, resolveLabels } from './auditLabels.js';

export type { AuditAction, AuditCategory, AuditEntityType, AuditSeverity } from './auditCatalog.js';

export interface AuditEntry {
    entityType: AuditEntityType;
    entityId: string;
    action: AuditAction;
    changedBy: string;
    /** A `{ field: { from, to } }` diff for updates, or a snapshot / summary for other actions. */
    changes?: unknown;
    /** What the request context can't know yet, e.g. at sign-in the user isn't on the request. */
    actor?: { id?: number; role?: string; sessionId?: string };
    /** Overrides the action's default severity (auditCatalog.severityFor). */
    severity?: AuditSeverity;
    /** The entry this one undoes / restores (`AuditLog.id`). */
    revertsId?: string;
}

/** A queued entry carries the origin captured when it was queued: the worker runs outside the request. */
interface QueuedAuditEntry extends AuditEntry {
    origin?: AuditOrigin;
}

/** Actions an undo (`runAsRevertOf`) writes through a module's normal update path. */
const UNDO_WRITES: ReadonlySet<AuditAction> = new Set(['UPDATE', 'STATUS_CHANGE', 'FOLLOW_UP']);

/** Inside an undo, the update entry of the record being put back becomes a REVERT of the entry being undone. */
function asRevert(entry: AuditEntry): AuditEntry {
    const target = currentRevertTarget();
    if (!target || entry.revertsId || !UNDO_WRITES.has(entry.action)) return entry;
    if (entry.entityType !== target.entityType || entry.entityId !== target.entityId) return entry;
    return { ...entry, action: 'REVERT', revertsId: target.id };
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

const clip = (value: string | undefined, max: number) => (value ? value.slice(0, max) : null);

/** Rows per INSERT: 22 columns each stays under SQL Server's 2,100 parameters per statement. */
const INSERT_BATCH = 80;

async function insertRows(client: TransactionClient, rows: Prisma.AuditLogCreateManyInput[]): Promise<void> {
    // createMany: a plain INSERT, no OUTPUT clause or read-back of the new rows.
    for (let i = 0; i < rows.length; i += INSERT_BATCH) await client.auditLog.createMany({ data: rows.slice(i, i + INSERT_BATCH) });
}

/** Full rows: catalog columns, record labels (one lookup per entity type), and the request / job origin. */
async function toRows(client: TransactionClient, entries: AuditEntry[], origin: AuditOrigin | undefined): Promise<Prisma.AuditLogCreateManyInput[]> {
    const labels = await resolveLabels(client, entries);
    return entries.map((entry) => {
        const changes = entry.changes === undefined ? undefined : redact(entry.changes);
        const category = categoryFor(entry.entityType, entry.action);
        const label = labels.get(labelKey(entry.entityType, entry.entityId));
        return {
            category,
            action: entry.action,
            severity: entry.severity ?? severityFor(entry.action, category),
            module: moduleFor(entry.entityType, changes),
            entityType: entry.entityType,
            entityId: entry.entityId,
            entityCode: label?.code ?? null,
            entityLabel: label?.label ?? null,
            changedFields: changedFieldsOf(entry.action, changes),
            changesJson: changes === undefined ? null : JSON.stringify(changes),
            changedBy: entry.changedBy.slice(0, 50),
            actorId: entry.actor?.id ?? origin?.actorId ?? null,
            actorRole: clip(entry.actor?.role ?? origin?.actorRole, 50),
            source: origin?.source ?? null,
            requestId: clip(origin?.requestId, 50),
            sessionId: clip(entry.actor?.sessionId ?? origin?.sessionId, 50),
            httpMethod: clip(origin?.httpMethod, 10),
            route: clip(origin?.route, 200),
            page: clip(origin?.page, 300),
            ipAddress: clip(origin?.ipAddress, 45),
            userAgent: clip(origin?.userAgent, 400),
            revertsId: entry.revertsId ? BigInt(entry.revertsId) : null,
        };
    });
}

/**
 * Two write paths:
 *  • `record` / `recordMany` write inside the caller's transaction. Used for every data change, so a change
 *    and its audit entry commit (or roll back) together; an audit trail that can lose entries isn't one.
 *  • `enqueue` hands events that have no transaction of their own (logins, import summaries, refused access) to the
 *    BullMQ audit queue with the current origin, falling back to a direct write when Redis is unavailable.
 * Who / where / how (actor, role, source, request id, session, route, screen, IP, browser) comes from the request
 * context (auditContext.ts); the table is append-only (AuditLog in schema.prisma).
 */
export const auditService = {
    async record(tx: TransactionClient, entry: AuditEntry): Promise<void> {
        await insertRows(tx, await toRows(tx, [asRevert(entry)], currentAuditOrigin()));
    },

    /** Any number of entries (inserted in batches), e.g. bulk deletes and bulk email checks. */
    async recordMany(tx: TransactionClient, entries: AuditEntry[]): Promise<void> {
        if (entries.length === 0) return;
        await insertRows(tx, await toRows(tx, entries.map(asRevert), currentAuditOrigin()));
    },

    /** Direct write outside a transaction (the audit worker and the no-Redis fallback). */
    async write(entry: QueuedAuditEntry): Promise<void> {
        const { origin, ...rest } = entry;
        const client = prisma as unknown as TransactionClient;
        await insertRows(client, await toRows(client, [rest], origin ?? currentAuditOrigin()));
    },

    /** Fire-and-forget: never throws, so auditing can't break the action being audited. */
    async enqueue(entry: AuditEntry): Promise<void> {
        const queued: QueuedAuditEntry = { ...entry, origin: currentAuditOrigin() };
        try {
            const jobId = await tryEnqueue(auditQueue, entry.action, queued);
            if (!jobId) await auditService.write(queued);
        } catch (err) {
            logger.error({ err: (err as Error).message, entry: { ...entry, changes: undefined } }, 'Failed to record audit event');
        }
    },
};
