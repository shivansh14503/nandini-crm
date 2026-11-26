import { ENV } from '../../config/env.js';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import { logger } from '../../config/logger.js';
import type { TransactionClient } from '../../config/prisma.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { fromDateOnly, toDateOnly } from '../../utils/mappers.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import { zonedDayOf, instantToZonedWallClock } from '../../utils/zonedTime.js';
import { CONVERTED_STATUS } from '../leads/lead.validator.js';
import { CLOSED_SALES_STAGES } from '../opportunities/opportunity.validator.js';
import { isActivityOnlyFollowupType } from '../shared/followupTypes.js';
import { lockRecords } from '../shared/transactions.js';
import { FOLLOW_UP_ORIGIN } from './activity.access.js';
import { followUpSlotInstant } from './activity.calendar.js';
import { allDayRange, type ActivityRow } from './activity.mapper.js';
import { activityDurationMinutes, COMPLETED_STATUS, PLANNED_STATUS } from './activity.schedule.js';
import { runActivityPostCommit, WITH_ATTENDEES, type ActivityCommitRow } from './activity.service.js';
import { applySystemPatch, insertSystemActivity, type FollowUpContext, type SystemActivityFields } from './activity.system.js';

/**
 * Lead / opportunity follow-ups as activities (Calendar Phase 2 P2-4, spec §11, D28). Every open lead / opportunity
 * with a next follow-up has exactly one open "follow-up activity" (FA): `origin = 'followup'`, Planned, related to the
 * record, guarded by the filtered unique index UX_Activity_openFollowUp. The record stays the source of truth for the
 * slot (Lead Rating, ageing and scorecards keep reading the record's own columns); the FA is what reminders, the bell,
 * the Activities tab, the calendar and (P2-3b) Google / Outlook see.
 *
 * `reconcileRecordFollowUp` runs inside the record's own transaction (lead / opportunity create, update, remove,
 * bulk remove, restore, conversion, imports, the backfill) under the record's lock (`lockRecords`), so two writers
 * never both insert (D45: no unique-index error is ever caught inside the transaction; a refusal aborts it and the
 * caller retries it once, `retryOnceOnUniqueViolation`). Its config (`FollowUpContext`) is loaded by the caller before
 * the transaction. All writes go through the system write path (activity.system.ts): audited `Activity CREATE /
 * UPDATE` with the real actor as `changedBy`, the owner taken verbatim (a lead still owned by a deactivated user
 * saves), and the write hook where P2-3b's calendar outbox plugs in. After the commit the caller runs
 * `afterFollowUpCommit(rows, actor)` (reminder, notifications, activities caches).
 *
 * Switch: `CalendarSyncSettings.followUpActivities` (D44). Off → every function here is a no-op and existing FAs are
 * left as they are; switched back on, the nightly backfill re-aligns every record.
 */

export type FollowUpModule = 'leads' | 'opportunities';

/** `lockRecords` entity of each module (the lock every lead / opportunity writer takes). */
export const FOLLOW_UP_LOCK_ENTITY = { leads: 'lead', opportunities: 'opportunity' } as const satisfies Record<FollowUpModule, string>;

/** A follow-up slot as the record stores it: business-timezone day + 12-hour time text ('11:00 AM', '' = none). */
export interface FollowUpSlot {
    date: string;
    time: string;
}

/** The record a follow-up activity mirrors (spec §11.2). */
export interface FollowUpTarget {
    module: FollowUpModule;
    id: string;
    /** Record number (LD-0012 / OPP-0007). */
    code: string;
    /** Lead name; opportunity name ‖ organization name. */
    name: string;
    /** Owner (username), taken verbatim (an inactive owner is kept). */
    assignedTo: string;
    /** The record's creator: the FA's `createdBy`, so who can see the FA matches who can see the record (§11.1). */
    createdBy: string;
    followupType: string | null;
    organizationId: string | null;
    organizationName: string | null;
    contactId: string | null;
    contactName: string | null;
    /** Null when the record has no next follow-up. */
    slot: FollowUpSlot | null;
    /** False when closed (lead in a closing status / Converted; opportunity Closed Won / Lost) or deleted. */
    open: boolean;
    /**
     * The subject the record's previous state derives (`followUpSubject`). The FA's subject is rewritten only when the
     * derived text changes (code, name or type), so a subject edited in the CRM or a calendar survives other saves.
     * Unset (create, restore, backfill): the subject of an existing FA is left alone.
     */
    derivedSubjectBefore?: string;
}

/** What the save recorded (spec §11.2). */
export type FollowUpOutcome =
    | { kind: 'none' }
    | { kind: 'recorded'; response: string; remarks: string; decision: 'keep' | 'new' | 'closed' };

export const NO_OUTCOME: FollowUpOutcome = { kind: 'none' };

/** Type of a follow-up activity when the record's is blank, or Task / Note (activities only; older records may hold them). */
export const FOLLOW_UP_FALLBACK_TYPE = 'Call';

/** The FA's Followup Type: the record's, or Call when it is blank / Task / Note (never passed to the system path). */
export function followUpTypeOf(recordType: string | null | undefined): string {
    const type = (recordType ?? '').trim();
    return !type || isActivityOnlyFollowupType(type) ? FOLLOW_UP_FALLBACK_TYPE : type;
}

const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max).trimEnd() : value);

/** `"<Type> follow-up: <code> <name>"`, at most 200 characters (Activity.subject). */
export function followUpSubject(target: Pick<FollowUpTarget, 'followupType' | 'code' | 'name'>): string {
    return clip(`${followUpTypeOf(target.followupType)} follow-up: ${[target.code, target.name.trim()].filter(Boolean).join(' ')}`.trim(), L.title);
}

// ── Targets ──────────────────────────────────────────────────────────────────

/** The lead columns a target reads. */
export interface LeadFollowUpRow {
    id: string;
    leadCode: string;
    name: string;
    organizationName: string | null;
    assignedTo: string | null;
    createdBy: string;
    followupType: string | null;
    status: string;
    nextFollowupDate: Date | null;
    nextFollowupTime: string | null;
    isDeleted: boolean;
}

export const LEAD_FOLLOW_UP_SELECT = {
    id: true,
    leadCode: true,
    name: true,
    organizationName: true,
    assignedTo: true,
    createdBy: true,
    followupType: true,
    status: true,
    nextFollowupDate: true,
    nextFollowupTime: true,
    isDeleted: true,
} as const;

/** The opportunity columns a target reads. */
export interface OpportunityFollowUpRow {
    id: string;
    opportunityCode: string;
    opportunityName: string | null;
    organizationName: string;
    organizationId: string | null;
    contact: string;
    contactId: string | null;
    assignedTo: string | null;
    createdBy: string;
    followupType: string | null;
    salesStage: string;
    nextFollowupDate: Date | null;
    nextFollowupTime: string | null;
    isDeleted: boolean;
}

export const OPPORTUNITY_FOLLOW_UP_SELECT = {
    id: true,
    opportunityCode: true,
    opportunityName: true,
    organizationName: true,
    organizationId: true,
    contact: true,
    contactId: true,
    assignedTo: true,
    createdBy: true,
    followupType: true,
    salesStage: true,
    nextFollowupDate: true,
    nextFollowupTime: true,
    isDeleted: true,
} as const;

const slotOf = (date: Date | null, time: string | null): FollowUpSlot | null => (date ? { date: toDateOnly(date), time: (time ?? '').trim() } : null);

/** A lead as a follow-up target. `closingStatuses`: Converted and every "Closes the lead" status (`loadRatingConfig`). */
export function leadFollowUpTarget(row: LeadFollowUpRow, closingStatuses: ReadonlySet<string>): FollowUpTarget {
    return {
        module: 'leads',
        id: row.id,
        code: row.leadCode,
        name: row.name,
        assignedTo: row.assignedTo ?? row.createdBy,
        createdBy: row.createdBy,
        followupType: row.followupType,
        organizationId: null,
        organizationName: row.organizationName,
        contactId: null,
        contactName: null,
        slot: slotOf(row.nextFollowupDate, row.nextFollowupTime),
        open: !row.isDeleted && !closingStatuses.has(row.status),
    };
}

const CLOSED_STAGES: ReadonlySet<string> = new Set(CLOSED_SALES_STAGES);

/** An opportunity as a follow-up target. */
export function opportunityFollowUpTarget(row: OpportunityFollowUpRow): FollowUpTarget {
    return {
        module: 'opportunities',
        id: row.id,
        code: row.opportunityCode,
        name: row.opportunityName?.trim() || row.organizationName,
        assignedTo: row.assignedTo ?? row.createdBy,
        createdBy: row.createdBy,
        followupType: row.followupType,
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        contactId: row.contactId,
        contactName: row.contact,
        slot: slotOf(row.nextFollowupDate, row.nextFollowupTime),
        open: !row.isDeleted && !CLOSED_STAGES.has(row.salesStage.trim()),
    };
}

// ── Planner (pure) ───────────────────────────────────────────────────────────

/** When the open follow-up activity should be: timed (instants) or all-day (one business-timezone day). */
export type FollowUpWhen = { allDay: false; startAt: Date; endAt: Date } | { allDay: true; day: string };

/** What the record says its follow-up activity should be. */
export interface DesiredFollowUp {
    followupType: string;
    subject: string;
    /** True when the derived subject changed with this save (`FollowUpTarget.derivedSubjectBefore`). */
    rewriteSubject: boolean;
    assignedTo: string;
    createdBy: string;
    relatedModule: FollowUpModule;
    relatedId: string;
    organizationId: string | null;
    organizationName: string | null;
    /** Leads have no contact: the FA's contact is left alone (null here). */
    contactId: string | null;
    contactName: string | null;
    reminder: string | null;
    /** Null: no open follow-up activity is wanted (closed, deleted, or no slot). */
    when: FollowUpWhen | null;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The record's follow-up as an activity (spec §11.1): its slot at the 12-hour time in the business timezone, lasting
 * the type's default duration (0 stays 0), or the whole day when the time is blank or unreadable.
 */
export function desiredFollowUp(target: FollowUpTarget, context: FollowUpContext, timeZone: string = ENV.BUSINESS_TIMEZONE): DesiredFollowUp {
    const followupType = followUpTypeOf(target.followupType);
    const subject = followUpSubject(target);
    let when: FollowUpWhen | null = null;
    if (target.open && target.slot && DAY_PATTERN.test(target.slot.date)) {
        const slot = followUpSlotInstant(fromDateOnly(target.slot.date), target.slot.time, timeZone);
        if (slot.allDay) when = { allDay: true, day: slot.day };
        else {
            const minutes = activityDurationMinutes(followupType, context.activityConfig.followupTypes);
            when = { allDay: false, startAt: slot.start, endAt: new Date(slot.start.getTime() + minutes * 60_000) };
        }
    }
    return {
        followupType,
        subject,
        rewriteSubject: target.derivedSubjectBefore !== undefined && target.derivedSubjectBefore !== subject,
        assignedTo: target.assignedTo,
        createdBy: target.createdBy,
        relatedModule: target.module,
        relatedId: target.id,
        organizationId: target.organizationId,
        organizationName: target.organizationName,
        contactId: target.contactId,
        contactName: target.contactName,
        reminder: context.calendarSettings.followUpReminder,
        when,
    };
}

/** The open follow-up activity's columns the planner compares. */
export type OpenFollowUp = Pick<
    ActivityRow,
    | 'id'
    | 'followupType'
    | 'subject'
    | 'assignedTo'
    | 'createdBy'
    | 'startAt'
    | 'endAt'
    | 'allDay'
    | 'timeZone'
    | 'organizationId'
    | 'organizationName'
    | 'contactId'
    | 'contact'
>;

/** The writes that bring the follow-up activity in line, applied in this order (complete before insert). */
export interface FollowUpChange {
    /** Complete the open FA with the recorded response (its times stay as they were). */
    complete?: { id: string; fields: Partial<SystemActivityFields> };
    /** Log a separate Completed activity (`origin = 'crm'`): a response recorded while the slot is kept, or with no open FA. */
    logCompleted?: { fields: SystemActivityFields; createdBy: string };
    /** Cancel the open FA (record closed, deleted, or its follow-up cleared without a response). */
    cancel?: { id: string };
    /** Bring the open FA in line: only the fields that differ. `createdBy` re-aligns the stored creator. */
    patch?: { id: string; fields: Partial<SystemActivityFields>; createdBy?: string };
    /** Create the open FA. */
    insert?: { fields: SystemActivityFields; createdBy: string };
}

const nameKey = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const optional = (value: string | null | undefined) => (value && value.trim() ? value : undefined);
/** Remarks are stored only when at least 3 characters (the activity rule), at most 2000. */
const remarksValue = (value: string) => {
    const text = value.trim();
    return text.length >= 3 ? clip(text, L.longText) : undefined;
};

function whenFields(when: FollowUpWhen): Partial<SystemActivityFields> {
    return when.allDay
        ? { allDay: true, startDay: when.day, endDay: when.day }
        : { allDay: false, startAt: when.startAt.toISOString(), endAt: when.endAt.toISOString() };
}

function sameWhen(open: OpenFollowUp, when: FollowUpWhen): boolean {
    if (!open.startAt) return false;
    if (when.allDay) {
        if (!open.allDay) return false;
        const days = allDayRange(open.startAt, open.endAt, open.timeZone);
        return days.startDay === when.day && days.endDay === when.day;
    }
    return !open.allDay && open.startAt.getTime() === when.startAt.getTime() && (open.endAt?.getTime() ?? null) === when.endAt.getTime();
}

/** Links of the FA: leads link the organization by name (no id, no contact); opportunities by id. */
function linkFields(desired: DesiredFollowUp): Partial<SystemActivityFields> {
    const fields: Partial<SystemActivityFields> = { organizationName: desired.organizationName ?? '' };
    if (desired.relatedModule === 'opportunities') {
        fields.organizationId = desired.organizationId ?? null;
        fields.contactId = desired.contactId ?? null;
        fields.contact = desired.contactName ?? '';
    }
    return fields;
}

function linkChanges(open: OpenFollowUp, desired: DesiredFollowUp): Partial<SystemActivityFields> {
    const changes: Partial<SystemActivityFields> = {};
    const orgDiffers =
        desired.relatedModule === 'opportunities' && desired.organizationId
            ? open.organizationId !== desired.organizationId
            : nameKey(open.organizationName) !== nameKey(desired.organizationName);
    if (orgDiffers) {
        changes.organizationName = desired.organizationName ?? '';
        if (desired.relatedModule === 'opportunities') changes.organizationId = desired.organizationId ?? null;
    }
    if (desired.relatedModule === 'opportunities') {
        const contactDiffers = desired.contactId ? open.contactId !== desired.contactId : nameKey(open.contact) !== nameKey(desired.contactName);
        if (contactDiffers) {
            changes.contactId = desired.contactId ?? null;
            changes.contact = desired.contactName ?? '';
        }
    }
    return changes;
}

/** A new Planned follow-up activity. */
function insertFields(desired: DesiredFollowUp, when: FollowUpWhen): SystemActivityFields {
    return {
        followupType: desired.followupType,
        subject: desired.subject,
        status: PLANNED_STATUS,
        assignedTo: desired.assignedTo,
        relatedModule: desired.relatedModule,
        relatedId: desired.relatedId,
        ...linkFields(desired),
        ...whenFields(when),
        reminder: desired.reminder ?? undefined,
    } as SystemActivityFields;
}

/**
 * Pure core of `reconcileRecordFollowUp` (spec §11.2):
 *  1. `open` is the record's open FA (null when none).
 *  2. `recorded` + `keep` → a separate Completed activity logs the response; the open FA is untouched.
 *  3. `recorded` + `new` / `closed` → the open FA is completed with the response, its times unchanged (moving an
 *     event that already happened would re-invite attendees); with no open FA a Completed activity logs it instead.
 *  4. The record still open with a slot → one Planned FA at the slot: none → insert; one → patch only what differs
 *     (times, type, owner, creator, organization / contact, subject when its derived text changed).
 *  5. Otherwise an FA still open → Cancelled (deleted record, Closed Won / Lost, follow-up cleared).
 */
export function planFollowUpChange(open: OpenFollowUp | null, desired: DesiredFollowUp, outcome: FollowUpOutcome, now: Date): FollowUpChange {
    const change: FollowUpChange = {};
    let current = open;

    if (outcome.kind === 'recorded') {
        // Only what was recorded: remarks someone added to the activity itself stay when the save sends none.
        const recorded: Partial<SystemActivityFields> = {};
        const response = optional(clip(outcome.response.trim(), L.option));
        const remarks = remarksValue(outcome.remarks);
        if (response) recorded.customerResponse = response;
        if (remarks) recorded.remarks = remarks;
        if (outcome.decision !== 'keep' && current) {
            change.complete = { id: current.id, fields: { status: COMPLETED_STATUS, ...recorded } };
            current = null;
        } else {
            change.logCompleted = {
                fields: {
                    followupType: desired.followupType,
                    subject: desired.subject,
                    status: COMPLETED_STATUS,
                    assignedTo: desired.assignedTo,
                    relatedModule: desired.relatedModule,
                    relatedId: desired.relatedId,
                    ...linkFields(desired),
                    startAt: new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString(),
                    ...recorded,
                } as SystemActivityFields,
                createdBy: desired.createdBy,
            };
        }
    }

    if (!desired.when) {
        if (current) change.cancel = { id: current.id };
        return change;
    }
    if (!current) {
        change.insert = { fields: insertFields(desired, desired.when), createdBy: desired.createdBy };
        return change;
    }

    const fields: Partial<SystemActivityFields> = {};
    if (current.followupType !== desired.followupType) fields.followupType = desired.followupType;
    if (!sameWhen(current, desired.when)) Object.assign(fields, whenFields(desired.when));
    if (nameKey(current.assignedTo) !== nameKey(desired.assignedTo)) fields.assignedTo = desired.assignedTo;
    if (desired.rewriteSubject && current.subject !== desired.subject) fields.subject = desired.subject;
    Object.assign(fields, linkChanges(current, desired));
    const realign = nameKey(current.createdBy) !== nameKey(desired.createdBy);
    if (Object.keys(fields).length > 0 || realign) {
        change.patch = { id: current.id, fields, ...(realign ? { createdBy: desired.createdBy } : {}) };
    }
    return change;
}

// ── Reconcile (inside the record's transaction) ──────────────────────────────

export interface FollowUpWriteOptions {
    /** Loaded before the transaction (`loadFollowUpContext`). Required: nothing here reads config. */
    context: FollowUpContext;
    /** False: no owner notifications (imports, the backfill, calendar applies). Default true (interactive saves). */
    notify?: boolean;
}

/**
 * What a record writer that creates the record inside a shared helper (`createLeadRecord`, `createOpportunityRecord`)
 * is given: the options plus `rows`, which collects the activity writes for `afterFollowUpCommit`. Create `rows`
 * inside the transaction callback, so a retried attempt starts empty.
 */
export interface RecordFollowUpWrite extends FollowUpWriteOptions {
    rows: ActivityCommitRow[];
}

function assertContext(opts: FollowUpWriteOptions | undefined): asserts opts is FollowUpWriteOptions {
    if (!opts?.context?.activityConfig || !opts.context.calendarSettings) {
        throw new Error('Follow-up activities need a FollowUpContext loaded before the transaction (loadFollowUpContext).');
    }
}

/** Whether follow-ups create activities (D44 switch). */
export const followUpActivitiesOn = (context: FollowUpContext): boolean => context.calendarSettings.followUpActivities;

/** `where` of a record's open follow-up activity (the UX_Activity_openFollowUp filter). */
export const openFollowUpWhere = (module: FollowUpModule, ids: string | string[]) => ({
    origin: FOLLOW_UP_ORIGIN,
    status: PLANNED_STATUS,
    isDeleted: false,
    relatedModule: module,
    relatedId: Array.isArray(ids) ? { in: ids } : ids,
});

/** The record's open follow-up activity, locked (null when none). Reads through `tx` only. */
async function loadOpenFollowUp(tx: TransactionClient, module: FollowUpModule, id: string): Promise<ActivityRow | null> {
    const open = await tx.activity.findFirst({ where: openFollowUpWhere(module, id), include: WITH_ATTENDEES });
    if (open) await lockRecords(tx, 'activity', [open.id]);
    return open;
}

async function applyChange(
    tx: TransactionClient,
    change: FollowUpChange,
    actor: string,
    now: Date,
    opts: FollowUpWriteOptions,
): Promise<ActivityCommitRow[]> {
    // A follow-up whose slot already passed shows as overdue; its reminder isn't sent late (backfill, restore, past slots).
    const base = { activityConfig: opts.context.activityConfig, notify: opts.notify ?? true, quietPastReminder: true };
    const rows: ActivityCommitRow[] = [];
    if (change.complete) rows.push(await applySystemPatch(tx, change.complete.id, change.complete.fields, actor, now, base));
    if (change.logCompleted) rows.push(await insertSystemActivity(tx, change.logCompleted.fields, actor, now, { ...base, createdBy: change.logCompleted.createdBy }));
    if (change.cancel) rows.push(await applySystemPatch(tx, change.cancel.id, { status: 'Cancelled' }, actor, now, base));
    if (change.patch) rows.push(await applySystemPatch(tx, change.patch.id, change.patch.fields, actor, now, { ...base, createdBy: change.patch.createdBy }));
    if (change.insert) {
        rows.push(
            await insertSystemActivity(tx, change.insert.fields, actor, now, { ...base, createdBy: change.insert.createdBy, rowData: { origin: FOLLOW_UP_ORIGIN } }),
        );
    }
    return rows;
}

/**
 * Brings the record's follow-up activity in line with the record (spec §11.2), inside the record's transaction and
 * under its lock. Returns the activity writes for `afterFollowUpCommit`. A no-op when the switch is off (D44).
 */
export async function reconcileRecordFollowUp(
    tx: TransactionClient,
    target: FollowUpTarget,
    outcome: FollowUpOutcome,
    actor: string,
    now: Date,
    opts: FollowUpWriteOptions,
): Promise<{ rows: ActivityCommitRow[] }> {
    assertContext(opts);
    if (!followUpActivitiesOn(opts.context)) return { rows: [] };
    const open = await loadOpenFollowUp(tx, target.module, target.id);
    const change = planFollowUpChange(open, desiredFollowUp(target, opts.context), outcome, now);
    return { rows: await applyChange(tx, change, actor, now, opts) };
}

/**
 * Cancels the open follow-up activities of records being deleted (`bulkRemove`): one query for all of them. Same as
 * reconciling each with `open: false` and no outcome.
 */
export async function cancelRecordFollowUps(
    tx: TransactionClient,
    module: FollowUpModule,
    ids: string[],
    actor: string,
    now: Date,
    opts: FollowUpWriteOptions,
): Promise<{ rows: ActivityCommitRow[] }> {
    assertContext(opts);
    if (!followUpActivitiesOn(opts.context) || ids.length === 0) return { rows: [] };
    const open = await tx.activity.findMany({ where: openFollowUpWhere(module, ids), select: { id: true } });
    if (open.length === 0) return { rows: [] };
    await lockRecords(
        tx,
        'activity',
        open.map((row) => row.id),
    );
    const rows: ActivityCommitRow[] = [];
    for (const row of open) rows.push(...(await applyChange(tx, { cancel: { id: row.id } }, actor, now, opts)));
    return { rows };
}

/**
 * An organization rename (organization.service `update`, after `propagateOrganizationName` wrote the new name to its
 * opportunities and activities). An opportunity without an Opportunity Name derives its follow-up activity's subject
 * from its organization's name, so the open follow-up activities of those opportunities get the new subject through
 * the system path (audited, write hook), under each opportunity's lock. Only a subject still derived from the old name
 * is rewritten: one edited in the CRM or a calendar is kept, as on a record save.
 */
export async function renameOrganizationFollowUps(
    tx: TransactionClient,
    organizationId: string,
    previousName: string,
    actor: string,
    now: Date,
    opts: FollowUpWriteOptions,
): Promise<{ rows: ActivityCommitRow[] }> {
    assertContext(opts);
    if (!followUpActivitiesOn(opts.context)) return { rows: [] };
    const linked = await tx.opportunity.findMany({ where: { organizationId, isDeleted: false }, select: { id: true, opportunityName: true } });
    const unnamed = linked.filter((row) => !row.opportunityName?.trim()).map((row) => row.id);
    if (unnamed.length === 0) return { rows: [] };
    const open = await tx.activity.findMany({ where: openFollowUpWhere('opportunities', unnamed), select: { id: true, relatedId: true, subject: true } });
    if (open.length === 0) return { rows: [] };
    const ids = [...new Set(open.map((fa) => fa.relatedId).filter((id): id is string => Boolean(id)))];
    await lockRecords(tx, FOLLOW_UP_LOCK_ENTITY.opportunities, ids);
    const records = new Map(
        (await tx.opportunity.findMany({ where: { id: { in: ids } }, select: OPPORTUNITY_FOLLOW_UP_SELECT })).map((row) => [row.id, row] as const),
    );
    const base = { activityConfig: opts.context.activityConfig, notify: opts.notify ?? true, quietPastReminder: true };
    const rows: ActivityCommitRow[] = [];
    for (const fa of open) {
        const row = fa.relatedId ? records.get(fa.relatedId) : undefined;
        if (!row || row.isDeleted || row.opportunityName?.trim()) continue;
        const before = followUpSubject(opportunityFollowUpTarget({ ...row, organizationName: previousName }));
        const after = followUpSubject(opportunityFollowUpTarget(row));
        if (before === after || fa.subject !== before) continue;
        rows.push(await applySystemPatch(tx, fa.id, { subject: after }, actor, now, base));
    }
    return { rows };
}

/**
 * Lead conversion (spec §11.3): moves the lead's open follow-up activity to the new opportunity (related record,
 * code, label, organization / contact from it, and its derived subject), audited as an UPDATE, so the opportunity's
 * reconcile adopts it instead of cancelling one event and creating another (no calendar churn). Call it after the
 * opportunity is created and before its reconcile; the lead's own reconcile then finds nothing open.
 */
export async function relinkFollowUpActivity(
    tx: TransactionClient,
    from: { module: FollowUpModule; id: string },
    to: FollowUpTarget,
    actor: string,
    now: Date,
    opts: FollowUpWriteOptions,
): Promise<{ rows: ActivityCommitRow[] }> {
    assertContext(opts);
    if (!followUpActivitiesOn(opts.context)) return { rows: [] };
    const open = await loadOpenFollowUp(tx, from.module, from.id);
    if (!open) return { rows: [] };
    const fields: Partial<SystemActivityFields> = { relatedModule: to.module, relatedId: to.id, subject: followUpSubject(to) };
    // A newly picked record fills the organization / contact unless the patch names them (mergeActivityPatch).
    const row = await applySystemPatch(tx, open.id, fields, actor, now, { activityConfig: opts.context.activityConfig, notify: opts.notify ?? true });
    return { rows: [row] };
}

/**
 * After the record's transaction committed: reminders, owner / invitee notifications and the activities caches for
 * the follow-up activity writes (never throws for the notifications; see `runActivityPostCommit`).
 */
export async function afterFollowUpCommit(rows: readonly ActivityCommitRow[], actor: AuthUser | string): Promise<void> {
    if (rows.length === 0) return;
    await cacheService.invalidateEntityCaches('activities');
    await runActivityPostCommit(rows, actor);
}

/**
 * D45: runs a record transaction again, once, when it failed on a unique index (P2002). Writers pre-read the open
 * follow-up activity under the record's lock, so this only covers a writer that slipped past it; the second run's
 * re-read then finds the row. The error is never caught inside the transaction (SQL Server can leave a transaction
 * doomed after a caught error).
 */
export async function retryOnceOnUniqueViolation<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        logger.warn('Unique index refused a record save (follow-up activity race); retrying it once');
        return run();
    }
}

// ── Calendar → record (P2-5) ─────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** `11:00 AM` (the 12-hour text leads / opportunities store) for minutes after midnight. */
export function formatTimeOfDay(minutes: number): string {
    const hours = Math.floor(minutes / 60) % 24;
    const twelve = hours % 12 === 0 ? 12 : hours % 12;
    return `${pad(twelve)}:${pad(minutes % 60)} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** What a calendar move of a follow-up activity writes back to its record (pure, spec §11.5). */
export function slotFromCalendar(
    when: { allDay: boolean; startAt: Date },
    current: { nextFollowupTime: string | null },
    timeZone: string = ENV.BUSINESS_TIMEZONE,
): { nextFollowupDate: string; nextFollowupTime?: string; keptTime: boolean } {
    const day = zonedDayOf(when.startAt, timeZone);
    if (when.allDay) {
        // Lead rules need a time: timed → all-day writes the date only; the FA keeps the record's time on the new day.
        const keptTime = Boolean(current.nextFollowupTime?.trim());
        return keptTime ? { nextFollowupDate: day, keptTime } : { nextFollowupDate: day, nextFollowupTime: '', keptTime };
    }
    const wall = instantToZonedWallClock(when.startAt, timeZone);
    return { nextFollowupDate: day, nextFollowupTime: formatTimeOfDay(Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16))), keptTime: false };
}

/**
 * P2-5 (the pull, sync.pull.ts). The record's open follow-up activity moved in Google / Outlook writes its new slot
 * back to the record, inside the inbound apply's transaction: only `nextFollowupDate` / `nextFollowupTime`, audited
 * UPDATE on the Lead / Opportunity with `changedBy` = the owner (the caller runs it under the `job:calendar-sync`
 * audit origin). No Follow-up History row, no Rating change, and the record's reconcile isn't re-run (no loop). A
 * deleted or closed record (lead Converted, opportunity Closed Won / Lost) is left alone; the caller only passes the
 * record's open (Planned) follow-up activity, and P2-4 cancels that one when a lead reaches any closing status.
 */
export async function rescheduleRecordFromCalendar(
    tx: TransactionClient,
    module: FollowUpModule,
    id: string,
    when: { allDay: boolean; startAt: Date },
    actor: string,
): Promise<{ changed: boolean; keptTime: boolean }> {
    await lockRecords(tx, FOLLOW_UP_LOCK_ENTITY[module], [id]);
    const select = { nextFollowupDate: true, nextFollowupTime: true, isDeleted: true } as const;
    const row =
        module === 'leads'
            ? await tx.lead.findUnique({ where: { id }, select: { ...select, status: true } })
            : await tx.opportunity.findUnique({ where: { id }, select: { ...select, salesStage: true } });
    if (!row || row.isDeleted) return { changed: false, keptTime: false };
    const closed = 'status' in row ? row.status === CONVERTED_STATUS : CLOSED_STAGES.has((row.salesStage ?? '').trim());
    if (closed) return { changed: false, keptTime: false };
    const next = slotFromCalendar(when, row);
    const before = { nextFollowupDate: toDateOnly(row.nextFollowupDate), nextFollowupTime: row.nextFollowupTime ?? '' };
    const after = { nextFollowupDate: next.nextFollowupDate, nextFollowupTime: next.nextFollowupTime ?? before.nextFollowupTime };
    const changes = diffRecords(before, after);
    if (Object.keys(changes).length === 0) return { changed: false, keptTime: next.keptTime };
    const data = { nextFollowupDate: fromDateOnly(after.nextFollowupDate), nextFollowupTime: after.nextFollowupTime || null, updatedBy: actor };
    if (module === 'leads') await tx.lead.update({ where: { id }, data });
    else await tx.opportunity.update({ where: { id }, data });
    await auditService.record(tx, { entityType: module === 'leads' ? 'Lead' : 'Opportunity', entityId: id, action: 'UPDATE', changedBy: actor, changes });
    return { changed: true, keptTime: next.keptTime };
}
