import type { ApiFieldError } from '../../utils/httpError.js';
import { addDays, daysBetween, zonedDayOf, zonedStartOfDay, zonedWallClockToInstant } from '../../utils/zonedTime.js';

/**
 * Pure scheduling rules of activities (docs/api-plan.md › Activities): the fixed option lists, how Start / End are
 * read and defaulted, the 31-day cap, the default duration of each Followup Type and when a reminder is due.
 * No database or env access, so it is shared by the validator, the service, the calendar feed and the tests.
 */

/** activity_status: fixed system options (FIXED_OPTION_CATEGORY_KEYS). Planned activities get reminders and can be overdue. */
export const ACTIVITY_STATUSES = ['Planned', 'Completed', 'Cancelled'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export const ACTIVITY_DEFAULT_STATUS: ActivityStatus = 'Planned';
export const PLANNED_STATUS: ActivityStatus = 'Planned';
export const COMPLETED_STATUS: ActivityStatus = 'Completed';

/**
 * activity_reminder: fixed system options; the stored value is the option's label. Minutes come from
 * ACTIVITY_REMINDER_MINUTES, which is safe because these options can't be renamed, deleted or added to.
 */
export const ACTIVITY_REMINDERS = [
    'At start time',
    '5 minutes before',
    '10 minutes before',
    '15 minutes before',
    '30 minutes before',
    '1 hour before',
    '2 hours before',
    '1 day before',
] as const;
export type ActivityReminder = (typeof ACTIVITY_REMINDERS)[number];

export const ACTIVITY_REMINDER_MINUTES: Readonly<Record<ActivityReminder, number>> = {
    'At start time': 0,
    '5 minutes before': 5,
    '10 minutes before': 10,
    '15 minutes before': 15,
    '30 minutes before': 30,
    '1 hour before': 60,
    '2 hours before': 120,
    '1 day before': 1440,
};

/** Modules an activity can be related to (CrmModuleKey values). */
export const ACTIVITY_RELATED_MODULES = ['leads', 'opportunities', 'contacts', 'organizations', 'quotations', 'tickets', 'contracts'] as const;
export type ActivityRelatedModule = (typeof ACTIVITY_RELATED_MODULES)[number];
/** What the "Related To" type picker calls each module (one record of it). */
export const ACTIVITY_RELATED_MODULE_LABELS: Readonly<Record<ActivityRelatedModule, string>> = {
    leads: 'Lead',
    opportunities: 'Opportunity',
    contacts: 'Contact',
    organizations: 'Organization',
    quotations: 'Quotation',
    tickets: 'Ticket',
    contracts: 'Contract',
};

/** Longest an activity may last. Range queries bound `startAt` from below by `from` minus this many days. */
export const ACTIVITY_MAX_DURATION_DAYS = 31;
/** Default length of a Followup Type without a `durationMinutes` meta (admin-added types, renamed options). */
export const ACTIVITY_FALLBACK_DURATION_MINUTES = 30;
/** Longest default duration an option's meta may set (a day). */
const MAX_META_DURATION_MINUTES = 1440;
/** All-day reminders count back from this business-timezone time on the first day. */
export const ALL_DAY_REMINDER_TIME = '09:00';

/** The two system Followup Types with code-level rules (shared_followup_type options offered on Activities only). */
export const TASK_TYPE = 'Task';
export const NOTE_TYPE = 'Note';

/**
 * Built-in fields the form hides for a Followup Type (so they are never required for it: the API's
 * `notApplicableKeys`, the form's `relaxedFields`). Only the system types hide fields; admin-added types show all.
 */
export const ACTIVITY_NOT_APPLICABLE: Readonly<Record<string, readonly string[]>> = {
    [NOTE_TYPE]: ['startAt', 'endAt', 'allDay', 'reminder', 'location', 'videoMeeting', 'attendees', 'customerResponse', 'status'],
    [TASK_TYPE]: ['endAt', 'location', 'videoMeeting', 'attendees', 'customerResponse'],
};

const NO_KEYS: ReadonlySet<string> = new Set();

/** `ACTIVITY_NOT_APPLICABLE[type]` as a set (empty for every other type). */
export function notApplicableFor(followupType: string | null | undefined): ReadonlySet<string> {
    const keys = ACTIVITY_NOT_APPLICABLE[followupType ?? ''];
    return keys ? new Set(keys) : NO_KEYS;
}

const MINUTE_MS = 60_000;
const MAX_DURATION_MS = ACTIVITY_MAX_DURATION_DAYS * 24 * 60 * MINUTE_MS;

export const START_REQUIRED_MESSAGE = 'Start is required.';
export const END_BEFORE_START_MESSAGE = 'End cannot be before Start.';
export const TOO_LONG_MESSAGE = `An activity can last at most ${ACTIVITY_MAX_DURATION_DAYS} days.`;

// ── Start / End ──────────────────────────────────────────────────────────────

/** What `normalizeSchedule` reads: the validated input of either mode (§ all-day input contract). */
export interface ScheduleInput {
    followupType: string;
    allDay: boolean;
    /** Timed mode: ISO instants (`…Z`). */
    startAt?: string;
    endAt?: string;
    /** All-day mode: inclusive `YYYY-MM-DD` days in the business timezone. */
    startDay?: string;
    endDay?: string;
}

export interface Schedule {
    startAt: Date | null;
    endAt: Date | null;
    /** False on Notes (they have no schedule). */
    allDay: boolean;
    /** Field issues on `startAt` / `endAt` (the Form Builder fields the form shows, in both modes). */
    issues: ApiFieldError[];
}

/**
 * Start / End as stored. Timed: `endAt` defaults to `startAt + typeDurationMinutes`. All-day: business-timezone
 * midnight of the first day → midnight after the last day (exclusive, as Google stores it); a missing `startDay`
 * falls back to the day of `startAt` (so `{ allDay: true }` on a timed activity keeps its day) and `endDay` to
 * `startDay`. Tasks end when they start; Notes have no schedule.
 */
export function normalizeSchedule(input: ScheduleInput, timeZone: string, typeDurationMinutes: number): Schedule {
    if (input.followupType === NOTE_TYPE) return { startAt: null, endAt: null, allDay: false, issues: [] };
    const isTask = input.followupType === TASK_TYPE;
    const issues: ApiFieldError[] = [];

    if (input.allDay) {
        const startDay = input.startDay ?? (input.startAt ? zonedDayOf(new Date(input.startAt), timeZone) : undefined);
        if (!startDay) return { startAt: null, endAt: null, allDay: true, issues: [{ path: ['startAt'], message: START_REQUIRED_MESSAGE }] };
        const endDay = isTask ? startDay : (input.endDay ?? startDay);
        const span = daysBetween(startDay, endDay);
        if (span < 0) issues.push({ path: ['endAt'], message: END_BEFORE_START_MESSAGE });
        else if (span > ACTIVITY_MAX_DURATION_DAYS - 1) issues.push({ path: ['endAt'], message: TOO_LONG_MESSAGE });
        return {
            startAt: zonedStartOfDay(startDay, timeZone),
            endAt: zonedStartOfDay(addDays(span < 0 ? startDay : endDay, 1), timeZone),
            allDay: true,
            issues,
        };
    }

    if (!input.startAt) return { startAt: null, endAt: null, allDay: false, issues: [{ path: ['startAt'], message: START_REQUIRED_MESSAGE }] };
    const startAt = new Date(input.startAt);
    let endAt: Date;
    if (isTask) endAt = startAt;
    else if (input.endAt) endAt = new Date(input.endAt);
    else endAt = new Date(startAt.getTime() + typeDurationMinutes * MINUTE_MS);

    const length = endAt.getTime() - startAt.getTime();
    if (length < 0) issues.push({ path: ['endAt'], message: END_BEFORE_START_MESSAGE });
    else if (length > MAX_DURATION_MS) issues.push({ path: ['endAt'], message: TOO_LONG_MESSAGE });
    return { startAt, endAt, allDay: false, issues };
}

// ── Default duration ─────────────────────────────────────────────────────────

/** The Followup Type dropdown as the form configuration holds it (only what the duration needs). */
export interface FollowupTypeCategory {
    options: readonly { value: string; meta?: Record<string, unknown> | null }[];
}

/**
 * Minutes an activity of `followupType` lasts when no End is given: 0 for Task; otherwise the option's
 * `meta.durationMinutes` (an integer 0–1440, kept on the option so it survives a rename); otherwise 30.
 */
export function activityDurationMinutes(followupType: string, category: FollowupTypeCategory | null | undefined): number {
    if (followupType === TASK_TYPE) return 0;
    const meta = category?.options.find((option) => option.value === followupType)?.meta;
    const minutes = meta?.durationMinutes;
    if (typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_META_DURATION_MINUTES) return minutes;
    return ACTIVITY_FALLBACK_DURATION_MINUTES;
}

// ── Reminders ────────────────────────────────────────────────────────────────

export const isActivityReminder = (value: unknown): value is ActivityReminder =>
    typeof value === 'string' && (ACTIVITY_REMINDERS as readonly string[]).includes(value);

export interface ReminderInput {
    followupType: string;
    status: string;
    reminder: string | null | undefined;
    startAt: Date | null;
    allDay: boolean;
    isDeleted?: boolean;
}

/**
 * When the reminder is due (UTC), or null when none applies: a Note, not Planned, no reminder, no start, deleted.
 * Timed: `startAt` minus the reminder. All-day: 09:00 business time on the first day minus the reminder ("At start
 * time" = 09:00 that day, "1 day before" = 09:00 the day before).
 */
export function computeRemindAt(input: ReminderInput, timeZone: string): Date | null {
    if (input.followupType === NOTE_TYPE || input.status !== PLANNED_STATUS || input.isDeleted) return null;
    if (!input.startAt || !isActivityReminder(input.reminder)) return null;
    const minutes = ACTIVITY_REMINDER_MINUTES[input.reminder];
    const anchor = input.allDay ? zonedWallClockToInstant(`${zonedDayOf(input.startAt, timeZone)}T${ALL_DAY_REMINDER_TIME}`, timeZone) : input.startAt;
    return new Date(anchor.getTime() - minutes * MINUTE_MS);
}

const sameInstant = (a: Date | null | undefined, b: Date | null | undefined) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * `reminderSentAt` of a reminder a system write (re)armed with `quietPastReminder` (P2-4 follow-up activities): when
 * the event's own moment has already passed (a timed start, or 09:00 business time of an all-day day) the reminder is
 * stored as sent at `now`, so the backfill, a restore or a follow-up saved in the past never sends a burst of late
 * reminders (the activity just shows as overdue). A reminder whose event is still ahead is left to fire as usual.
 */
export function quietPastReminderSentAt(input: ReminderInput, remindAt: Date | null, now: Date, timeZone: string): Date | null {
    if (!remindAt) return null;
    const moment = computeRemindAt({ ...input, reminder: 'At start time' }, timeZone);
    return moment && moment.getTime() <= now.getTime() ? now : null;
}

/** `reminderSentAt` after a write: a reschedule (another `remindAt`) re-arms the reminder. */
export function nextReminderSentAt(before: { remindAt: Date | null; reminderSentAt: Date | null }, remindAt: Date | null): Date | null {
    return sameInstant(before.remindAt, remindAt) ? before.reminderSentAt : null;
}
