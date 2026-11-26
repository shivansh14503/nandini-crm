import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { zonedDayOf } from '../../utils/zonedTime.js';
import { loadRatingConfig } from '../leads/lead.followUp.js';
import { CLOSED_SALES_STAGES } from '../opportunities/opportunity.validator.js';
import { lockRecords, runInTransaction } from '../shared/transactions.js';
import {
    afterFollowUpCommit,
    desiredFollowUp,
    FOLLOW_UP_LOCK_ENTITY,
    followUpActivitiesOn,
    followUpTypeOf,
    LEAD_FOLLOW_UP_SELECT,
    leadFollowUpTarget,
    NO_OUTCOME,
    OPPORTUNITY_FOLLOW_UP_SELECT,
    openFollowUpWhere,
    opportunityFollowUpTarget,
    planFollowUpChange,
    reconcileRecordFollowUp,
    retryOnceOnUniqueViolation,
    type FollowUpModule,
    type FollowUpTarget,
    type OpenFollowUp,
} from './activity.followUp.js';
import type { ActivityCommitRow } from './activity.service.js';
import { loadFollowUpContext, type FollowUpContext } from './activity.system.js';

/**
 * Follow-up activity backfill and re-alignment (Calendar Phase 2 P2-4, spec §11.6): `npm run followups:backfill
 * [-- --dry-run]` (scripts/backfillFollowUpActivities.ts) and a nightly step (calendar sync worker, `calendar-nightly` 00:25).
 *
 *  1. Every open lead / opportunity with a next follow-up whose follow-up activity is missing or out of line (slot,
 *     type, owner, creator, organization / contact) is reconciled: created after P2-4's deploy, or put back in line
 *     after the `followUpActivities` switch (D44) was off for a while.
 *  2. Every open follow-up activity whose record is closed, deleted or has no follow-up any more is cancelled.
 *
 * Each record is fixed in its own small transaction that takes the record's lock (`lockRecords`, the same one every
 * lead / opportunity save takes) and re-reads the record and its open activity under it, so it serializes with
 * interactive saves and is idempotent: running it twice, or next to the nightly step, changes nothing more. No
 * unique-index error is caught inside a transaction (D45): one aborts that record's transaction, which is retried once.
 * Writes are audited `Activity CREATE / UPDATE` by `system` under the `job:followup-backfill` origin, with the record's
 * creator as the activity's `createdBy` and no notifications. Past slots get overdue activities with their reminder
 * stored as sent (`quietPastReminder` in activity.followUp.ts: no late reminders; calendar push skips them, §9.1).
 * With the switch off nothing is written (the dry run still counts).
 */

export const BACKFILL_ACTOR = 'system';
export const BACKFILL_ROUTE = 'job:followup-backfill';
export const DEFAULT_BACKFILL_BATCH = 200;

export interface FollowUpBackfillOptions {
    /** Records read per query (default 200). */
    batch?: number;
    /** Count only; write nothing. */
    dryRun?: boolean;
    now?: Date;
}

export interface ModuleBackfillReport {
    /** Open records with a follow-up that were checked. */
    checked: number;
    /** Of those: no open follow-up activity yet. */
    missing: number;
    /** Of those: an open follow-up activity out of line with the record. */
    misaligned: number;
    /** Open follow-up activities whose record is closed, deleted or has no follow-up any more (cancelled). */
    orphaned: number;
    /** Records whose Followup Type is blank, Task or Note (their activities get Call). */
    fallbackType: number;
    /** Records whose follow-up has already passed (their activities are created overdue). */
    pastSlots: number;
    /** Records / activities written (0 on a dry run). */
    fixed: number;
    /** Records whose transaction failed (logged; the next run tries again). */
    failed: number;
}

export interface FollowUpBackfillReport {
    dryRun: boolean;
    /** The `followUpActivities` switch was off: nothing was written. */
    switchedOff: boolean;
    leads: ModuleBackfillReport;
    opportunities: ModuleBackfillReport;
}

const emptyReport = (): ModuleBackfillReport => ({ checked: 0, missing: 0, misaligned: 0, orphaned: 0, fallbackType: 0, pastSlots: 0, fixed: 0, failed: 0 });

/** Open follow-up activity columns the check compares (OpenFollowUp) plus its record. */
const OPEN_FOLLOW_UP_SELECT = {
    id: true,
    followupType: true,
    subject: true,
    assignedTo: true,
    createdBy: true,
    startAt: true,
    endAt: true,
    allDay: true,
    timeZone: true,
    organizationId: true,
    organizationName: true,
    contactId: true,
    contact: true,
    relatedId: true,
} as const;

type OpenRow = OpenFollowUp & { relatedId: string | null };

/** The module's record reader: open records with a follow-up (keyset by id), one record by id, as targets. */
interface ModuleReader {
    module: FollowUpModule;
    openWithSlot(after: string | null, take: number): Promise<FollowUpTarget[]>;
    byIds(db: TransactionClient | typeof prisma, ids: string[]): Promise<FollowUpTarget[]>;
}

const keyset = (after: string | null) => (after ? { id: { gt: after } } : {});

function leadReader(closingStatuses: ReadonlySet<string>): ModuleReader {
    return {
        module: 'leads',
        async openWithSlot(after, take) {
            const rows = await prisma.lead.findMany({
                where: { isDeleted: false, nextFollowupDate: { not: null }, status: { notIn: [...closingStatuses] }, ...keyset(after) },
                select: LEAD_FOLLOW_UP_SELECT,
                orderBy: { id: 'asc' },
                take,
            });
            return rows.map((row) => leadFollowUpTarget(row, closingStatuses));
        },
        async byIds(db, ids) {
            const rows = await db.lead.findMany({ where: { id: { in: ids } }, select: LEAD_FOLLOW_UP_SELECT });
            return rows.map((row) => leadFollowUpTarget(row, closingStatuses));
        },
    };
}

const opportunityReader: ModuleReader = {
    module: 'opportunities',
    async openWithSlot(after, take) {
        const rows = await prisma.opportunity.findMany({
            where: { isDeleted: false, nextFollowupDate: { not: null }, salesStage: { notIn: [...CLOSED_SALES_STAGES] }, ...keyset(after) },
            select: OPPORTUNITY_FOLLOW_UP_SELECT,
            orderBy: { id: 'asc' },
            take,
        });
        return rows.map(opportunityFollowUpTarget);
    },
    async byIds(db, ids) {
        const rows = await db.opportunity.findMany({ where: { id: { in: ids } }, select: OPPORTUNITY_FOLLOW_UP_SELECT });
        return rows.map(opportunityFollowUpTarget);
    },
};

/** Whether the record's follow-up activity needs a write (pure: the planner with no outcome). */
export function needsReconcile(target: FollowUpTarget, open: OpenFollowUp | null, context: FollowUpContext, now: Date): boolean {
    const change = planFollowUpChange(open, desiredFollowUp(target, context), NO_OUTCOME, now);
    return Boolean(change.insert || change.patch || change.cancel);
}

/**
 * One record, in its own transaction under its lock: re-reads it and reconciles. A record that no longer exists has
 * its open follow-up activities cancelled through a target that is closed.
 */
async function fixRecord(reader: ModuleReader, id: string, context: FollowUpContext, now: Date): Promise<ActivityCommitRow[]> {
    return retryOnceOnUniqueViolation(() =>
        runInTransaction(async (tx) => {
            await lockRecords(tx, FOLLOW_UP_LOCK_ENTITY[reader.module], [id]);
            const [target] = await reader.byIds(tx, [id]);
            const fallback: FollowUpTarget = {
                module: reader.module,
                id,
                code: '',
                name: '',
                assignedTo: BACKFILL_ACTOR,
                createdBy: BACKFILL_ACTOR,
                followupType: null,
                organizationId: null,
                organizationName: null,
                contactId: null,
                contactName: null,
                slot: null,
                open: false,
            };
            const { rows } = await reconcileRecordFollowUp(tx, target ?? fallback, NO_OUTCOME, BACKFILL_ACTOR, now, { context, notify: false });
            return rows;
        }),
    );
}

async function backfillModule(reader: ModuleReader, opts: Required<Pick<FollowUpBackfillOptions, 'batch' | 'dryRun'>> & { now: Date }): Promise<ModuleBackfillReport> {
    const report = emptyReport();
    const fix = async (id: string, context: FollowUpContext) => {
        if (opts.dryRun || !followUpActivitiesOn(context)) return;
        try {
            const rows = await fixRecord(reader, id, context, opts.now);
            report.fixed++;
            await afterFollowUpCommit(rows, BACKFILL_ACTOR);
        } catch (err) {
            report.failed++;
            logger.warn({ module: reader.module, recordId: id, err: (err as Error).message }, 'Follow-up activity backfill failed for a record');
        }
    };

    // 1. Open records with a follow-up: missing or out-of-line activities.
    for (let after: string | null = null; ; ) {
        const context = await loadFollowUpContext();
        const targets = await reader.openWithSlot(after, opts.batch);
        if (targets.length === 0) break;
        after = targets[targets.length - 1].id;
        const open = (await prisma.activity.findMany({
            where: openFollowUpWhere(
                reader.module,
                targets.map((t) => t.id),
            ),
            select: OPEN_FOLLOW_UP_SELECT,
        })) as OpenRow[];
        const openByRecord = new Map(open.map((row) => [row.relatedId, row]));
        for (const target of targets) {
            report.checked++;
            const current = openByRecord.get(target.id) ?? null;
            if (!needsReconcile(target, current, context, opts.now)) continue;
            if (current) report.misaligned++;
            else report.missing++;
            if (followUpTypeOf(target.followupType) !== (target.followupType ?? '').trim()) report.fallbackType++;
            const when = desiredFollowUp(target, context).when;
            if (when && (when.allDay ? when.day < zonedDayOf(opts.now, ENV.BUSINESS_TIMEZONE) : when.startAt < opts.now)) report.pastSlots++;
            await fix(target.id, context);
        }
        if (targets.length < opts.batch) break;
    }

    // 2. Open activities whose record is closed, deleted, gone or without a follow-up.
    for (let after: string | null = null; ; ) {
        const context = await loadFollowUpContext();
        const open: { id: string; relatedId: string | null }[] = await prisma.activity.findMany({
            where: { ...openFollowUpWhere(reader.module, []), relatedId: { not: null }, ...keyset(after) },
            select: { id: true, relatedId: true },
            orderBy: { id: 'asc' },
            take: opts.batch,
        });
        if (open.length === 0) break;
        after = open[open.length - 1].id;
        const recordIds = [...new Set(open.map((row) => row.relatedId).filter((id): id is string => Boolean(id)))];
        const targets = new Map((await reader.byIds(prisma, recordIds)).map((t) => [t.id, t]));
        for (const recordId of recordIds) {
            const target = targets.get(recordId);
            if (target?.open && target.slot) continue;
            report.orphaned++;
            await fix(recordId, context);
        }
        if (open.length < opts.batch) break;
    }
    return report;
}

/** Runs the backfill for leads, then opportunities (see the module comment). Never run inside a transaction. */
export async function backfillFollowUpActivities(options: FollowUpBackfillOptions = {}): Promise<FollowUpBackfillReport> {
    const opts = { batch: Math.max(1, options.batch ?? DEFAULT_BACKFILL_BATCH), dryRun: options.dryRun ?? false, now: options.now ?? new Date() };
    return runWithAuditOrigin({ source: 'JOB', route: BACKFILL_ROUTE }, async () => {
        const switchedOff = !followUpActivitiesOn(await loadFollowUpContext());
        const { closingStatuses } = await loadRatingConfig(prisma);
        const leads = await backfillModule(leadReader(closingStatuses), opts);
        const opportunities = await backfillModule(opportunityReader, opts);
        return { dryRun: opts.dryRun, switchedOff, leads, opportunities };
    });
}

/** The nightly step (calendar sync worker, `calendar-nightly`; the reminders worker until P2-3b): never throws, logs what it did. */
export async function runFollowUpBackfillNightly(): Promise<FollowUpBackfillReport | null> {
    try {
        const report = await backfillFollowUpActivities();
        logger.info({ report }, 'Follow-up activity backfill');
        return report;
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Nightly follow-up activity backfill failed');
        return null;
    }
}
