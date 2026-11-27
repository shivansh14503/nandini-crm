import type { TransactionClient } from '../../config/prisma.js';
import { HttpError } from '../../utils/httpError.js';
import type { CalendarSyncSettings } from '../integrations/calendarSyncSettings.js';
import { lockRecords } from '../shared/transactions.js';
import { toActivityDto } from './activity.mapper.js';
import type { ActivityRelatedModule } from './activity.schedule.js';
import {
    insertActivityRow,
    loadActivityConfig,
    mergeActivityPatch,
    scheduleOf,
    updateActivityRow,
    WITH_ATTENDEES,
    type ActivityCommitRow,
    type ActivityConfig,
    type ActivityRowData,
    type ActivityWriter,
} from './activity.service.js';
import { activityInputSchema, type AttendeeInput } from './activity.validator.js';

export { activityWriteHook, type ActivityWriteEvent } from './activity.writeHook.js';

/**
 * The system write path for activities (Calendar Phase 2, spec D32): writes the CRM makes on someone's behalf rather
 * than a user's form save. P2-4 creates and moves lead / opportunity follow-up activities through it, P2-5 applies
 * calendar changes, P2-8 imports customer meetings.
 *
 * Beyond the API's fields, a system write may set columns the API can't (`rowData`) and re-align `createdBy` on a
 * patch. Kept from a CRM save: the record lock, the schedule rules (`normalizeSchedule`), attendee checks and sync,
 * `remindAt`, completion stamps, the `revision` bump, the audit entry (`changedBy` = `actor`) and the write hook
 * (activity.writeHook.ts, where P2-3b marks the activity for calendar sync unless `markSync` is false).
 * Skipped: the owner's active-user check (the owner is taken verbatim: a lead still owned by a deactivated user keeps
 * saving), the past-start rule, admin-required custom fields (`checkModulePayload`), the related-record access check
 * (the record must still exist), the deleted organization / contact check (a system write copies the links of the
 * record it mirrors, which may point at a deleted one), the caller's edit permission and the activity's locks
 * (callers decide, §8.13).
 *
 * Both functions run inside the caller's transaction and read nothing through the shared client: the activity
 * configuration is passed in, loaded before the transaction (`loadFollowUpContext`). They return the row pair for
 * `runActivityPostCommit` (reminder, notifications), which the caller runs after its commit together with
 * `cacheService.invalidateEntityCaches('activities')`.
 */

/** What a follow-up reconcile (P2-4) needs, loaded once before its transaction (spec §11.2). */
export interface FollowUpContext {
    activityConfig: ActivityConfig;
    calendarSettings: CalendarSyncSettings;
}

/**
 * Loads the `FollowUpContext` from the cached form configuration. Call it before `runInTransaction` (once per save,
 * import run or backfill batch), never inside one (the `customFieldValidator.ts` rule).
 */
export async function loadFollowUpContext(): Promise<FollowUpContext> {
    const { loadCalendarSettings } = await import('../integrations/integration.settings.js');
    const [activityConfig, calendarSettings] = await Promise.all([loadActivityConfig(), loadCalendarSettings()]);
    return { activityConfig, calendarSettings };
}

/** An activity as a system writer gives it: the API's activity fields (activity.validator.ts rules apply). */
export interface SystemActivityFields {
    followupType: string;
    subject: string;
    /** Default Planned. */
    status?: string;
    /** Owner (username), taken verbatim. */
    assignedTo: string;
    /** Related record: its code and label are read from it (no access check). */
    relatedModule?: ActivityRelatedModule | null;
    relatedId?: string | null;
    organizationId?: string | null;
    organizationName?: string | null;
    contactId?: string | null;
    contact?: string | null;
    /** Timed: instants (`…Z`). */
    startAt?: string | null;
    endAt?: string | null;
    /** All-day: inclusive business-timezone days (`YYYY-MM-DD`). */
    allDay?: boolean;
    startDay?: string | null;
    endDay?: string | null;
    reminder?: string | null;
    location?: string | null;
    /** Video meeting (P3-1): meet | teams; null = none; missing = keep (patch) / none (insert). Requested by the push. */
    videoMeeting?: 'meet' | 'teams' | null;
    customerResponse?: string | null;
    remarks?: string | null;
    attendees?: AttendeeInput[];
    customFields?: Record<string, unknown>;
}

export interface SystemWriteOptions {
    /** Loaded before the transaction (`FollowUpContext.activityConfig`): the types' default durations. */
    activityConfig: ActivityConfig;
    /**
     * Insert: `createdBy` of the new row (P2-4: the record's creator); default `actor`. Patch: when given, re-aligns
     * the stored `createdBy` (spec §11.1, audited like any change); unset keeps it.
     */
    createdBy?: string;
    /**
     * Columns only the system path sets, written with the row (P2-4 `origin`, P2-8 the organizer columns), so the audit
     * entry and the write hook see the final row. Not API fields: a CRM save can't set them.
     */
    rowData?: ActivityRowData;
    /** False: the write hook is told not to mark the activity for calendar sync (inbound applies). Default true. */
    markSync?: boolean;
    /** Carried on the returned row for `runActivityPostCommit`: false = no owner / invitee notifications. */
    notify?: boolean;
    /**
     * True: a reminder (re)armed for an event whose moment already passed is stored as sent, so no late reminder fires
     * (P2-4 follow-up activities: the backfill, restores, a follow-up saved in the past). Default false.
     */
    quietPastReminder?: boolean;
}

const systemWriter = (actor: string, opts: SystemWriteOptions): ActivityWriter => ({
    actor,
    user: null,
    createdBy: opts.createdBy,
    rowData: opts.rowData,
    markSync: opts.markSync ?? true,
    quietPastReminder: opts.quietPastReminder ?? false,
    config: opts.activityConfig,
});

/** Inserts an activity through the system write path (see the module comment). */
export async function insertSystemActivity(
    tx: TransactionClient,
    fields: SystemActivityFields,
    actor: string,
    now: Date,
    opts: SystemWriteOptions,
): Promise<ActivityCommitRow> {
    const input = activityInputSchema.parse(fields);
    const schedule = scheduleOf(input, opts.activityConfig);
    const after = await insertActivityRow(tx, input, schedule, systemWriter(actor, opts), now);
    return { before: null, after, notify: opts.notify };
}

/**
 * Changes a live activity through the system write path: `patch` is merged over the stored activity as a CRM
 * `PUT` would merge it (`mergeActivityPatch`), so only the fields given change. Locks the activity first. 404 when
 * it doesn't exist or is deleted.
 */
export async function applySystemPatch(
    tx: TransactionClient,
    id: string,
    patch: Partial<SystemActivityFields>,
    actor: string,
    now: Date,
    opts: SystemWriteOptions,
): Promise<ActivityCommitRow> {
    await lockRecords(tx, 'activity', [id]);
    const existing = await tx.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES });
    if (!existing) throw HttpError.notFound('Activity not found');
    const input = activityInputSchema.parse(mergeActivityPatch(toActivityDto(existing), patch));
    const schedule = scheduleOf(input, opts.activityConfig);
    const after = await updateActivityRow(tx, existing, input, schedule, systemWriter(actor, opts), now);
    return { before: existing, after, notify: opts.notify };
}
