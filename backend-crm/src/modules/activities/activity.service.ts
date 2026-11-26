import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import {
    asPayload,
    buildModuleFieldConfig,
    checkModulePayload,
    throwFieldIssues,
    type ModuleFieldConfig,
} from '../form-configs/customFieldValidator.js';
import { calendarViewOf, loadOwnerCalendarLinks, NO_CALENDAR_LINKS, type CalendarLinksByActivity } from '../calendar-sync/sync.view.js';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '../form-configs/formConfig.defaults.js';
import type { DropdownCategoryDto } from '../form-configs/formConfig.service.js';
import { notifyActivityParticipants, scheduleActivityReminder } from '../notifications/notification.reminders.js';
import { assertAssigneeValid } from '../shared/accessControl.js';
import { assertDeletedRow, lockRecords, restoreData, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { activityLocks, activityScopeWhere, canEditActivity, canViewActivity, lockedFieldsFor, myResponseOf, type ActivityAccessRow } from './activity.access.js';
import { normalizeAttendees, planAttendeeSync, syncAttendees, type StoredAttendee } from './activity.attendees.js';
import { activityRangeWhere, calendarFeed, type CalendarFeed } from './activity.calendar.js';
import { linkTargets, resolveActivityLinks, type LinkTarget, type PreviousLinks } from './activity.links.js';
import { toActivityData, toActivityDto, type ActivityDto, type ActivityRow, type ActivityView } from './activity.mapper.js';
import {
    ACTIVITY_FALLBACK_DURATION_MINUTES,
    ACTIVITY_MAX_DURATION_DAYS,
    ACTIVITY_RELATED_MODULE_LABELS,
    ACTIVITY_RELATED_MODULES,
    ACTIVITY_REMINDER_MINUTES,
    ACTIVITY_REMINDERS,
    ACTIVITY_STATUSES,
    activityDurationMinutes,
    COMPLETED_STATUS,
    computeRemindAt,
    nextReminderSentAt,
    quietPastReminderSentAt,
    normalizeSchedule,
    NOTE_TYPE,
    notApplicableFor,
    PLANNED_STATUS,
    type Schedule,
} from './activity.schedule.js';
import {
    ACTIVITY_SORT_FIELDS,
    activityInputSchema,
    activityListQuerySchema,
    activityPastIssues,
    calendarQuerySchema,
    linkTargetsQuerySchema,
    respondSchema,
    type ActivityInput,
} from './activity.validator.js';
import { activityWriteHook } from './activity.writeHook.js';
import { loadSeriesViews, NO_SERIES, type SeriesById } from './activity.seriesView.js';

export const EDIT_FORBIDDEN_MESSAGE = "Only the activity's owner can change it. Invitees can reply to the invitation.";
export const RSVP_FORBIDDEN_MESSAGE = 'Only invited colleagues can reply to this activity.';
const VIEW_FORBIDDEN_MESSAGE = 'You do not have permission to access or modify this record.';

export const WITH_ATTENDEES = { attendees: { orderBy: { sortOrder: 'asc' } } } as const satisfies Prisma.ActivityInclude;

const notFound = () => HttpError.notFound('Activity not found');

function assertCanView(user: AuthUser, row: ActivityAccessRow): void {
    if (!canViewActivity(user, row)) throw HttpError.forbidden(VIEW_FORBIDDEN_MESSAGE);
}

/** 403 for anyone but the owner, the creator or a global role (an invitee may only reply). */
export function assertCanEdit(user: AuthUser, row: ActivityAccessRow): void {
    assertCanView(user, row);
    if (!canEditActivity(user, row)) throw HttpError.forbidden(EDIT_FORBIDDEN_MESSAGE);
}

/**
 * The DTO plus what the caller may do with it (`viewer`, `lockedFields` and `calendar` sit outside the audited record).
 * `links`: the owners' calendar links (calendar-sync/sync.view.ts); without them `calendar` is null.
 */
export function toActivityView(row: ActivityRow, user: AuthUser, links: CalendarLinksByActivity = NO_CALENDAR_LINKS, series: SeriesById = NO_SERIES): ActivityView {
    const canEdit = canEditActivity(user, row);
    return {
        ...toActivityDto(row),
        viewer: { canEdit, myResponse: myResponseOf(user, row) },
        lockedFields: lockedFieldsFor(row),
        calendar: calendarViewOf(row, links.get(row.id), user.username, canEdit),
        series: row.seriesId ? (series.get(row.id) ?? null) : null,
    };
}

/**
 * Views of committed rows with their calendar state (one link read per call, a second only when links exist) and
 * their series (Calendar Phase 4: one ActivitySeries read, only when a row belongs to one).
 */
export async function toActivityViews(rows: readonly ActivityRow[], user: AuthUser): Promise<ActivityView[]> {
    const [links, series] = await Promise.all([loadOwnerCalendarLinks(rows), loadSeriesViews(rows)]);
    return rows.map((row) => toActivityView(row, user, links, series));
}

export const toOneView = async (row: ActivityRow, user: AuthUser): Promise<ActivityView> => (await toActivityViews([row], user))[0];

// ── Configuration ────────────────────────────────────────────────────────────

export interface ActivityConfig {
    fields: ModuleFieldConfig;
    /** The Followup Type dropdown the activities form uses (its options' meta holds the default durations). */
    followupTypes: DropdownCategoryDto | null;
}

/**
 * The module's field configuration and its Followup Type list, from the cached form configuration. Load it before
 * opening a transaction (see `loadModuleFieldConfig`).
 */
export async function loadActivityConfig(): Promise<ActivityConfig> {
    const { formConfigService } = await import('../form-configs/formConfig.service.js');
    const configs = await formConfigService.getAllConfigs(true);
    const fields = buildModuleFieldConfig(configs, 'activities');
    const categoryId = fields.fields.find((field) => field.isSystem && field.fieldKey === 'followupType')?.dropdownCategoryId;
    const followupTypes = configs.categories.find((category) => (categoryId ? category.id === categoryId : category.key === FOLLOWUP_TYPE_CATEGORY_KEY)) ?? null;
    return { fields, followupTypes };
}

/**
 * The record as the form-configuration check reads it: Start / End as the user gave them (the days in all-day
 * mode), so an admin-required End needs a value even though the API could default it.
 */
function configPayload(record: Record<string, unknown>, input: ActivityInput): Record<string, unknown> {
    return {
        ...record,
        followupType: input.followupType,
        status: input.status,
        allDay: input.allDay,
        startAt: input.allDay ? input.startDay : input.startAt,
        endAt: input.allDay ? input.endDay : input.endAt,
        // A picked record may arrive with its id only.
        relatedTo: input.relatedId ? input.relatedTo || input.relatedId : input.relatedTo,
        attendees: input.attendees,
    };
}

/** Start / End as stored, or 400 with the schedule issues. */
export function scheduleOf(input: ActivityInput, config: ActivityConfig): Schedule {
    const schedule = normalizeSchedule(input, ENV.BUSINESS_TIMEZONE, activityDurationMinutes(input.followupType, config.followupTypes));
    throwFieldIssues(schedule.issues);
    return schedule;
}

/** Columns derived from the status: completion stamps. */
function completionData(status: string, before: { status: string; completedAt: Date | null; completedBy: string | null } | undefined, actor: string, now: Date) {
    if (status !== COMPLETED_STATUS) return { completedAt: null, completedBy: null };
    if (before?.status === COMPLETED_STATUS) return { completedAt: before.completedAt, completedBy: before.completedBy };
    return { completedAt: now, completedBy: actor };
}

const reminderInputOf = (input: ActivityInput, schedule: Schedule, isDeleted = false) => ({
    followupType: input.followupType,
    status: input.status,
    reminder: input.reminder,
    startAt: schedule.startAt,
    allDay: schedule.allDay,
    isDeleted,
});

const remindAtOf = (input: ActivityInput, schedule: Schedule, isDeleted = false) => computeRemindAt(reminderInputOf(input, schedule, isDeleted), ENV.BUSINESS_TIMEZONE);

/** `reminderSentAt` of a newly (re)armed reminder: null, or `now` for a quiet system write whose event already passed. */
const armedReminderSentAt = (writer: ActivityWriter, input: ActivityInput, schedule: Schedule, remindAt: Date | null, now: Date): Date | null =>
    writer.user === null && writer.quietPastReminder ? quietPastReminderSentAt(reminderInputOf(input, schedule), remindAt, now, ENV.BUSINESS_TIMEZONE) : null;

/** Fields whose change makes the activity a new version for calendars (iCal SEQUENCE in Phase 2). */
const REVISION_FIELDS = ['subject', 'followupType', 'startAt', 'endAt', 'allDay', 'location', 'assignedTo', 'status'] as const;
/** Fields whose change by a system write makes a series occurrence an exception (status is per occurrence). */
const SERIES_OCCURRENCE_FIELDS = ['subject', 'followupType', 'startAt', 'endAt', 'allDay', 'location', 'assignedTo'] as const;
const sameColumn = (a: unknown, b: unknown) =>
    a instanceof Date || b instanceof Date ? ((a as Date | null)?.getTime() ?? null) === ((b as Date | null)?.getTime() ?? null) : (a ?? null) === (b ?? null);

const nameKey = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** True when the patch sends `key` with another name than the stored one (case and outer spaces ignored). */
const renamesLink = (patch: Record<string, unknown>, before: ActivityDto, key: 'organizationName' | 'contact' | 'relatedTo') =>
    key in patch && nameKey(patch[key]) !== nameKey(before[key]);

/**
 * The stored record merged with a patch, ready to parse. Retyping a name without picking a record drops the old
 * link; picking another related record lets it fill the organization and contact unless the patch sends them
 * (clearing the related record keeps them, as there is nothing to fill them from); and leaving all-day drops the
 * days (switching to it without days keeps the day of the timed start).
 */
export function mergeActivityPatch(before: ActivityDto, patch: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...before, ...patch };
    if (renamesLink(patch, before, 'organizationName') && !('organizationId' in patch)) delete merged.organizationId;
    if (renamesLink(patch, before, 'contact') && !('contactId' in patch)) delete merged.contactId;
    if (renamesLink(patch, before, 'relatedTo') && !('relatedId' in patch)) {
        delete merged.relatedId;
        if (!('relatedModule' in patch)) delete merged.relatedModule;
    }
    const pickedAnother =
        ('relatedId' in patch || 'relatedModule' in patch) &&
        nameKey(merged.relatedId) !== '' &&
        (nameKey(merged.relatedId) !== nameKey(before.relatedId) || nameKey(merged.relatedModule) !== nameKey(before.relatedModule));
    if (pickedAnother) {
        if (!('organizationId' in patch)) {
            delete merged.organizationId;
            if (!('organizationName' in patch)) delete merged.organizationName;
        }
        if (!('contactId' in patch)) {
            delete merged.contactId;
            if (!('contact' in patch)) delete merged.contact;
        }
    }
    if (patch.allDay === false) {
        delete merged.startDay;
        delete merged.endDay;
    } else if (patch.allDay === true && !before.allDay && !('startDay' in patch)) {
        // Timed → all-day: the days come from the timed Start (normalizeSchedule falls back to it).
        delete merged.startDay;
        delete merged.endDay;
    }
    return merged;
}

/** Keys the patch submits, as the form-configuration check names them (`startDay` is the Start field). */
function submittedKeys(patch: Record<string, unknown>): Set<string> {
    const keys = new Set(Object.keys(patch));
    if (keys.has('startDay')) keys.add('startAt');
    if (keys.has('endDay')) keys.add('endAt');
    if (keys.has('relatedId') || keys.has('relatedModule')) keys.add('relatedTo');
    return keys;
}

/** Start / End sent as instants (`…Z`): compared by time, so `10:00:00Z` and `10:00:00.000Z` are the same. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;
const isBlank = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
/** Link names the server keys by name (case and outer spaces ignored, as `mergeActivityPatch` does). */
const NAME_KEYS = new Set(['relatedTo', 'organizationName', 'contact']);

function sameSentValue(key: string, sent: unknown, stored: unknown): boolean {
    if (isBlank(sent) || isBlank(stored)) return isBlank(sent) && isBlank(stored);
    if (typeof sent === 'string' && typeof stored === 'string') {
        if (NAME_KEYS.has(key)) return nameKey(sent) === nameKey(stored);
        if (ISO_INSTANT.test(sent) && ISO_INSTANT.test(stored)) return Date.parse(sent) === Date.parse(stored);
        return sent.trim() === stored.trim();
    }
    return JSON.stringify(sent) === JSON.stringify(stored);
}

/**
 * ActivityDto keys a CRM `PUT` asks to change: those it sends with another value than the stored one (sending the
 * stored value back, as the form does, asks for nothing). Days count as Start / End, and another related id or module
 * as another related record. What the server derives on its own is not asked for: the related record's label it
 * re-reads on every save (activity.links.ts), which goes stale when a lead or opportunity is renamed. The lock check
 * (`assertUnlockedChanges`) refuses a locked field only when it is both asked for and actually changed.
 */
export function requestedChanges(before: ActivityDto, patch: Record<string, unknown>): Set<string> {
    const keys = new Set<string>();
    for (const [key, value] of Object.entries(patch)) {
        if (key in before && !sameSentValue(key, value, before[key as keyof ActivityDto])) keys.add(key);
    }
    if (keys.has('startDay')) keys.add('startAt');
    if (keys.has('endDay')) keys.add('endAt');
    if (keys.has('relatedId') || keys.has('relatedModule')) {
        keys.add('relatedTo');
        keys.add('relatedCode');
    }
    return keys;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** One committed activity write, for `runActivityPostCommit`. */
export interface ActivityCommitRow {
    /** The row before the write; null on insert. */
    before: ActivityRow | null;
    after: ActivityRow;
    /** Overrides `PostCommitOptions.notify` for this row (the system write path sets it). */
    notify?: boolean;
}

export interface PostCommitOptions {
    /** False: no owner / invitee notifications (imports, backfills). Default true. */
    notify?: boolean;
    /** True skips the calendar push wake-up (inbound applies: they didn't mark the link dirty). */
    skipPush?: boolean;
}

/**
 * After committed writes (never inside their transaction), per row: arms the reminder's delayed job and tells a new
 * owner / newly invited colleagues (notification.reminders.ts), unless `notify` is false; then wakes the calendar push
 * for the links the write's outbox left dirty and sends "invitations held" notices (calendar-sync/sync.wake.ts), unless
 * `skipPush`. Failures are logged, never thrown: the save has happened, and the reminder sweep and the outbox sweep
 * re-deliver anything missed. For a deleted row no reminder is armed and nobody is told (its calendar event is
 * cancelled by the push). `actor` may be a bare username (system writes); the notification text reads only its username.
 */
export async function runActivityPostCommit(rows: readonly ActivityCommitRow[], actor: AuthUser | string, opts: PostCommitOptions = {}): Promise<void> {
    const user: AuthUser = typeof actor === 'string' ? { id: 0, username: actor, role: '' } : actor;
    for (const { before, after, notify } of rows) {
        try {
            await scheduleActivityReminder(after);
        } catch (err) {
            logger.warn({ err: (err as Error).message, activityId: after.id }, 'Could not schedule the activity reminder; the reminder sweep covers it');
        }
        if ((notify ?? opts.notify) === false) continue;
        try {
            await notifyActivityParticipants(before, after, user);
        } catch (err) {
            logger.warn({ err: (err as Error).message, activityId: after.id }, 'Could not notify the activity owner / invitees');
        }
    }
    if (opts.skipPush) return;
    try {
        // Dynamic: the push engine imports this module (no import cycle at load time).
        const { runCalendarPostCommit } = await import('../calendar-sync/sync.wake.js');
        await runCalendarPostCommit(rows);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Could not wake the calendar push; the outbox sweep covers it');
    }
}

/** Activity columns filled from the API's fields (`toActivityData`). */
type ActivityApiColumn =
    | 'followupType'
    | 'subject'
    | 'status'
    | 'assignedTo'
    | 'relatedModule'
    | 'relatedId'
    | 'relatedTo'
    | 'relatedCode'
    | 'organizationName'
    | 'organizationId'
    | 'contact'
    | 'contactId'
    | 'startAt'
    | 'endAt'
    | 'allDay'
    | 'location'
    | 'reminder'
    | 'customerResponse'
    | 'remarks'
    | 'customDataJson';

/** Columns the write path sets itself. */
type ActivityManagedColumn =
    | 'id'
    | 'attendees'
    | 'timeZone'
    | 'remindAt'
    | 'reminderSentAt'
    | 'completedAt'
    | 'completedBy'
    | 'revision'
    | 'createdBy'
    | 'updatedBy'
    | 'createdAt'
    | 'updatedAt'
    | 'isDeleted'
    | 'deletedAt'
    | 'externalLinks';

/**
 * Columns only the system write path sets, written with the row so the audit entry and the write hook see them:
 * every Activity column except the API's fields (those come through the parsed input) and the ones the write path
 * computes. P2-4: `origin` (`'followup'` on a lead / opportunity follow-up activity). P2-3b's sync columns (`iCalUid`,
 * `syncKey`, `organizerEmail`, `organizerName`, `externalOrganizer`, `externalUpdatedAt`) are allowed here for P2-8's
 * imports; the push engine writes `iCalUid` / `syncKey` itself with an `updatedAt`-preserving `updateMany` (spec §4.4).
 * Links (`externalLinks`) are the calendar engine's own rows.
 */
export type ActivityRowData = Partial<Omit<Prisma.ActivityUncheckedCreateInput, ActivityApiColumn | ActivityManagedColumn>>;

/**
 * Who makes a write. CRM saves (`activityService`) pass the signed-in `user`: the owner must be an active user and a
 * newly picked related record one they may access. System writes (activity.system.ts) pass `user: null`: the owner
 * is taken verbatim and the related record's access isn't checked (it must still exist).
 */
export interface ActivityWriter {
    /** Username doing the write: audit `changedBy`, `updatedBy`, completion stamps, attendee replies, the write hook. */
    actor: string;
    user: AuthUser | null;
    /**
     * `createdBy` of an insert (default `actor`). System writers only: also re-aligns it on an update (P2-4: a
     * follow-up activity's creator follows its record's, spec §11.1). CRM updates never change it.
     */
    createdBy?: string;
    /** System writers only: extra columns written with the row (`ActivityRowData`). */
    rowData?: ActivityRowData;
    /**
     * CRM updates: the ActivityDto keys the request asked to change (`requestedChanges`); the lock check refuses only
     * those. Unset: every changed field counts.
     */
    requested?: ReadonlySet<string>;
    /** Passed to the write hook (P2-3b: whether to mark the activity for calendar sync). Default true. */
    markSync?: boolean;
    /**
     * System writers only: a reminder (re)armed for an event whose moment already passed is stored as sent
     * (`quietPastReminderSentAt`), so no late reminder fires. P2-4 follow-up activities set it.
     */
    quietPastReminder?: boolean;
    /** Activity configuration loaded before the transaction, passed to the write hook; null when not loaded. */
    config?: ActivityConfig | null;
    /**
     * Series columns written with the row (Calendar Phase 4, activity.series.ts): any writer. Unset leaves them as they
     * are (an update) or null (an insert).
     */
    series?: ActivitySeriesColumns;
    /**
     * The CREATE audit entry's `changes` instead of the full snapshot (Calendar Phase 4: occurrences a series creates
     * write `{ subject, seriesId, originalStartAt }`; the series' own entry carries the rest).
     */
    auditCreateChanges?: Record<string, unknown>;
    /**
     * A system insert that copies links and attendees already accepted elsewhere (Calendar Phase 4: a series occurrence
     * copies its series' template): the related record, organization / contact and attendees listed here count as
     * unchanged, so one deleted or deactivated since is kept, as an existing activity keeps it.
     */
    keep?: { links: PreviousLinks; attendees: readonly Pick<StoredAttendee, 'kind' | 'username' | 'contactId'>[] };
}

/** Activity columns of a series occurrence (Calendar Phase 4). */
export type ActivitySeriesColumns = Partial<Pick<Prisma.ActivityUncheckedCreateInput, 'seriesId' | 'originalStartAt' | 'seriesIndex' | 'seriesException'>>;

export const crmWriter = (user: AuthUser, config: ActivityConfig | null = null, requested?: ReadonlySet<string>): ActivityWriter => ({
    actor: user.username,
    user,
    config,
    requested,
});

/** Runs the write hook (activity.writeHook.ts) for one written row, inside the caller's transaction. */
function afterActivityWrite(tx: TransactionClient, before: ActivityRow | null, after: ActivityRow, writer: ActivityWriter, now: Date): Promise<void> {
    return activityWriteHook.onWrite(tx, { before, after, actor: writer.actor, now, markSync: writer.markSync ?? true, config: writer.config ?? null });
}

/**
 * 409 when a CRM update changed a locked field it asked to change (activity.access.ts `activityLocks`, spec §8.13).
 * A locked field the server changed on its own (a refreshed related-record label) or one sent with its stored value
 * passes.
 */
function assertUnlockedChanges(existing: ActivityRow, changes: Record<string, unknown>, requested: ReadonlySet<string> | undefined): void {
    const lock = activityLocks.lockFor(existing);
    const blocked = lock ? lock.fields.filter((field) => field in changes && (!requested || requested.has(field))) : [];
    if (!lock || blocked.length === 0) return;
    throw new HttpError(lock.message, StatusCodes.CONFLICT, { code: lock.code, errors: blocked.map((field) => ({ message: lock.message, path: [field] })) });
}

/** 409 when the activity may not be deleted (`ActivityLock.deleteRefusedReason`). */
export function assertDeletable(existing: ActivityRow): void {
    const lock = activityLocks.lockFor(existing);
    if (lock?.deleteRefusedReason) throw new HttpError(lock.message, StatusCodes.CONFLICT, { code: lock.code });
}

/**
 * Inserts an activity inside the caller's transaction and returns the stored row (attendees included); cache
 * invalidation and `runActivityPostCommit` are the caller's job. Activities are unnumbered (no document series).
 */
export async function insertActivityRow(tx: TransactionClient, input: ActivityInput, schedule: Schedule, writer: ActivityWriter, now: Date): Promise<ActivityRow> {
    const assignedTo = writer.user ? ((await assertAssigneeValid(tx, input.assignedTo)) ?? writer.user.username) : input.assignedTo;
    const keep = writer.user ? undefined : writer.keep;
    const links = await resolveActivityLinks(tx, input, keep?.links, writer.user);
    const attendees = await normalizeAttendees(tx, input.attendees, assignedTo, (keep?.attendees ?? []) as readonly StoredAttendee[]);
    const plan = planAttendeeSync(attendees, [], writer.actor, now);
    const withOwner = { ...input, assignedTo };
    const remindAt = remindAtOf(withOwner, schedule);
    const row = await tx.activity.create({
        data: {
            ...toActivityData(withOwner, links, schedule),
            ...(writer.user ? {} : writer.rowData),
            ...writer.series,
            timeZone: ENV.BUSINESS_TIMEZONE,
            remindAt,
            reminderSentAt: armedReminderSentAt(writer, withOwner, schedule, remindAt, now),
            ...completionData(input.status, undefined, writer.actor, now),
            createdBy: writer.createdBy ?? writer.actor,
            attendees: { create: plan.create },
        },
        include: WITH_ATTENDEES,
    });
    const changes = writer.auditCreateChanges ?? toActivityDto(row);
    await auditService.record(tx, { entityType: 'Activity', entityId: row.id, action: 'CREATE', changedBy: writer.actor, changes });
    await afterActivityWrite(tx, null, row, writer, now);
    return row;
}

/**
 * Applies a parsed and checked update to a locked, live row inside the caller's transaction: links, owner,
 * attendees, completion stamps, reminder, `revision` bump, audit and the write hook. CRM writers are also held to
 * the activity's locks (409, for the fields in `writer.requested`); system writers are not, and may also set
 * `rowData` and re-align `createdBy`. Returns the stored row (attendees included).
 */
export async function updateActivityRow(tx: TransactionClient, existing: ActivityRow, input: ActivityInput, schedule: Schedule, writer: ActivityWriter, now: Date): Promise<ActivityRow> {
    const id = existing.id;
    const before = toActivityDto(existing);
    const links = await resolveActivityLinks(tx, input, existing, writer.user);
    const assignedTo = writer.user ? ((await assertAssigneeValid(tx, input.assignedTo, { previous: existing.assignedTo })) ?? existing.assignedTo) : input.assignedTo;
    const withOwner = { ...input, assignedTo };
    const attendees = await normalizeAttendees(tx, input.attendees, assignedTo, existing.attendees);
    const plan = await syncAttendees(tx, id, attendees, existing.attendees, writer.actor, now);

    const remindAt = remindAtOf(withOwner, schedule);
    const rearmed = (existing.remindAt?.getTime() ?? null) !== (remindAt?.getTime() ?? null);
    const system = writer.user === null;
    const data = {
        ...toActivityData(withOwner, links, schedule),
        ...(system ? writer.rowData : {}),
        ...writer.series,
        ...completionData(input.status, existing, writer.actor, now),
        remindAt,
        // An unchanged remindAt keeps its sent stamp (nextReminderSentAt); a reschedule re-arms it.
        reminderSentAt: rearmed ? armedReminderSentAt(writer, withOwner, schedule, remindAt, now) : nextReminderSentAt(existing, remindAt),
        ...(system && writer.createdBy ? { createdBy: writer.createdBy } : {}),
        updatedBy: writer.actor,
    };
    // Calendar Phase 4: a system write (a calendar pull or merge) that moves or changes one occurrence of a series on its
    // own makes it an exception, so a later "All events" edit leaves it alone (series paths pass `writer.series`).
    const changedAlone =
        system &&
        !writer.series &&
        Boolean(existing.seriesId) &&
        !existing.seriesException &&
        (plan.setChanged || SERIES_OCCURRENCE_FIELDS.some((key) => !sameColumn(existing[key], data[key])));
    const scheduleChanged =
        plan.setChanged ||
        REVISION_FIELDS.some((key) => {
            const a = existing[key];
            const b = data[key];
            return a instanceof Date || b instanceof Date ? (a as Date | null)?.getTime() !== (b as Date | null)?.getTime() : (a ?? null) !== (b ?? null);
        });
    const row = await tx.activity.update({
        where: { id },
        data: { ...data, ...(changedAlone ? { seriesException: true } : {}), ...(scheduleChanged ? { revision: { increment: 1 } } : {}) },
        include: WITH_ATTENDEES,
    });
    const changes = diffRecords(before, toActivityDto(row));
    // The transaction rolls the write back.
    if (writer.user) assertUnlockedChanges(existing, changes, writer.requested);
    if (Object.keys(changes).length > 0) {
        await auditService.record(tx, { entityType: 'Activity', entityId: id, action: 'UPDATE', changedBy: writer.actor, changes });
    }
    await afterActivityWrite(tx, existing, row, writer, now);
    return row;
}

/**
 * Soft-deletes a locked, live row inside the caller's transaction (access and locks are the caller's checks): the
 * reminder is cleared, a DELETE entry is audited and the write hook runs (the calendar push cancels its event).
 */
export async function softDeleteActivityRow(
    tx: TransactionClient,
    existing: ActivityRow,
    user: AuthUser,
    now = new Date(),
    series?: ActivitySeriesColumns,
): Promise<ActivityCommitRow> {
    // A deleted activity leaves the reminder set. `series`: Calendar Phase 4 detaches an occurrence a series rewrite
    // removed (activity.series.ts), so its slot can come back.
    const after = await tx.activity.update({ where: { id: existing.id }, data: { ...softDeleteData(user), remindAt: null, ...series }, include: WITH_ATTENDEES });
    await auditService.record(tx, { entityType: 'Activity', entityId: existing.id, action: 'DELETE', changedBy: user.username });
    await afterActivityWrite(tx, existing, after, crmWriter(user), now);
    return { before: existing, after };
}

/**
 * Inserts an activity inside the caller's transaction; cache invalidation and notifications are the caller's job.
 * Activities are unnumbered (no document series).
 */
export async function createActivityRecord(tx: TransactionClient, input: ActivityInput, schedule: Schedule, user: AuthUser, now = new Date()): Promise<ActivityView> {
    return toActivityView(await insertActivityRow(tx, input, schedule, crmWriter(user), now), user);
}

function listWhere(filters: ReturnType<typeof activityListQuerySchema.parse>, search: string | undefined, user: AuthUser, now: Date): Prisma.ActivityWhereInput {
    const and: Prisma.ActivityWhereInput[] = [{ isDeleted: false }, activityScopeWhere(user)];
    if (filters.followupType?.length) and.push({ followupType: { in: filters.followupType } });
    if (filters.status?.length) and.push({ status: { in: filters.status } });
    if (filters.excludeStatus?.length) and.push({ status: { notIn: filters.excludeStatus } });
    if (filters.assignedTo) and.push({ assignedTo: filters.assignedTo });
    if (filters.mine) and.push({ assignedTo: user.username });
    if (filters.attending) and.push({ attendees: { some: { username: user.username } } });
    if (filters.relatedModule) and.push({ relatedModule: filters.relatedModule });
    if (filters.relatedId) and.push({ relatedId: filters.relatedId });
    if (filters.organizationId) {
        and.push(
            filters.rollup
                ? { OR: [{ organizationId: filters.organizationId }, { relatedModule: 'organizations', relatedId: filters.organizationId }] }
                : { organizationId: filters.organizationId },
        );
    }
    if (filters.contactId) {
        and.push(
            filters.rollup
                ? {
                      OR: [
                          { contactId: filters.contactId },
                          { relatedModule: 'contacts', relatedId: filters.contactId },
                          { attendees: { some: { contactId: filters.contactId } } },
                      ],
                  }
                : { contactId: filters.contactId },
        );
    }
    if (filters.from && filters.to) {
        const from = new Date(filters.from);
        const to = new Date(filters.to);
        // Both arms are bounded: activities by `startAt`, notes (no schedule) by when they were written.
        and.push({ OR: [activityRangeWhere(from, to), { followupType: NOTE_TYPE, createdAt: { gte: from, lt: to } }] });
    }
    if (filters.overdue) and.push({ status: PLANNED_STATUS, endAt: { lt: now } });
    if (filters.createdWithinDays) and.push({ createdAt: { gte: daysAgo(filters.createdWithinDays) } });
    if (search) {
        and.push({
            OR: [
                { subject: { contains: search } },
                { relatedTo: { contains: search } },
                { relatedCode: { contains: search } },
                { organizationName: { contains: search } },
                { contact: { contains: search } },
                { location: { contains: search } },
            ],
        });
    }
    return { AND: and };
}

export interface ActivityMeta {
    timeZone: string;
    now: string;
    relatedModules: { key: string; label: string }[];
    /** Default length (minutes) of each Followup Type when no End is given. */
    durationMinutes: Record<string, number>;
    fallbackDurationMinutes: number;
    reminders: { value: string; minutes: number }[];
    statuses: string[];
    maxDurationDays: number;
}

/**
 * A CRM create request parsed and checked as `POST /` does (form configuration, schedule, past start), before any
 * transaction. Shared with the series create (activity.series.ts).
 */
export function parseCrmCreate(body: unknown, config: ActivityConfig): { input: ActivityInput; schedule: Schedule; now: Date } {
    const input = activityInputSchema.parse(body);
    input.customFields = checkModulePayload(config.fields, configPayload(asPayload(body), input), input.customFields, {
        notApplicableKeys: notApplicableFor(input.followupType),
    });
    const schedule = scheduleOf(input, config);
    const now = new Date();
    throwFieldIssues(activityPastIssues({ ...input, ...schedule }, undefined, now, ENV.BUSINESS_TIMEZONE));
    return { input, schedule, now };
}

/** What `applyCrmUpdate` hands back: the row before and after, and the parsed input it saved. */
export interface CrmUpdateResult {
    existing: ActivityRow;
    row: ActivityRow;
    input: ActivityInput;
    /** ActivityDto keys the request asked to change (`requestedChanges`). */
    requested: ReadonlySet<string>;
}

/** Fields of a series occurrence a change to which doesn't make it an exception (they're per occurrence anyway). */
const PER_OCCURRENCE_KEYS: ReadonlySet<string> = new Set(['status', 'customerResponse']);

/**
 * A CRM user's update of one activity inside the caller's transaction (`PUT /:id`): record lock, access, patch merge,
 * validation (form configuration, schedule, past start), the activity's locks and `updateActivityRow`. A series
 * occurrence changed here on its own (anything but status / customer response) becomes an exception
 * (`seriesException`) unless `series` says otherwise (Calendar Phase 4: the series paths pass the columns they set).
 */
export async function applyCrmUpdate(
    tx: TransactionClient,
    id: string,
    patch: Record<string, unknown>,
    user: AuthUser,
    config: ActivityConfig,
    series?: ActivitySeriesColumns,
): Promise<CrmUpdateResult> {
    await lockRecords(tx, 'activity', [id]);
    const existing = await tx.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES });
    if (!existing) throw notFound();
    assertCanEdit(user, existing);

    const before = toActivityDto(existing);
    const merged = mergeActivityPatch(before, patch);
    const input = activityInputSchema.parse(merged);
    input.customFields = checkModulePayload(config.fields, configPayload(merged, input), input.customFields, {
        submittedKeys: submittedKeys(patch),
        previousCustomFields: before.customFields,
        notApplicableKeys: notApplicableFor(input.followupType),
    });
    const schedule = scheduleOf(input, config);
    const now = new Date();
    throwFieldIssues(activityPastIssues({ ...input, ...schedule }, before, now, ENV.BUSINESS_TIMEZONE));

    const requested = requestedChanges(before, patch);
    const becomesException = !series && Boolean(existing.seriesId) && !existing.seriesException && [...requested].some((key) => !PER_OCCURRENCE_KEYS.has(key));
    const writer: ActivityWriter = { ...crmWriter(user, config, requested), series: series ?? (becomesException ? { seriesException: true } : undefined) };
    const row = await updateActivityRow(tx, existing, input, schedule, writer, now);
    return { existing, row, input, requested };
}

export const activityService = {
    /**
     * Rows (the shape `list` returns, without `viewer`) for the given ids, regardless of row-level access. Kept for
     * the audit interfaces; activities are deliberately not in global search (it would show private meetings).
     */
    async listByIds(ids: string[]): Promise<ActivityDto[]> {
        if (ids.length === 0) return [];
        const rows = await prisma.activity.findMany({ where: { id: { in: ids }, isDeleted: false }, include: WITH_ATTENDEES });
        return rows.map(toActivityDto);
    },

    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<ActivityView>> {
        const page = parsePagination(query, ACTIVITY_SORT_FIELDS);
        const filters = activityListQuerySchema.parse(query ?? {});
        const where = listWhere(filters, page.search, user, new Date());
        const [total, rows] = await prisma.$transaction([
            prisma.activity.count({ where }),
            prisma.activity.findMany({ where, include: WITH_ATTENDEES, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: await toActivityViews(rows, user), total, page: page.page, limit: page.limit };
    },

    async getById(id: string, user: AuthUser): Promise<ActivityView> {
        const row = await prisma.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES });
        if (!row) throw notFound();
        assertCanView(user, row);
        return toOneView(row, user);
    },

    async create(body: unknown, user: AuthUser): Promise<ActivityView> {
        const config = await loadActivityConfig();
        const { input, schedule, now } = parseCrmCreate(body, config);
        const row = await runInTransaction((tx) => insertActivityRow(tx, input, schedule, crmWriter(user, config), now));
        await cacheService.invalidateEntityCaches('activities');
        await runActivityPostCommit([{ before: null, after: row }], user);
        return toOneView(row, user);
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<ActivityView> {
        const config = await loadActivityConfig();
        const { existing, row } = await runInTransaction((tx) => applyCrmUpdate(tx, id, patch, user, config));

        await cacheService.invalidateEntityCaches('activities');
        await runActivityPostCommit([{ before: existing, after: row }], user);
        return toOneView(row, user);
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        const deleted = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'activity', [id]);
            const existing = await tx.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES });
            if (!existing) throw notFound();
            assertCanEdit(user, existing);
            assertDeletable(existing);
            return softDeleteActivityRow(tx, existing, user);
        });
        await cacheService.invalidateEntityCaches('activities');
        // Nothing to arm or tell for a deleted row; the calendar push (a cancel) is woken here.
        await runActivityPostCommit([deleted], user);
    },

    /**
     * Restore from Admin › Audit Log: brings back a deleted activity and recomputes its reminder (one whose time has
     * already passed is not re-armed). Writes a RESTORE entry pointing at the DELETE it reverses (`revertsId`).
     */
    async restore(id: string, user: AuthUser, revertsId?: string): Promise<void> {
        // For the write hook (P2-3b: whether the restored activity's type syncs), loaded before the transaction.
        const config = await loadActivityConfig();
        const { before, after } = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'activity', [id]);
            const row = assertDeletedRow(await tx.activity.findUnique({ where: { id }, include: WITH_ATTENDEES }), 'Activity');
            const now = new Date();
            const due = computeRemindAt({ ...row, isDeleted: false }, row.timeZone);
            const remindAt = due && due > now ? due : null;
            const restored = await tx.activity.update({
                where: { id },
                data: { ...restoreData(user), remindAt, reminderSentAt: nextReminderSentAt(row, remindAt) },
                include: WITH_ATTENDEES,
            });
            await auditService.record(tx, { entityType: 'Activity', entityId: id, action: 'RESTORE', changedBy: user.username, revertsId });
            await afterActivityWrite(tx, row, restored, crmWriter(user, config), now);
            return { before: row, after: restored };
        });
        await cacheService.invalidateEntityCaches('activities');
        // Re-arms the reminder; owner and attendees are unchanged, so nobody is told again.
        await runActivityPostCommit([{ before, after }], user);
    },

    /**
     * Deletes the live activities among `ids` (all-or-nothing on access: 403 if any may not be changed). Locked ones
     * that refuse deletion (`ActivityLock.deleteRefusedReason`) are left alone and listed in `skipped`, which is
     * present only when something was skipped.
     */
    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const { result, rows } = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'activity', ids);
            const live = await tx.activity.findMany({ where: { id: { in: ids }, isDeleted: false }, include: WITH_ATTENDEES });
            for (const row of live) assertCanEdit(user, row);
            const skipped: { id: string; reason: string }[] = [];
            const deletable: ActivityRow[] = [];
            for (const row of live) {
                const reason = activityLocks.lockFor(row)?.deleteRefusedReason;
                if (reason) skipped.push({ id: row.id, reason });
                else deletable.push(row);
            }
            const liveIds = deletable.map((row) => row.id);
            const rows: ActivityCommitRow[] = [];
            if (liveIds.length > 0) {
                await tx.activity.updateMany({ where: { id: { in: liveIds } }, data: { ...softDeleteData(user), remindAt: null } });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Activity' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
                const now = new Date();
                const afterById = new Map(
                    (await tx.activity.findMany({ where: { id: { in: liveIds } }, include: WITH_ATTENDEES })).map((row) => [row.id, row]),
                );
                for (const before of deletable) {
                    const after = afterById.get(before.id);
                    if (!after) continue;
                    await afterActivityWrite(tx, before, after, crmWriter(user), now);
                    rows.push({ before, after });
                }
            }
            const liveSet = new Set(live.map((row) => row.id));
            const result: BulkDeleteResult = { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveSet.has(id)) };
            if (skipped.length > 0) result.skipped = skipped;
            return { result, rows };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('activities');
        // Nothing to arm or tell for deleted rows; P2-3b's calendar push runs here.
        await runActivityPostCommit(rows, user);
        return result;
    },

    /**
     * An invited colleague's reply (`POST /:id/response`). Audited as RSVP, not UPDATE: the update path can't set a
     * colleague's reply, so an Undo of it would do nothing.
     */
    async respond(id: string, body: unknown, user: AuthUser): Promise<ActivityView> {
        const { responseStatus } = respondSchema.parse(body);
        const { existing, row } = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'activity', [id]);
            const existing = await tx.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES });
            if (!existing) throw notFound();
            const mine = existing.attendees.find((row) => row.kind === 'user' && nameKey(row.username) === nameKey(user.username));
            if (!mine || existing.followupType === NOTE_TYPE) throw HttpError.forbidden(RSVP_FORBIDDEN_MESSAGE);

            const before = toActivityDto(existing);
            await tx.activityAttendee.update({ where: { id: mine.id }, data: { responseStatus, respondedAt: new Date() } });
            const row = await tx.activity.findUniqueOrThrow({ where: { id }, include: WITH_ATTENDEES });
            const changes = diffRecords(before, toActivityDto(row));
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Activity', entityId: id, action: 'RSVP', changedBy: user.username, changes });
            }
            return { existing, row };
        });
        await cacheService.invalidateEntityCaches('activities');
        // A reply changes no owner or invitation; this only re-arms the reminder (a no-op for a pending one).
        await runActivityPostCommit([{ before: existing, after: row }], user);
        return toOneView(row, user);
    },

    /** `GET /meta`: what the calendar and the form need before any activity is loaded. */
    async meta(): Promise<ActivityMeta> {
        const config = await loadActivityConfig();
        const types = config.followupTypes?.options.filter((option) => option.isActive) ?? [];
        return {
            timeZone: ENV.BUSINESS_TIMEZONE,
            now: new Date().toISOString(),
            relatedModules: ACTIVITY_RELATED_MODULES.map((key) => ({ key, label: ACTIVITY_RELATED_MODULE_LABELS[key] })),
            durationMinutes: Object.fromEntries(types.map((option) => [option.value, activityDurationMinutes(option.value, config.followupTypes)])),
            fallbackDurationMinutes: ACTIVITY_FALLBACK_DURATION_MINUTES,
            reminders: ACTIVITY_REMINDERS.map((value) => ({ value, minutes: ACTIVITY_REMINDER_MINUTES[value] })),
            statuses: [...ACTIVITY_STATUSES],
            maxDurationDays: ACTIVITY_MAX_DURATION_DAYS,
        };
    },

    async calendar(query: unknown, user: AuthUser): Promise<CalendarFeed> {
        return calendarFeed(calendarQuerySchema.parse(query ?? {}), user);
    },

    async linkTargets(query: unknown, user: AuthUser): Promise<LinkTarget[]> {
        return linkTargets(linkTargetsQuerySchema.parse(query ?? {}), user);
    },
};
