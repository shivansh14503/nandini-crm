import { REDACTED } from '../../services/auditCatalog.js';
import { expandDiff } from './auditAdmin.present.js';

/**
 * Undo planning (pure, unit tested in auditUndo.test.ts): which fields of an UPDATE entry can be put back, given the
 * record as it is now. The write itself goes through the module's normal update (auditActions.service.ts).
 */

/** Entries an admin can undo: field edits and status changes of a CRM record (not follow-ups, conversions or imports). */
export const UNDOABLE_ACTIONS: ReadonlySet<string> = new Set(['UPDATE', 'STATUS_CHANGE']);

const CUSTOM_PREFIX = 'customFields.';

/**
 * `ready`: still holds the value the entry set, so it can be put back. `conflict`: changed again since (left alone).
 * `already`: already holds the old value again (nothing to do). `blocked`: can't be written back (a value that was
 * redacted when stored, or a key that isn't a field of the record any more).
 */
export type UndoFieldStatus = 'ready' | 'conflict' | 'already' | 'blocked';

export interface UndoFieldPlan {
    key: string;
    /** Value before the change (what an undo puts back). */
    from: unknown;
    /** Value the change set. */
    to: unknown;
    /** Value on the record now. */
    current: unknown;
    status: UndoFieldStatus;
    /** Why a `blocked` field can't be put back, when there is more to say than "hidden or gone" (`UndoBlock`). */
    reason?: string;
}

/** Fields of an entry that undo must leave alone, and why (`undoBlockFor`). */
export interface UndoBlock {
    /** `'all'`: every field of the entry. */
    fields: ReadonlySet<string> | 'all';
    reason: string;
}

/** Audit origin route of calendar sync work (Calendar Phase 2, `job:calendar-sync:<provider>`). */
export const CALENDAR_SYNC_ROUTE_PREFIX = 'job:calendar-sync';
export const CALENDAR_CHANGE_REASON = 'Changed from the calendar: change it in Google / Outlook or on the record.';
export const FOLLOW_UP_LOCK_REASON = 'A follow-up activity follows its lead / opportunity: change it on the record (Record a follow-up).';
export const EXTERNAL_LOCK_REASON = "Organized outside the CRM: change it in the organizer's calendar.";

/** DTO keys that move together with a locked field (the days of an all-day start / end, the related record's code). */
const LOCK_COMPANIONS: Readonly<Record<string, readonly string[]>> = {
    startAt: ['startDay'],
    endAt: ['endDay'],
    relatedId: ['relatedCode'],
};

/**
 * What an undo of this entry may not write back (spec §3.6), or null:
 *  • a Lead / Opportunity entry written by calendar sync (the follow-up activity's time moved in Google / Outlook,
 *    P2-5): every field, as undoing it through the record's form would hit "Pick a Customer Response…";
 *  • an Activity entry on an activity whose fields are locked now (`lockedFields` of the activity view, e.g. a
 *    lead / opportunity follow-up activity, P2-4): those fields, as `PUT` would refuse them with 409
 *    FOLLOW_UP_ACTIVITY_LOCKED. An ordinary activity's entries stay undoable, whoever wrote them.
 */
export function undoBlockFor(entry: { entityType: string; route?: string | null }, record: Record<string, unknown>): UndoBlock | null {
    if ((entry.entityType === 'Lead' || entry.entityType === 'Opportunity') && entry.route?.startsWith(CALENDAR_SYNC_ROUTE_PREFIX)) {
        return { fields: 'all', reason: CALENDAR_CHANGE_REASON };
    }
    if (entry.entityType === 'Activity' && Array.isArray(record.lockedFields) && record.lockedFields.length > 0) {
        const locked = record.lockedFields.filter((key): key is string => typeof key === 'string');
        const reason = record.externalOrganizer === true && record.origin !== 'followup' ? EXTERNAL_LOCK_REASON : FOLLOW_UP_LOCK_REASON;
        return { fields: new Set(locked.flatMap((key) => [key, ...(LOCK_COMPANIONS[key] ?? [])])), reason };
    }
    return null;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Blank in any spelling: undefined, null, '' or an empty list all read as "no value". */
const isBlank = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/** JSON with object keys sorted, so two values compare equal whatever their key order. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (isObject(value)) {
        return `{${Object.keys(value)
            .filter((key) => value[key] !== undefined)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

/** Same stored value (blank values all alike, object key order ignored). */
export function sameValue(a: unknown, b: unknown): boolean {
    if (isBlank(a) || isBlank(b)) return isBlank(a) && isBlank(b);
    return canonical(a) === canonical(b);
}

/** A field's value on the record DTO (`customFields.<key>` reads the custom field bag). */
export function fieldValue(record: Record<string, unknown>, key: string): unknown {
    if (key.startsWith(CUSTOM_PREFIX)) {
        const bag = record.customFields;
        return isObject(bag) ? bag[key.slice(CUSTOM_PREFIX.length)] : undefined;
    }
    return record[key];
}

const isField = (record: Record<string, unknown>, key: string) => key.startsWith(CUSTOM_PREFIX) || key in record;
const wasRedacted = (value: unknown) => value === REDACTED;

/** Every field the entry changed, with what an undo would do to it now. `block`: fields to leave alone (`undoBlockFor`). */
export function planUndo(changes: unknown, record: Record<string, unknown>, block?: UndoBlock | null): UndoFieldPlan[] {
    return expandDiff(changes).map(({ key, from, to }) => {
        const current = fieldValue(record, key);
        let status: UndoFieldStatus;
        if (block && (block.fields === 'all' || block.fields.has(key))) return { key, from, to, current, status: 'blocked' as const, reason: block.reason };
        if (wasRedacted(from) || wasRedacted(to) || !isField(record, key)) status = 'blocked';
        else if (sameValue(current, to)) status = sameValue(from, to) ? 'already' : 'ready';
        else status = sameValue(current, from) ? 'already' : 'conflict';
        return { key, from, to, current, status };
    });
}

/**
 * The update patch that puts the chosen `ready` fields back (`keys` omitted: all of them). Custom fields go back
 * into the record's current bag, so the other custom fields keep their values; a custom field that didn't exist
 * before the change is removed again.
 */
export function buildUndoPatch(plans: UndoFieldPlan[], record: Record<string, unknown>, keys?: readonly string[]): Record<string, unknown> {
    const wanted = keys ? new Set(keys) : undefined;
    const patch: Record<string, unknown> = {};
    let custom: Record<string, unknown> | undefined;
    for (const plan of plans) {
        if (plan.status !== 'ready' || (wanted && !wanted.has(plan.key))) continue;
        if (plan.key.startsWith(CUSTOM_PREFIX)) {
            custom ??= { ...(isObject(record.customFields) ? record.customFields : {}) };
            const fieldKey = plan.key.slice(CUSTOM_PREFIX.length);
            if (plan.from === undefined) delete custom[fieldKey];
            else custom[fieldKey] = plan.from;
            continue;
        }
        patch[plan.key] = plan.from === undefined ? null : plan.from;
    }
    if (custom) patch.customFields = custom;
    return patch;
}

// ── What an entry offers ────────────────────────────────────────────────────

/** CRM records an entry can be undone on or restored from (the 11 modules with soft delete). */
export const RECORD_ENTITY_TYPES: ReadonlySet<string> = new Set([
    'Lead',
    'Contact',
    'Organization',
    'Opportunity',
    'Quotation',
    'Product',
    'Ticket',
    'Contract',
    'Activity',
    'PartnerCompany',
    'Referral',
]);

export interface ActionAvailability {
    available: boolean;
    /** Why it isn't available. */
    reason?: string;
}

export interface EntryActions {
    /** null when the entry isn't a field change of a CRM record. */
    undo: ActionAvailability | null;
    /** null when the entry isn't a delete of a CRM record. */
    restore: ActionAvailability | null;
}

const no = (reason: string): ActionAvailability => ({ available: false, reason });
const MISSING = 'The record no longer exists in the database.';

/**
 * Whether an entry can be undone or restored from, given the record's status now and whether an entry already
 * reverses it. Field conflicts are only known once the record is read (`planUndo`, the undo preview).
 */
export function entryActions(
    row: { action: string; entityType: string },
    changes: unknown,
    status: 'live' | 'deleted' | 'missing' | null,
    reversed: boolean,
): EntryActions {
    if (!RECORD_ENTITY_TYPES.has(row.entityType)) return { undo: null, restore: null };
    if (row.action === 'DELETE') {
        if (reversed) return { undo: null, restore: no('The record was already restored from this entry.') };
        if (status === 'missing') return { undo: null, restore: no(MISSING) };
        if (status === 'live') return { undo: null, restore: no('The record isn’t deleted any more.') };
        return { undo: null, restore: { available: true } };
    }
    if (!UNDOABLE_ACTIONS.has(row.action)) return { undo: null, restore: null };
    if (reversed) return { undo: no('This change was already undone.'), restore: null };
    if (status === 'missing') return { undo: no(MISSING), restore: null };
    if (status === 'deleted') return { undo: no('The record is deleted. Restore it first.'), restore: null };
    if (expandDiff(changes).length === 0) return { undo: no('This entry has no field changes to undo.'), restore: null };
    return { undo: { available: true }, restore: null };
}
