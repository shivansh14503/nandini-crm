import { addDays } from '../../utils/zonedTime.js';
import type { SystemActivityFields } from '../activities/activity.system.js';
import { LOCATION_MAX, SUBJECT_MAX } from './sync.constants.js';
import { crmViewOfProvider, peopleOf, sameWhen, type CrmAttendee, type CrmShape, type CrmWhen, type FieldGroup, type ProviderShape, type SyncBase } from './sync.shapes.js';

/**
 * The three-way merge (Calendar Phase 2 spec §8.7 "Merge", D13). Pure. P2-3b uses it on the push side, when a PATCH
 * answers 412 (someone changed the event in the calendar since our last write): the provider's changes are applied
 * to the CRM, the CRM's still-unsent changes stay dirty, and the push retries with the new etag. P2-5's pull reuses it.
 *
 * Per group (subject, when, location, attendees): changed on one side → that side's value; on both, the same value →
 * nothing; on both, different values → the later write wins (Activity.updatedAt vs the provider's `updated`), a tie
 * goes to the provider. Attendees merge per address: added on either side → kept, removed on either side → dropped;
 * replies come from the provider unless it says `needsAction` while the CRM has a real answer. Status (deletions) is
 * the caller's (§8.9); reminder and description are push-only and never applied inbound.
 */

export const MERGE_GROUPS = ['subject', 'when', 'location', 'attendees'] as const satisfies readonly FieldGroup[];
type MergeGroup = (typeof MERGE_GROUPS)[number];

export interface MergeClock {
    /** Activity.updatedAt. */
    crmChangedAt: Date;
    /** The provider's `updated` (null when not given: the provider wins ties anyway). */
    providerChangedAt: Date | null;
}

export interface MergePlan {
    /** Groups whose merged value differs from the CRM now (written to the activity). */
    apply: MergeGroup[];
    /** The CRM side after the merge (what the activity should hold). */
    merged: CrmShape;
    /** Groups changed on both sides with different values. */
    conflicts: MergeGroup[];
    /** Groups the provider still has to receive (the link stays dirty). */
    crmPending: MergeGroup[];
    /** The new base: the provider as it is now; the CRM side as agreed, still-pending groups keep their old value. */
    base: SyncBase;
}

const sortedKeys = (record: Record<string, unknown>) => Object.keys(record).sort().join('\n');

function sameGroup(group: Exclude<MergeGroup, 'attendees'>, a: CrmShape, b: CrmShape): boolean {
    if (group === 'when') return sameWhen(a.when, b.when);
    return a[group] === b[group];
}

/** Attendees merged per address (see the module comment). */
export function mergeAttendees(
    baseCrm: Record<string, CrmAttendee>,
    crmNow: Record<string, CrmAttendee>,
    baseProvider: Record<string, CrmAttendee>,
    providerNow: Record<string, CrmAttendee>,
): Record<string, CrmAttendee> {
    const out: Record<string, CrmAttendee> = {};
    const emails = new Set([...Object.keys(baseCrm), ...Object.keys(crmNow), ...Object.keys(baseProvider), ...Object.keys(providerNow)]);
    for (const email of [...emails].sort()) {
        const inCrm = email in crmNow;
        const inProvider = email in providerNow;
        let keep: boolean;
        if (inCrm && inProvider) keep = true;
        else if (inCrm) keep = !(email in baseProvider); // the provider removed it → dropped; else the CRM added it
        else if (inProvider) keep = !(email in baseCrm); // the CRM removed it → dropped; else the provider added it
        else keep = false;
        if (!keep) continue;
        const crm = crmNow[email];
        const provider = providerNow[email];
        let response = provider?.response ?? crm?.response ?? 'needsAction';
        if (provider && crm && provider.response === 'needsAction' && crm.response !== 'needsAction') response = crm.response;
        const name = provider?.name ?? crm?.name;
        out[email] = { response, ...(name ? { name } : {}) };
    }
    return out;
}

function sameAttendees(a: Record<string, CrmAttendee>, b: Record<string, CrmAttendee>): boolean {
    if (sortedKeys(a) !== sortedKeys(b)) return false;
    return Object.entries(a).every(([email, row]) => b[email]?.response === row.response);
}

export interface MergeOptions {
    /**
     * False leaves attendees alone (a private copy's CRM attendees were never sent, so the provider's empty list says
     * nothing about them). Default true.
     */
    withAttendees?: boolean;
    /**
     * Groups the CRM always keeps (a lead / opportunity follow-up activity's schedule follows its record, P2-4): a
     * provider change there is never applied; the CRM's value is pushed back.
     */
    crmOnly?: readonly ('subject' | 'when' | 'location')[];
}

/** Merges the provider's current event into the CRM's view (pure). */
export function planMerge(base: SyncBase, crmNow: CrmShape, providerNow: ProviderShape, clock: MergeClock, options: MergeOptions = {}): MergePlan {
    const withAttendees = options.withAttendees ?? true;
    const crmOnly = new Set(options.crmOnly ?? []);
    const providerView = crmViewOfProvider(providerNow, crmNow);
    const providerBaseView = crmViewOfProvider(base.provider, base.crm);
    const providerWinsTies = !clock.providerChangedAt || clock.providerChangedAt.getTime() >= clock.crmChangedAt.getTime();

    const merged: CrmShape = { ...crmNow, attendees: { ...crmNow.attendees } };
    const nextBaseCrm: CrmShape = { ...base.crm, attendees: { ...base.crm.attendees } };
    const apply: MergeGroup[] = [];
    const conflicts: MergeGroup[] = [];
    const crmPending: MergeGroup[] = [];

    for (const group of ['subject', 'when', 'location'] as const) {
        const crmChanged = !sameGroup(group, crmNow, base.crm);
        const providerChanged = !sameGroup(group, providerView, providerBaseView);
        if (!crmChanged && !providerChanged) continue;
        if (crmOnly.has(group)) {
            // The agreed value becomes the provider's, so the CRM's (different) value is pushed back.
            (nextBaseCrm as unknown as Record<string, unknown>)[group] = providerView[group];
            if (!sameGroup(group, crmNow, providerView)) crmPending.push(group);
            continue;
        }
        if (crmChanged && !providerChanged) {
            crmPending.push(group);
            continue;
        }
        if (crmChanged && sameGroup(group, crmNow, providerView)) {
            // Both made the same change: agreed.
            (nextBaseCrm as unknown as Record<string, unknown>)[group] = crmNow[group];
            continue;
        }
        if (crmChanged) conflicts.push(group);
        if (!crmChanged || providerWinsTies) {
            (merged as unknown as Record<string, unknown>)[group] = providerView[group];
            (nextBaseCrm as unknown as Record<string, unknown>)[group] = providerView[group];
            apply.push(group);
        } else {
            crmPending.push(group);
        }
    }

    if (withAttendees) {
        const providerPeople = providerView.attendees;
        const target = mergeAttendees(base.crm.attendees, crmNow.attendees, providerBaseView.attendees, providerPeople);
        if (!sameAttendees(target, crmNow.attendees)) apply.push('attendees');
        merged.attendees = target;
        // Agreed = what the provider holds now; addresses only the CRM side has (or lacks) still push from there.
        nextBaseCrm.attendees = Object.fromEntries(Object.entries(providerPeople).map(([email, a]) => [email, { response: a.response }]));
        if (sortedKeys(target) !== sortedKeys(providerPeople)) crmPending.push('attendees');
        const crmChanged = sortedKeys(crmNow.attendees) !== sortedKeys(base.crm.attendees);
        const providerChanged = sortedKeys(providerPeople) !== sortedKeys(peopleOf(base.provider.attendees));
        if (crmChanged && providerChanged && sortedKeys(crmNow.attendees) !== sortedKeys(providerPeople)) conflicts.push('attendees');
    }

    return { apply, merged, conflicts, crmPending, base: { crm: nextBaseCrm, provider: providerNow } };
}

/** The longest event the CRM takes from a calendar (§8.8: longer ones keep the CRM's times). */
export const MAX_INBOUND_SPAN_MS = 31 * 24 * 60 * 60_000;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A merged schedule as system-write fields (all-day: inclusive days; the provider's end day is exclusive); null when unusable or longer than 31 days. */
export function scheduleFieldsOf(when: CrmWhen): Pick<SystemActivityFields, 'allDay' | 'startAt' | 'endAt' | 'startDay' | 'endDay'> | null {
    if (when.allDay) {
        if (!DAY_RE.test(when.start) || !DAY_RE.test(when.end)) return null;
        const last = when.end > when.start ? addDays(when.end, -1) : when.start;
        if (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${when.start}T00:00:00Z`) >= MAX_INBOUND_SPAN_MS) return null;
        return { allDay: true, startDay: when.start, endDay: last };
    }
    const start = Date.parse(when.start);
    const end = Date.parse(when.end);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    if (end - start > MAX_INBOUND_SPAN_MS) return null;
    return { allDay: false, startAt: new Date(start).toISOString(), endAt: new Date(Math.max(start, end)).toISOString() };
}

/** The scalar part of `applySystemPatch`'s patch for the applied groups (attendees are resolved by the caller). */
export function systemPatchOf(plan: Pick<MergePlan, 'apply' | 'merged'>): Partial<SystemActivityFields> {
    const patch: Partial<SystemActivityFields> = {};
    if (plan.apply.includes('subject')) patch.subject = plan.merged.subject.trim().slice(0, SUBJECT_MAX) || '(No title)';
    if (plan.apply.includes('location')) patch.location = plan.merged.location.slice(0, LOCATION_MAX) || null;
    if (plan.apply.includes('when')) {
        const fields = scheduleFieldsOf(plan.merged.when);
        if (fields) Object.assign(patch, fields);
    }
    return patch;
}
