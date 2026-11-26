import { ENV } from '../../config/env.js';
import { instantToZonedWallClock, zonedDayOf, zonedStartOfDay, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import type { ActivityRow } from '../activities/activity.mapper.js';
import type { SystemActivityFields } from '../activities/activity.system.js';
import type { AttendeeInput } from '../activities/activity.validator.js';
import { MAX_ATTENDEES } from '../activities/activity.validator.js';
import { parseHeld, patchAttendees, resolveAttendeeEmails, withoutHeld, type AttendeeDb, type ResolvedAttendees } from './sync.attendees.js';
import { FOLLOW_UP_NOTE_DAYS, FOLLOW_UP_TIME_KEPT_PREFIX } from './sync.constants.js';
import { planMerge, systemPatchOf, type MergePlan } from './sync.merge.js';
import { allInternal, crmShapeOf, internalDescription, isCompanyAddress, peopleOf, sameWhen, type CrmShape, type CrmWhen, type ProviderEvent, type SyncBase } from './sync.shapes.js';

/**
 * Inbound planning of the pull (Calendar Phase 2 spec §8.7 "Merge", §8.10, §8.14, §11.5; P2-5). Pure apart from
 * `inboundCrmNow`, which reads attendee addresses through the caller's client / transaction.
 *
 * Rules on top of the three-way merge (sync.merge.ts `planMerge`, shared with the push's 412 path):
 * - Only the organizer copy gets here (sync.classify.ts).
 * - Provider wins for subject / time / location / attendee edits made in the calendar unless the CRM changed the same
 *   group since the last agreed base (then the later write wins, a tie goes to the calendar).
 * - Lead / opportunity follow-up activities (P2-4): the CRM wins every `when` conflict (the slot is locked in the
 *   CRM); a calendar-only move is applied and written back to the record (`rescheduleRecordFromCalendar`). Timed →
 *   all-day in the calendar writes the date only: the activity keeps its time of day on the new day, the base keeps
 *   the calendar's all-day value so the next push puts the timed slot back, and the link says so.
 * - Longer than 31 days (D20): every group but `when` merges; the CRM keeps its times (never clamped).
 * - Reminder and description are never applied inbound; type, status (except deletions), related record, remarks,
 *   customer response and custom fields never change.
 * - The link becomes dirty when the CRM still has something to send (pending groups), or when a guest added in the
 *   calendar made the event external while it still carries the CRM's internal description (D15: the push clears it).
 */

/** The CRM side of one link now, as the push builds it (attendees minus held ones; none on a private copy). */
export async function inboundCrmNow(
    db: AttendeeDb,
    activity: ActivityRow,
    link: { invites: string; heldAttendeesJson: string | null; externalEventId: string | null },
    base: SyncBase | null,
    accountEmail: string,
    companyDomains: readonly string[],
): Promise<{ resolved: ResolvedAttendees; crmNow: CrmShape }> {
    const resolved = await resolveAttendeeEmails(db, activity.attendees, activity.assignedTo, accountEmail);
    const invited = link.invites === 'withhold' ? {} : withoutHeld(resolved.attendees, parseHeld(link.heldAttendeesJson));
    const onEvent = base && link.externalEventId ? peopleOf(patchAttendees(base.provider.attendees, base.crm.attendees, invited)) : invited;
    const description = allInternal(Object.keys(onEvent), companyDomains)
        ? internalDescription({ followupType: activity.followupType, relatedCode: activity.relatedCode, activityId: activity.id, appUrl: ENV.MAIL.APP_PUBLIC_URL })
        : '';
    return { resolved, crmNow: crmShapeOf(activity, invited, description) };
}

export interface InboundPlanInput {
    /** The link's agreed base; null (never stored) → the CRM and the calendar as they are now are taken as agreed. */
    base: SyncBase | null;
    crmNow: CrmShape;
    event: ProviderEvent;
    /** Activity.updatedAt. */
    crmChangedAt: Date;
    /** link.invites === 'send' (a private copy's attendees say nothing about the CRM's). */
    invitesSent: boolean;
    /** origin = 'followup'. */
    followUp: boolean;
    tooLong: boolean;
    activity: Pick<ActivityRow, 'startAt' | 'endAt' | 'allDay' | 'timeZone'>;
    companyDomains: readonly string[];
}

export interface FollowUpWriteBack {
    /** What the record gets (rescheduleRecordFromCalendar): the calendar's day (and time when timed). */
    when: { allDay: boolean; startAt: Date };
    /** Timed → all-day: only the date was written; the activity keeps its time of day. */
    keptTime: boolean;
}

export interface InboundPlan {
    merge: MergePlan;
    /** Scalar fields for `applySystemPatch` (attendees are resolved by the caller when `applyAttendees`). */
    patch: Partial<SystemActivityFields>;
    applyAttendees: boolean;
    followUp: FollowUpWriteBack | null;
    /** The link must be (or stay) dirty: the CRM still has something to send. */
    markDirty: boolean;
    /** Link note (`lastWarning`) for the follow-up time rule; null = none. */
    note: string | null;
}

const MINUTE_MS = 60_000;

/** `3 Dec, 11:00 AM` in the business zone (the follow-up note). */
export function slotLabel(at: Date, timeZone: string = ENV.BUSINESS_TIMEZONE): string {
    const wall = instantToZonedWallClock(at, timeZone);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hours = Number(wall.slice(11, 13));
    const minutes = wall.slice(14, 16);
    const twelve = hours % 12 === 0 ? 12 : hours % 12;
    return `${Number(wall.slice(8, 10))} ${months[Number(wall.slice(5, 7)) - 1]}, ${twelve}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** A timed slot on `day` at the activity's current time of day, same length (the follow-up timed → all-day rule). */
export function keepTimeOnDay(activity: Pick<ActivityRow, 'startAt' | 'endAt' | 'timeZone'>, day: string): CrmWhen | null {
    if (!activity.startAt) return null;
    const time = instantToZonedWallClock(activity.startAt, activity.timeZone).slice(11, 16);
    const start = zonedWallClockToInstant(`${day}T${time}`, activity.timeZone);
    const length = Math.max(0, (activity.endAt ?? activity.startAt).getTime() - activity.startAt.getTime());
    return { allDay: false, start: start.toISOString(), end: new Date(start.getTime() + Math.round(length / MINUTE_MS) * MINUTE_MS).toISOString() };
}

const removeGroup = <T extends string>(list: T[], group: T) => {
    const at = list.indexOf(group);
    if (at >= 0) list.splice(at, 1);
};

export function planInbound(input: InboundPlanInput): InboundPlan {
    const { crmNow, event, followUp, tooLong, companyDomains } = input;
    const providerNow = event.shape;
    const base: SyncBase = input.base ?? { crm: crmNow, provider: providerNow };
    const crmChangedWhen = !sameWhen(crmNow.when, base.crm.when);
    const merge = planMerge(
        base,
        crmNow,
        providerNow,
        { crmChangedAt: input.crmChangedAt, providerChangedAt: event.updated ? new Date(event.updated) : null },
        // A follow-up activity's slot is locked in the CRM: when both moved it, the CRM's slot is pushed back.
        { withAttendees: input.invitesSent, crmOnly: followUp && crmChangedWhen && !tooLong ? ['when'] : [] },
    );

    let note: string | null = null;
    let writeBack: FollowUpWriteBack | null = null;

    if (tooLong) {
        // D20: never clamp. The CRM keeps its times; a CRM change made meanwhile still goes out.
        removeGroup(merge.apply, 'when');
        removeGroup(merge.conflicts, 'when');
        merge.merged.when = crmNow.when;
        if (crmChangedWhen) {
            merge.base.crm.when = base.crm.when;
            if (!merge.crmPending.includes('when')) merge.crmPending.push('when');
        } else {
            merge.base.crm.when = crmNow.when;
            removeGroup(merge.crmPending, 'when');
        }
    } else if (followUp && merge.apply.includes('when')) {
        const when = providerNow.when;
        const startAt = when.allDay ? zonedStartOfDay(when.start, input.activity.timeZone) : new Date(when.start);
        if (when.allDay && !crmNow.when.allDay) {
            // Timed → all-day: follow-ups keep a time. The date moves, the time of day stays; the push re-times the event.
            const kept = keepTimeOnDay(input.activity, when.start);
            if (kept) {
                merge.merged.when = kept;
                if (!merge.crmPending.includes('when')) merge.crmPending.push('when');
                note = `${FOLLOW_UP_TIME_KEPT_PREFIX}: moved to ${slotLabel(new Date(kept.start), input.activity.timeZone)}.`;
                writeBack = { when: { allDay: true, startAt }, keptTime: true };
            }
        } else {
            writeBack = { when: { allDay: when.allDay, startAt }, keptTime: false };
        }
        // An unusable value (unreadable or zero days) leaves the record alone.
        if (writeBack && Number.isNaN(writeBack.when.startAt.getTime())) writeBack = null;
        if (writeBack && when.allDay && zonedDayOf(writeBack.when.startAt, input.activity.timeZone) !== when.start) writeBack = null;
    }

    const patch = systemPatchOf(merge);
    const applyAttendees = merge.apply.includes('attendees');

    // D15: a guest added in the calendar made the event external while it still shows our internal text.
    const external = Object.keys(peopleOf(providerNow.attendees)).some((email) => !isCompanyAddress(email, companyDomains));
    const ourDescriptionShowing = providerNow.description !== '' && providerNow.description === base.provider.description && base.crm.description !== '';
    const markDirty = merge.crmPending.length > 0 || (external && ourDescriptionShowing);

    return { merge, patch, applyAttendees, followUp: writeBack, markDirty, note };
}

const KIND_ORDER: Record<string, number> = { user: 0, contact: 1, email: 2 };

/** At most MAX_ATTENDEES (50) CRM rows: colleagues first, then contacts, then outside emails (§8.10). Stable. */
export function capAttendees(inputs: readonly AttendeeInput[], max: number = MAX_ATTENDEES): AttendeeInput[] {
    if (inputs.length <= max) return [...inputs];
    return inputs
        .map((input, index) => ({ input, index }))
        .sort((a, b) => (KIND_ORDER[a.input.kind] ?? 3) - (KIND_ORDER[b.input.kind] ?? 3) || a.index - b.index)
        .slice(0, max)
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.input);
}

/**
 * The follow-up time note a push keeps on the link (§11.5): the push re-times the calendar event right after the
 * inbound apply, and the note explaining why stays for a week after the calendar change (then pushes drop it).
 */
export function keptFollowUpNote(lastWarning: string | null | undefined, externalUpdatedAt: Date | null | undefined, now: Date): string | null {
    if (!lastWarning?.startsWith(FOLLOW_UP_TIME_KEPT_PREFIX) || !externalUpdatedAt) return null;
    return now.getTime() - externalUpdatedAt.getTime() <= FOLLOW_UP_NOTE_DAYS * 24 * 60 * 60_000 ? lastWarning : null;
}
