import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { ActivitySeries } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import { addDays, daysBetween, instantToZonedWallClock, zonedDayOf, zonedStartOfDay } from '../../utils/zonedTime.js';
import { throwFieldIssues } from '../form-configs/customFieldValidator.js';
import { ACTIVITY_ONLY_FOLLOWUP_TYPES } from '../form-configs/formConfig.defaults.js';
import { canAccessRecord } from '../shared/accessControl.js';
import { acquireLocks, lockRecords, runInTransaction } from '../shared/transactions.js';
import { FOLLOW_UP_ACTIVITY_LOCKED, FOLLOW_UP_ORIGIN } from './activity.access.js';
import { allDayRange, toActivityDto, type ActivityRow, type ActivityView } from './activity.mapper.js';
import {
    lastOccurrenceDay,
    normalizeRepeatRule,
    occurrenceDays,
    occurrenceTimes,
    repeatRuleSchema,
    ruleFromColumns,
    ruleToColumns,
    sameRule,
    shiftRuleToDay,
    summarizeRule,
    type OccurrenceTimes,
    type RepeatRule,
    type SeriesShape,
} from './activity.recurrence.js';
import { NOTE_TYPE, PLANNED_STATUS } from './activity.schedule.js';
import {
    SERIES_HORIZON_DAYS,
    SERIES_MAX_ROWS_PER_RUN,
    SERIES_NIGHTLY_BATCH,
    SERIES_SYNC_BATCH,
    SERIES_SYNC_WINDOW_DAYS,
} from './activity.series.constants.js';
import {
    activityService,
    applyCrmUpdate,
    assertCanEdit,
    crmWriter,
    insertActivityRow,
    loadActivityConfig,
    parseCrmCreate,
    runActivityPostCommit,
    scheduleOf,
    softDeleteActivityRow,
    toOneView,
    updateActivityRow,
    WITH_ATTENDEES,
    type ActivityCommitRow,
    type ActivityConfig,
    type ActivityWriter,
} from './activity.service.js';
import { activityInputSchema, type AttendeeInput } from './activity.validator.js';

/**
 * CRM-authored recurring activities (Calendar Phase 4; design note in docs/system-design.md › Recurring activities).
 * A series (`ActivitySeries`) holds the rule and the fields every occurrence copies; each occurrence is an ordinary
 * Activity row (`seriesId`, `originalStartAt`, `seriesIndex`, `seriesException`) created over a rolling horizon
 * (SERIES_HORIZON_DAYS ahead), so reminders, the calendar feed, busy times, the 31-day cap and the calendar push all
 * keep working on single rows (Phase 1 R12: rows, never RRULE masters).
 *
 * Edits and deletes of an occurrence take a scope: `this` (the ordinary path; the occurrence becomes an exception),
 * `following` (the series is split: the old one ends the day before, a new one starts at this occurrence) or `all`
 * (the series takes the new values; future Planned, non-exception occurrences are rewritten). Past and Completed
 * occurrences are never touched.
 *
 * Concurrency: series operations take the series lock (`activitySeries:id:<id>`) first, then the record locks of the
 * occurrences they change. A single-occurrence edit takes only its record lock, so no lock cycle exists. Inserts
 * pre-read the series' slots under the series lock (D45); a unique-index race aborts the transaction, never caught
 * inside it (the nightly retries a series once from the start).
 */

export const SERIES_SCOPES = ['this', 'following', 'all'] as const;
export type SeriesScope = (typeof SERIES_SCOPES)[number];

export const SERIES_SCOPE_REQUIRED = 'SERIES_SCOPE_REQUIRED';
export const SERIES_ENDED = 'SERIES_ENDED';
export const SERIES_MOVE_DAY_MESSAGE = 'To move every event to another day, change how it repeats, or pick "This and following events".';
const NOTE_REPEAT_MESSAGE = "A note can't repeat.";
const FOLLOW_UP_REPEAT_MESSAGE = "A follow-up activity can't repeat: it moves with its lead or opportunity.";
const ORIGIN_REPEAT_MESSAGE = 'Only activities made in the CRM can repeat.';
export const SERIES_FORBIDDEN_MESSAGE = 'Only the owner or the creator of this repeating activity can change its other events. Pick "This event" to change this one.';
const SLOT_TAKEN_MESSAGE = 'Another event of this series is already at that time and can\'t be replaced. Pick another time, or change that event first.';

export const seriesScopeQuerySchema = z.object({
    scope: z.enum(SERIES_SCOPES, { error: `scope must be one of: ${SERIES_SCOPES.join(', ')}.` }).optional(),
});

const repeatBodySchema = z.object({ repeat: repeatRuleSchema.nullable().optional() });

/** `repeat` of a request body: absent (unchanged), null (does not repeat) or a parsed rule (not yet normalised). */
export function repeatOf(body: unknown): { present: false } | { present: true; rule: z.infer<typeof repeatRuleSchema> | null } {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    if (!('repeat' in record) || record.repeat === undefined) return { present: false };
    const { repeat } = repeatBodySchema.parse({ repeat: record.repeat });
    return { present: true, rule: repeat ?? null };
}

export const seriesLockKey = (seriesId: string) => `activitySeries:id:${seriesId}`;

const withoutRepeat = (body: unknown): Record<string, unknown> => {
    const { repeat: _repeat, ...rest } = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    void _repeat;
    return rest;
};

// ── Template and shape ───────────────────────────────────────────────────────

/** The activity fields every occurrence copies (ActivitySeries.templateJson). */
export interface SeriesTemplate {
    followupType: string;
    subject: string;
    assignedTo: string;
    relatedModule?: string;
    relatedId?: string;
    organizationId?: string;
    organizationName?: string;
    contactId?: string;
    contact?: string;
    location?: string;
    reminder?: string;
    remarks?: string;
    attendees: AttendeeInput[];
    customFields: Record<string, unknown>;
}

const opt = (value: string | undefined | null) => (value ? value : undefined);

/** The template of a saved occurrence (links and owner as the write path resolved them). Pure. */
export function templateOf(row: ActivityRow): SeriesTemplate {
    const dto = toActivityDto(row);
    return {
        followupType: dto.followupType,
        subject: dto.subject,
        assignedTo: dto.assignedTo,
        relatedModule: opt(dto.relatedModule),
        relatedId: opt(dto.relatedId),
        organizationId: opt(dto.organizationId),
        organizationName: opt(dto.organizationName),
        contactId: opt(dto.contactId),
        contact: opt(dto.contact),
        location: opt(dto.location),
        reminder: opt(dto.reminder),
        remarks: opt(dto.remarks),
        // Replies belong to one occurrence: new occurrences start as needsAction (kept ones keep theirs).
        attendees: dto.attendees.map((a) => {
            if (a.kind === 'user') return { kind: 'user' as const, username: a.username ?? '' };
            if (a.kind === 'contact') return { kind: 'contact' as const, contactId: a.contactId ?? '', name: a.name || undefined, email: a.email };
            return { kind: 'email' as const, email: a.email ?? '', name: a.name || undefined };
        }),
        customFields: dto.customFields,
    };
}

export function parseTemplate(json: string): SeriesTemplate {
    try {
        const parsed = JSON.parse(json) as Partial<SeriesTemplate>;
        return { attendees: [], customFields: {}, followupType: 'Meeting', subject: '', assignedTo: '', ...parsed } as SeriesTemplate;
    } catch {
        return { attendees: [], customFields: {}, followupType: 'Meeting', subject: '', assignedTo: '' };
    }
}

/** Anchor day and shape (time of day, length) of a saved occurrence. Pure. */
export function shapeOf(row: Pick<ActivityRow, 'startAt' | 'endAt' | 'allDay'>, timeZone: string): { day: string; shape: SeriesShape } {
    const start = row.startAt as Date;
    if (row.allDay) {
        const { startDay, endDay } = allDayRange(start, row.endAt, timeZone);
        return { day: startDay, shape: { allDay: true, startTime: null, durationMinutes: 0, spanDays: daysBetween(startDay, endDay) + 1, timeZone } };
    }
    const wall = instantToZonedWallClock(start, timeZone);
    const minutes = row.endAt ? Math.max(0, Math.round((row.endAt.getTime() - start.getTime()) / 60_000)) : 0;
    return { day: wall.slice(0, 10), shape: { allDay: false, startTime: wall.slice(11, 16), durationMinutes: minutes, spanDays: 1, timeZone } };
}

const shapeOfSeries = (series: Pick<ActivitySeries, 'allDay' | 'startTime' | 'durationMinutes' | 'spanDays' | 'timeZone'>): SeriesShape => ({
    allDay: series.allDay,
    startTime: series.startTime,
    durationMinutes: series.durationMinutes,
    spanDays: series.spanDays,
    timeZone: series.timeZone,
});

const shapeColumns = (shape: SeriesShape) => ({
    allDay: shape.allDay,
    startTime: shape.allDay ? null : shape.startTime,
    durationMinutes: shape.allDay ? 0 : shape.durationMinutes,
    spanDays: shape.allDay ? shape.spanDays : 1,
    timeZone: shape.timeZone,
});

/** The fields of one occurrence: the template on `times`, Planned unless `status` says otherwise. */
export function occurrenceFields(template: SeriesTemplate, times: OccurrenceTimes, status = PLANNED_STATUS): Record<string, unknown> {
    return {
        ...template,
        status,
        allDay: times.allDay,
        startAt: times.startAt ?? null,
        endAt: times.endAt ?? null,
        startDay: times.startDay ?? null,
        endDay: times.endDay ?? null,
    };
}

/** 400 / 409 when `row` may not repeat: notes, follow-up activities, imported or booked activities, no start. */
export function assertRepeatable(row: Pick<ActivityRow, 'followupType' | 'origin' | 'externalOrganizer' | 'startAt'>): void {
    if (row.origin === FOLLOW_UP_ORIGIN) throw new HttpError(FOLLOW_UP_REPEAT_MESSAGE, StatusCodes.CONFLICT, { code: FOLLOW_UP_ACTIVITY_LOCKED, errors: [{ path: ['repeat'], message: FOLLOW_UP_REPEAT_MESSAGE }] });
    if (row.followupType === NOTE_TYPE) throwFieldIssues([{ path: ['repeat'], message: NOTE_REPEAT_MESSAGE }]);
    if (row.origin !== 'crm' || row.externalOrganizer) throwFieldIssues([{ path: ['repeat'], message: ORIGIN_REPEAT_MESSAGE }]);
    if (!row.startAt) throwFieldIssues([{ path: ['startAt'], message: 'Start is required for an activity that repeats.' }]);
}

// ── Materialising occurrences ────────────────────────────────────────────────

/** Who a series write runs as, and what it loaded before the transaction. */
interface SeriesContext {
    /** Username: audit `changedBy`, `updatedBy`, the write hook's actor (D41). */
    actor: string;
    config: ActivityConfig;
    now: Date;
    /** Rows written, for `runActivityPostCommit` after the commit. */
    written: ActivityCommitRow[];
    counts: { created: number; updated: number; deleted: number };
}

const newContext = (actor: string, config: ActivityConfig, now: Date): SeriesContext => ({ actor, config, now, written: [], counts: { created: 0, updated: 0, deleted: 0 } });

const today = (now: Date) => zonedDayOf(now, ENV.BUSINESS_TIMEZONE);
const horizonDay = (now: Date) => addDays(today(now), SERIES_HORIZON_DAYS);

const parseOccurrence = (fields: Record<string, unknown>, config: ActivityConfig) => {
    const input = activityInputSchema.parse(fields);
    return { input, schedule: scheduleOf(input, config) };
};

const seriesColumnsFor = (seriesId: string, times: OccurrenceTimes, index: number) => ({ seriesId, originalStartAt: times.originalStartAt, seriesIndex: index, seriesException: false });

/** What `insertActivityRow` treats as unchanged for an occurrence copied from `template` (ActivityWriter.keep). */
const templateKeep = (template: SeriesTemplate): NonNullable<ActivityWriter['keep']> => ({
    links: {
        relatedModule: template.relatedModule ?? null,
        relatedId: template.relatedId ?? null,
        relatedTo: null,
        relatedCode: null,
        organizationId: template.organizationId ?? null,
        contactId: template.contactId ?? null,
    },
    attendees: template.attendees.map((a) => ({ kind: a.kind, username: a.kind === 'user' ? a.username : null, contactId: a.kind === 'contact' ? a.contactId : null })),
});

/**
 * Series columns of an occurrence a series rewrite removed (it no longer fits the rule, or another row fills its slot):
 * soft-deleted and detached, so the slot can come back if the rule returns to that day (a user's own delete keeps
 * its series columns and its day stays empty).
 */
const DETACHED = { seriesId: null, originalStartAt: null, seriesIndex: null } as const;

/** A row a series edit may rewrite or remove: live, Planned, not started, not edited alone, not kept. */
const isRewritable = (row: ActivityRow, keep: ReadonlySet<string>, now: Date) =>
    !row.isDeleted && row.status === PLANNED_STATUS && !row.seriesException && !keep.has(row.id) && (row.startAt?.getTime() ?? 0) >= now.getTime();

async function insertOccurrence(tx: TransactionClient, series: ActivitySeries, template: SeriesTemplate, times: OccurrenceTimes, index: number, ctx: SeriesContext): Promise<void> {
    const { input, schedule } = parseOccurrence(occurrenceFields(template, times), ctx.config);
    const writer: ActivityWriter = {
        actor: ctx.actor,
        user: null,
        config: ctx.config,
        markSync: true,
        createdBy: series.createdBy,
        series: seriesColumnsFor(series.id, times, index),
        auditCreateChanges: { subject: input.subject, seriesId: series.id, originalStartAt: times.originalStartAt.toISOString() },
        // The template was checked when the series was saved: a related record, contact or colleague deleted or
        // deactivated since stays on new occurrences, as on existing ones, so the series keeps going.
        keep: templateKeep(template),
    };
    const after = await insertActivityRow(tx, input, schedule, writer, ctx.now);
    // The series' first occurrence told the owner and invitees; the rest arrive quietly (reminders still fire).
    ctx.written.push({ before: null, after, notify: false });
    ctx.counts.created++;
}

/** The business day a stored slot belongs to. */
const slotDay = (instant: Date | null) => (instant ? zonedDayOf(instant, ENV.BUSINESS_TIMEZONE) : '');

/**
 * Creates the occurrences of `series` that don't exist yet from the day after its horizon (or `fromDay`) through
 * `throughDay`, at most SERIES_MAX_ROWS_PER_RUN, under the series lock (the caller holds it). A day that already holds
 * a row of the series (any state, deleted ones too) is skipped, so a run started again creates nothing twice and a
 * deleted occurrence stays deleted (D45 pre-read; UX_Activity_seriesOccurrence backs it). Moves the horizon forward
 * and sets `endedAt` once the rule has no occurrence left to create. Returns the rows created.
 */
export async function materializeSeries(tx: TransactionClient, series: ActivitySeries, throughDay: string, ctx: SeriesContext, fromDay?: string): Promise<number> {
    const rule = ruleFromColumns(series);
    const shape = shapeOfSeries(series);
    const template = parseTemplate(series.templateJson);
    const start = fromDay ?? (series.materializedThrough ? addDays(series.materializedThrough, 1) : series.startDay);
    const floor = start > today(ctx.now) ? start : today(ctx.now);
    const slots = occurrenceDays(rule, series.startDay, throughDay).filter((slot) => slot.day >= floor);
    let created = 0;
    let reached = throughDay;
    if (slots.length > 0) {
        const taken = await tx.activity.findMany({
            where: { seriesId: series.id, originalStartAt: { gte: zonedStartOfDay(addDays(slots[0].day, -1), series.timeZone) } },
            select: { originalStartAt: true },
        });
        const takenDays = new Set(taken.map((row) => slotDay(row.originalStartAt)));
        for (const slot of slots) {
            if (takenDays.has(slot.day)) continue;
            const times = occurrenceTimes(shape, slot.day);
            if (!times.allDay && times.originalStartAt.getTime() < ctx.now.getTime()) continue;
            if (created >= SERIES_MAX_ROWS_PER_RUN) {
                reached = addDays(slot.day, -1);
                break;
            }
            await insertOccurrence(tx, series, template, times, slot.index, ctx);
            created++;
        }
    }
    const last = lastOccurrenceDay(rule, series.startDay);
    const done = last !== null && last <= reached;
    await tx.activitySeries.update({
        where: { id: series.id },
        data: { materializedThrough: reached, ...(done && !series.endedAt ? { endedAt: ctx.now } : {}) },
    });
    return created;
}

// ── Rewriting a series ("All events", "This and following") ─────────────────

interface RewriteOptions {
    /** Rows left alone and whose day stays taken (the occurrence the user edited). */
    keep: ReadonlySet<string>;
    /** First day rewritten (inclusive); default today. */
    fromDay: string;
    /** Status every rewritten occurrence gets (Cancelled when the series is cancelled from here). */
    status?: string;
    /** Also deletes eligible rows from this day up to `fromDay` (a split whose first occurrence moved later). */
    sweepFromDay?: string;
}

/**
 * Rewrites the occurrences of `series` from `opts.fromDay` (never before now) through the horizon to its current rule,
 * shape and template: eligible rows (Planned, live, not an exception, not kept, not started) are paired with the rule's
 * slots by business day and updated through the system write path (one Activity UPDATE entry each, a diff); eligible
 * rows without a slot are soft-deleted and detached (DETACHED); slots on a free day are created (a day holding a
 * user-deleted, completed, exception or kept row stays as it is). A row whose new slot time has already passed today
 * is left as it is. Past and Completed occurrences are never touched. With `opts.status` (Cancelled from here) every
 * future Planned occurrence from `fromDay` takes that status instead, exceptions included. The caller holds the series
 * lock.
 */
export async function rewriteSeries(tx: TransactionClient, series: ActivitySeries, ctx: SeriesContext, opts: RewriteOptions): Promise<void> {
    const rule = ruleFromColumns(series);
    const shape = shapeOfSeries(series);
    const template = parseTemplate(series.templateJson);
    const fromDay = opts.fromDay > today(ctx.now) ? opts.fromDay : today(ctx.now);
    const throughDay = horizonDay(ctx.now);
    const cancelling = Boolean(opts.status && opts.status !== PLANNED_STATUS);

    const firstDay = opts.sweepFromDay && opts.sweepFromDay < fromDay ? opts.sweepFromDay : fromDay;
    const candidates = await tx.activity.findMany({
        where: { seriesId: series.id, originalStartAt: { gte: zonedStartOfDay(firstDay, series.timeZone) } },
        select: { id: true },
    });
    await lockRecords(
        tx,
        'activity',
        candidates.map((row) => row.id),
    );
    const rows = await tx.activity.findMany({
        where: { seriesId: series.id, originalStartAt: { gte: zonedStartOfDay(firstDay, series.timeZone) } },
        include: WITH_ATTENDEES,
    });

    if (cancelling) {
        // Cancelled from here: every future Planned occurrence goes, exceptions included (as a delete from here would).
        for (const row of rows) {
            const future = !row.isDeleted && row.status === PLANNED_STATUS && !opts.keep.has(row.id) && (row.startAt?.getTime() ?? 0) >= ctx.now.getTime();
            if (!future || slotDay(row.originalStartAt) < fromDay) continue;
            const { input, schedule } = parseOccurrence({ ...toActivityDto(row), status: opts.status }, ctx.config);
            const writer: ActivityWriter = { actor: ctx.actor, user: null, config: ctx.config, markSync: true };
            const after = await updateActivityRow(tx, row, input, schedule, writer, ctx.now);
            ctx.written.push({ before: row, after, notify: false });
            ctx.counts.updated++;
        }
    } else {
        const blocked = new Map<string, ActivityRow[]>();
        const open = new Map<string, ActivityRow>();
        const extra: ActivityRow[] = [];
        for (const row of rows) {
            const day = slotDay(row.originalStartAt);
            if (!isRewritable(row, opts.keep, ctx.now)) blocked.set(day, [...(blocked.get(day) ?? []), row]);
            else if (day < fromDay || open.has(day)) extra.push(row);
            else open.set(day, row);
        }

        for (const slot of occurrenceDays(rule, series.startDay, throughDay).filter((s) => s.day >= fromDay)) {
            const times = occurrenceTimes(shape, slot.day);
            const row = open.get(slot.day);
            if (row) open.delete(slot.day);
            // The new time has already passed today: the row (not started at its old time) stays as it is, and no row
            // is created in the past.
            if (!times.allDay && times.originalStartAt.getTime() < ctx.now.getTime()) continue;
            const blockers = blocked.get(slot.day) ?? [];
            if (row) {
                // The slot is already held by a kept / completed / exception row with this exact start: that one fills it.
                if (blockers.some((b) => b.originalStartAt?.getTime() === times.originalStartAt.getTime())) {
                    extra.push(row);
                    continue;
                }
                const { input, schedule } = parseOccurrence(occurrenceFields(template, times), ctx.config);
                const writer: ActivityWriter = { actor: ctx.actor, user: null, config: ctx.config, markSync: true, series: seriesColumnsFor(series.id, times, slot.index) };
                const after = await updateActivityRow(tx, row, input, schedule, writer, ctx.now);
                ctx.written.push({ before: row, after, notify: false });
                ctx.counts.updated++;
            } else if (blockers.length === 0) {
                await insertOccurrence(tx, series, template, times, slot.index, ctx);
            }
        }

        for (const row of [...open.values(), ...extra]) {
            ctx.written.push(await softDeleteActivityRow(tx, row, actorUser(ctx.actor), ctx.now, DETACHED));
            ctx.counts.deleted++;
        }
    }

    const last = lastOccurrenceDay(rule, series.startDay);
    const done = cancelling || (last !== null && last <= throughDay);
    await tx.activitySeries.update({
        where: { id: series.id },
        data: { materializedThrough: throughDay, endedAt: done ? (series.endedAt ?? ctx.now) : null },
    });
}

/**
 * Makes the slot `slot` of `seriesId` free for the row `exceptId` (UX_Activity_seriesOccurrence): a deleted row holding
 * it is detached, a rewritable one is deleted and detached; any other (completed, an exception, started) refuses the
 * save (400 on startAt). Runs before the edited row takes the slot; the caller holds the series lock.
 */
async function freeSlot(tx: TransactionClient, seriesId: string, slot: Date, exceptId: string, ctx: SeriesContext): Promise<void> {
    const holders = await tx.activity.findMany({ where: { seriesId, originalStartAt: slot, id: { not: exceptId } }, select: { id: true } });
    if (holders.length === 0) return;
    const ids = holders.map((row) => row.id);
    await lockRecords(tx, 'activity', ids);
    const rows = await tx.activity.findMany({ where: { id: { in: ids } }, include: WITH_ATTENDEES });
    for (const row of rows) {
        if (row.isDeleted) {
            await tx.activity.update({ where: { id: row.id }, data: DETACHED });
        } else if (isRewritable(row, new Set(), ctx.now)) {
            ctx.written.push(await softDeleteActivityRow(tx, row, actorUser(ctx.actor), ctx.now, DETACHED));
            ctx.counts.deleted++;
        } else {
            throwFieldIssues([{ path: ['startAt'], message: SLOT_TAKEN_MESSAGE }]);
        }
    }
}

/** 403 unless `user` may change the series as a record (its owner, its creator or a global role; Phase 1 D11). */
function assertCanEditSeries(user: AuthUser, series: Pick<ActivitySeries, 'assignedTo' | 'createdBy'>): void {
    if (!canAccessRecord(user, series)) throw HttpError.forbidden(SERIES_FORBIDDEN_MESSAGE);
}

const actorUser = (username: string): AuthUser => ({ id: 0, username, role: '' });

// ── Audit ────────────────────────────────────────────────────────────────────

const ruleAudit = (series: Pick<ActivitySeries, 'startDay' | 'startTime' | 'allDay'> & { rule: RepeatRule }) => ({
    repeat: summarizeRule(series.rule),
    startDay: series.startDay,
    startTime: series.startTime ?? '',
    allDay: series.allDay,
});

async function auditSeries(tx: TransactionClient, seriesId: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actor: string, changes: Record<string, unknown>): Promise<void> {
    await auditService.record(tx, { entityType: 'ActivitySeries', entityId: seriesId, action, changedBy: actor, changes });
}

// ── Series rows ──────────────────────────────────────────────────────────────

/** Inserts a series anchored at `anchorDay` (rows are added by the caller). */
async function createSeriesRow(
    tx: TransactionClient,
    args: { rule: RepeatRule; anchorDay: string; shape: SeriesShape; template: SeriesTemplate; actor: string; createdBy?: string; splitFromId?: string },
): Promise<ActivitySeries> {
    return tx.activitySeries.create({
        data: {
            assignedTo: args.template.assignedTo,
            ...ruleToColumns(args.rule),
            startDay: args.anchorDay,
            ...shapeColumns(args.shape),
            templateJson: JSON.stringify(args.template),
            materializedThrough: args.anchorDay,
            splitFromId: args.splitFromId ?? null,
            createdBy: args.createdBy ?? args.actor,
        },
    });
}

async function lockedSeries(tx: TransactionClient, seriesId: string): Promise<ActivitySeries | null> {
    await acquireLocks(tx, [seriesLockKey(seriesId)]);
    return tx.activitySeries.findFirst({ where: { id: seriesId, isDeleted: false } });
}

/** Sets the occurrence's own series columns (bookkeeping only: no audit entry, `updatedAt` kept). */
async function setSeriesColumns(tx: TransactionClient, row: ActivityRow, columns: ReturnType<typeof seriesColumnsFor>): Promise<ActivityRow> {
    return tx.activity.update({ where: { id: row.id }, data: { ...columns, updatedAt: row.updatedAt }, include: WITH_ATTENDEES });
}

async function afterCommit(ctx: SeriesContext, user: AuthUser, extra: ActivityCommitRow[] = []): Promise<void> {
    await cacheService.invalidateEntityCaches('activities');
    await runActivityPostCommit([...extra, ...ctx.written], user);
}

// ── Service ──────────────────────────────────────────────────────────────────

export const activitySeriesService = {
    /**
     * `POST /api/activities` with `repeat`: the first occurrence is saved through the CRM create path (validation,
     * access, notifications), the series row records the rule and the template, and the occurrences through the horizon
     * are created in the same transaction. Without `repeat` (or `repeat: null`) it is the ordinary create.
     */
    async create(body: unknown, user: AuthUser): Promise<ActivityView> {
        const repeat = repeatOf(body);
        if (!repeat.present || repeat.rule === null) return activityService.create(withoutRepeat(body), user);
        const config = await loadActivityConfig();
        const { input, schedule, now } = parseCrmCreate(withoutRepeat(body), config);
        assertRepeatable({ followupType: input.followupType, origin: 'crm', externalOrganizer: false, startAt: schedule.startAt });
        const tz = ENV.BUSINESS_TIMEZONE;
        const { day: anchorDay, shape } = shapeOf(schedule, tz);
        const normalized = normalizeRepeatRule(repeat.rule, anchorDay);
        throwFieldIssues(normalized.issues);
        const ctx = newContext(user.username, config, now);

        const first = await runInTransaction(async (tx) => {
            ctx.written = [];
            ctx.counts = { created: 0, updated: 0, deleted: 0 };
            const provisional = { ...input, attendees: input.attendees, customFields: input.customFields ?? {} } as unknown as SeriesTemplate;
            let series = await createSeriesRow(tx, { rule: normalized.rule, anchorDay, shape, template: provisional, actor: user.username });
            await acquireLocks(tx, [seriesLockKey(series.id)]);
            const times = occurrenceTimes(shape, anchorDay);
            const row = await insertActivityRow(tx, input, schedule, { ...crmWriter(user, config), series: seriesColumnsFor(series.id, times, 1) }, now);
            // The template as the write path resolved it (owner, links, attendee names).
            series = await tx.activitySeries.update({ where: { id: series.id }, data: { templateJson: JSON.stringify(templateOf(row)), assignedTo: row.assignedTo } });
            await materializeSeries(tx, series, horizonDay(now), ctx, addDays(anchorDay, 1));
            await auditSeries(tx, series.id, 'CREATE', user.username, {
                subject: row.subject,
                ...ruleAudit({ ...series, rule: normalized.rule }),
                firstActivityId: row.id,
                occurrences: { created: ctx.counts.created + 1 },
            });
            return row;
        });
        await afterCommit(ctx, user, [{ before: null, after: first }]);
        return toOneView(first, user);
    },

    /**
     * `PUT /api/activities/:id?scope=` with an optional `repeat`. A single activity without `repeat` and an occurrence
     * with scope `this` take the ordinary update (the occurrence becomes an exception); `repeat` on a single activity
     * makes it the first occurrence of a new series; `following` / `all` edit the series (module comment).
     */
    async update(id: string, body: Record<string, unknown>, user: AuthUser, query: unknown = {}): Promise<ActivityView> {
        const { scope = 'this' } = seriesScopeQuerySchema.parse(query ?? {});
        const repeat = repeatOf(body);
        const patch = withoutRepeat(body);
        const found = await prisma.activity.findFirst({ where: { id, isDeleted: false }, select: { seriesId: true, origin: true, externalOrganizer: true } });
        if (!found) throw HttpError.notFound('Activity not found');

        if (!found.seriesId) {
            if (!repeat.present || repeat.rule === null) return activityService.update(id, patch, user);
            // Origin first (a follow-up activity answers 409 whatever else the patch holds); the rest after the save.
            assertRepeatable({ followupType: '', origin: found.origin, externalOrganizer: found.externalOrganizer, startAt: new Date() });
            return makeRecurring(id, patch, repeat.rule, user);
        }
        if (scope === 'this') {
            if (repeat.present) {
                const series = await prisma.activitySeries.findFirst({ where: { id: found.seriesId } });
                const current = series ? ruleFromColumns(series) : null;
                const asked = repeat.rule && series ? normalizeRepeatRule(repeat.rule, series.startDay).rule : null;
                if (!sameRule(current, asked)) {
                    throw new HttpError('Pick "This and following events" or "All events" to change how it repeats.', StatusCodes.BAD_REQUEST, {
                        code: SERIES_SCOPE_REQUIRED,
                        errors: [{ path: ['repeat'], message: 'Pick "This and following events" or "All events" to change how it repeats.' }],
                    });
                }
            }
            return activityService.update(id, patch, user);
        }
        return editSeries(id, found.seriesId, patch, repeat, scope, user);
    },

    /**
     * `DELETE /api/activities/:id?scope=`: `this` = the ordinary delete (the day stays empty); `following` = the series
     * ends the day before and its non-completed occurrences from here are deleted; `all` = the series is deleted with
     * its non-completed occurrences from now (and this one); past ones stay as history.
     */
    async remove(id: string, user: AuthUser, query: unknown = {}): Promise<void> {
        const { scope = 'this' } = seriesScopeQuerySchema.parse(query ?? {});
        const found = await prisma.activity.findFirst({ where: { id, isDeleted: false }, select: { seriesId: true } });
        if (!found) throw HttpError.notFound('Activity not found');
        if (!found.seriesId || scope === 'this') return activityService.remove(id, user);
        const seriesId = found.seriesId;
        const now = new Date();
        const ctx = newContext(user.username, await loadActivityConfig(), now);
        await runInTransaction(async (tx) => {
            ctx.written = [];
            ctx.counts = { created: 0, updated: 0, deleted: 0 };
            const series = await lockedSeries(tx, seriesId);
            await lockRecords(tx, 'activity', [id]);
            const clicked = await tx.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES });
            if (!clicked) throw HttpError.notFound('Activity not found');
            assertCanEdit(user, clicked);
            if (!series) {
                ctx.written.push(await softDeleteActivityRow(tx, clicked, user, now));
                return;
            }
            // Owning one occurrence (reassigned on its own) isn't enough to delete the others.
            assertCanEditSeries(user, series);
            const pivot = clicked.originalStartAt ?? clicked.startAt ?? now;
            const pivotDay = slotDay(pivot);
            const where =
                scope === 'following'
                    ? { seriesId, isDeleted: false, status: { not: 'Completed' }, originalStartAt: { gte: pivot } }
                    : { seriesId, isDeleted: false, status: { not: 'Completed' }, OR: [{ startAt: { gte: now } }, { id }] };
            const targets = await tx.activity.findMany({ where, select: { id: true } });
            const ids = [...new Set([...targets.map((row) => row.id), id])];
            await lockRecords(tx, 'activity', ids);
            const rows = await tx.activity.findMany({ where: { id: { in: ids }, isDeleted: false }, include: WITH_ATTENDEES });
            for (const row of rows) {
                if (row.status === 'Completed' && row.id !== id) continue;
                ctx.written.push(await softDeleteActivityRow(tx, row, user, now));
                ctx.counts.deleted++;
            }
            const endsBeforeStart = scope === 'all' || pivotDay <= series.startDay;
            await tx.activitySeries.update({
                where: { id: seriesId },
                data: endsBeforeStart
                    ? { isDeleted: true, deletedAt: now, endedAt: series.endedAt ?? now, updatedBy: user.username, revision: { increment: 1 } }
                    : { untilDay: addDays(pivotDay, -1), count: null, endedAt: series.endedAt ?? now, updatedBy: user.username, revision: { increment: 1 } },
            });
            await auditSeries(tx, seriesId, endsBeforeStart ? 'DELETE' : 'UPDATE', user.username, {
                scope,
                ...(endsBeforeStart ? {} : { untilDay: { from: series.untilDay ?? '', to: addDays(pivotDay, -1) } }),
                occurrences: { deleted: ctx.counts.deleted },
            });
        });
        await afterCommit(ctx, user);
    },

    /**
     * The nightly step (reminders worker `nightly`, 00:20 business time; no wake of its own): extends the horizon of
     * up to SERIES_NIGHTLY_BATCH live series, then marks for calendar sync the occurrences that came inside the sync
     * window. With no series due it is one indexed read each.
     */
    async runNightly(now = new Date()): Promise<{ series: number; created: number; marked: number }> {
        const extended = await extendSeriesHorizons(now);
        const marked = await markSeriesSyncWindow(now);
        return { ...extended, marked };
    },
};

/** `PUT` with `repeat` on a single activity: it becomes occurrence 1 of a new series. */
async function makeRecurring(id: string, patch: Record<string, unknown>, rawRule: z.infer<typeof repeatRuleSchema>, user: AuthUser): Promise<ActivityView> {
    const config = await loadActivityConfig();
    const now = new Date();
    const ctx = newContext(user.username, config, now);
    const { existing, row } = await runInTransaction(async (tx) => {
        ctx.written = [];
        ctx.counts = { created: 0, updated: 0, deleted: 0 };
        const updated = await applyCrmUpdate(tx, id, patch, user, config);
        assertRepeatable(updated.row);
        const { day: anchorDay, shape } = shapeOf(updated.row, ENV.BUSINESS_TIMEZONE);
        const normalized = normalizeRepeatRule(rawRule, anchorDay);
        throwFieldIssues(normalized.issues);
        const series = await createSeriesRow(tx, { rule: normalized.rule, anchorDay, shape, template: templateOf(updated.row), actor: user.username });
        await acquireLocks(tx, [seriesLockKey(series.id)]);
        const row = await setSeriesColumns(tx, updated.row, seriesColumnsFor(series.id, occurrenceTimes(shape, anchorDay), 1));
        await materializeSeries(tx, series, horizonDay(now), ctx, addDays(anchorDay, 1));
        await auditSeries(tx, series.id, 'CREATE', user.username, {
            subject: row.subject,
            ...ruleAudit({ ...series, rule: normalized.rule }),
            firstActivityId: row.id,
            occurrences: { created: ctx.counts.created + 1 },
        });
        return { existing: updated.existing, row };
    });
    await afterCommit(ctx, user, [{ before: existing, after: row }]);
    return toOneView(row, user);
}

/** `following` / `all` edits (module comment). */
async function editSeries(
    id: string,
    seriesId: string,
    patch: Record<string, unknown>,
    repeat: ReturnType<typeof repeatOf>,
    scope: Exclude<SeriesScope, 'this'>,
    user: AuthUser,
): Promise<ActivityView> {
    const config = await loadActivityConfig();
    const now = new Date();
    const ctx = newContext(user.username, config, now);
    const tz = ENV.BUSINESS_TIMEZONE;
    const { existing, row } = await runInTransaction(async (tx) => {
        ctx.written = [];
        ctx.counts = { created: 0, updated: 0, deleted: 0 };
        const series = await lockedSeries(tx, seriesId);
        if (!series) {
            throw new HttpError('This series was deleted: only this event can be changed.', StatusCodes.CONFLICT, { code: SERIES_ENDED });
        }
        // Owning one occurrence (reassigned on its own) isn't enough to change the others (D11 on the series).
        assertCanEditSeries(user, series);
        const before = await tx.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES });
        if (!before) throw HttpError.notFound('Activity not found');
        const pivot = before.originalStartAt ?? before.startAt ?? now;
        const pivotDay = slotDay(pivot);
        // An occurrence moved to another day on its own ("This event") keeps its own slot under "All events".
        const offSlot = Boolean(before.originalStartAt) && slotDay(before.startAt) !== pivotDay;
        const keepsSlot = scope === 'all' && offSlot;
        const updated = await applyCrmUpdate(tx, id, patch, user, config, { seriesException: keepsSlot });
        assertRepeatable(updated.row);
        const { day: newDay, shape } = shapeOf(updated.row, tz);
        const movedNow = newDay !== slotDay(before.startAt);
        const oldRule = ruleFromColumns(series);
        const template = templateOf(updated.row);
        const cancelled = updated.row.status === 'Cancelled' && before.status !== 'Cancelled';

        if (scope === 'all' && movedNow) throwFieldIssues([{ path: ['startAt'], message: SERIES_MOVE_DAY_MESSAGE }]);

        // "Does not repeat" from here, or Cancelled from here: the series stops after this occurrence. Its rule ends
        // there too (untilDay), so a later "All events" edit never brings it back.
        if ((repeat.present && repeat.rule === null) || cancelled) {
            const keep = new Set([id]);
            const fromDay = scope === 'all' ? today(now) : pivotDay;
            if (cancelled) {
                await rewriteSeries(tx, series, ctx, { keep, fromDay, status: 'Cancelled' });
            } else {
                // Following: nothing after this one; all: no future occurrence but this one. Past ones stay (not over
                // yet = starts after now, as delete "All events" counts them).
                const where =
                    scope === 'all'
                        ? { startAt: { gte: now } }
                        : { originalStartAt: { gte: zonedStartOfDay(addDays(pivotDay, 1), series.timeZone) }, startAt: { gte: now } };
                await deleteWhere(tx, series, where, keep, ctx);
            }
            const untilDay = pivotDay > today(now) || scope === 'following' ? pivotDay : today(now);
            await tx.activitySeries.update({
                where: { id: seriesId },
                data: { untilDay, count: null, endedAt: series.endedAt ?? now, updatedBy: user.username, revision: { increment: 1 } },
            });
            await auditSeries(tx, seriesId, 'UPDATE', user.username, {
                scope,
                ...(cancelled ? { status: 'Cancelled' } : { repeat: { from: summarizeRule(oldRule), to: 'Does not repeat' } }),
                untilDay: { from: series.untilDay ?? '', to: untilDay },
                occurrences: ctx.counts,
            });
            return { existing: updated.existing, row: updated.row };
        }

        const askedRule = repeat.present && repeat.rule ? normalizeRepeatRule(repeat.rule, scope === 'all' ? series.startDay : newDay) : null;
        if (askedRule) throwFieldIssues(askedRule.issues);

        if (scope === 'all') {
            const rule = askedRule?.rule ?? oldRule;
            const next = await tx.activitySeries.update({
                where: { id: seriesId },
                data: {
                    ...ruleToColumns(rule),
                    ...shapeColumns(shape),
                    templateJson: JSON.stringify(template),
                    assignedTo: template.assignedTo,
                    updatedBy: user.username,
                    revision: { increment: 1 },
                },
            });
            let row = updated.row;
            if (!keepsSlot) {
                const times = occurrenceTimes(shape, newDay);
                await freeSlot(tx, seriesId, times.originalStartAt, id, ctx);
                const slot = occurrenceDays(rule, series.startDay, newDay).find((s) => s.day === newDay);
                row = await setSeriesColumns(tx, updated.row, seriesColumnsFor(seriesId, times, slot?.index ?? before.seriesIndex ?? 1));
            }
            await rewriteSeries(tx, next, ctx, { keep: new Set([id]), fromDay: today(now) });
            await auditSeries(tx, seriesId, 'UPDATE', user.username, {
                scope,
                ...seriesDiff(series, next),
                occurrences: ctx.counts,
            });
            return { existing: updated.existing, row };
        }

        // following: split at this occurrence (or at the day it moved to, when that is earlier).
        let rule = askedRule?.rule ?? oldRule;
        // "Ends after N" counts from the first occurrence: the new series keeps what is left, unless another count was
        // asked (the form sends the series' total back unchanged when only the rule's days change).
        if (rule.ends === 'after' && rule.count && oldRule.ends === 'after' && (!askedRule || rule.count === oldRule.count)) {
            rule = { ...rule, count: Math.max(1, rule.count - ((before.seriesIndex ?? 1) - 1)) };
        }
        // Moved to another day without a new rule: a rule tied to the old day follows the move (weekly on Wed → Thu).
        if (!askedRule && movedNow) rule = shiftRuleToDay(rule, pivotDay, newDay);
        const earlier = newDay < pivotDay;
        const cutDay = earlier ? newDay : pivotDay;
        const cut = earlier ? zonedStartOfDay(newDay, series.timeZone) : pivot;
        const oldUntil = addDays(cutDay, -1);
        const emptied = cutDay <= series.startDay;
        await tx.activitySeries.update({
            where: { id: seriesId },
            data: emptied
                ? { isDeleted: true, deletedAt: now, endedAt: series.endedAt ?? now, updatedBy: user.username, revision: { increment: 1 } }
                : { untilDay: oldUntil, count: null, endedAt: series.endedAt ?? now, updatedBy: user.username, revision: { increment: 1 } },
        });
        const fresh = await createSeriesRow(tx, { rule, anchorDay: newDay, shape, template, actor: user.username, splitFromId: seriesId });
        await acquireLocks(tx, [seriesLockKey(fresh.id)]);
        // Rows of the old series from the cut on move to the new series (bookkeeping, no audit entry each).
        const moving = await tx.activity.findMany({ where: { seriesId, originalStartAt: { gte: cut } }, select: { id: true } });
        if (moving.length > 0) await tx.activity.updateMany({ where: { id: { in: moving.map((m) => m.id) } }, data: { seriesId: fresh.id } });
        const times = occurrenceTimes(shape, newDay);
        await freeSlot(tx, fresh.id, times.originalStartAt, id, ctx);
        const row = await setSeriesColumns(tx, updated.row, seriesColumnsFor(fresh.id, times, 1));
        await rewriteSeries(tx, fresh, ctx, { keep: new Set([id]), fromDay: newDay, sweepFromDay: cutDay });
        await auditSeries(tx, seriesId, emptied ? 'DELETE' : 'UPDATE', user.username, {
            scope,
            splitInto: fresh.id,
            ...(emptied ? {} : { untilDay: { from: series.untilDay ?? '', to: oldUntil } }),
        });
        await auditSeries(tx, fresh.id, 'CREATE', user.username, {
            subject: template.subject,
            ...ruleAudit({ ...fresh, rule }),
            splitFrom: seriesId,
            firstActivityId: id,
            occurrences: { moved: moving.length, ...ctx.counts },
        });
        return { existing: updated.existing, row };
    });
    await afterCommit(ctx, user, [{ before: existing, after: row }]);
    return toOneView(row, user);
}

/** Deletes the live, non-completed occurrences of `series` matching `where` (except `keep`); a user's stop keeps their slots. */
async function deleteWhere(tx: TransactionClient, series: ActivitySeries, where: Record<string, unknown>, keep: ReadonlySet<string>, ctx: SeriesContext): Promise<void> {
    const ids = (await tx.activity.findMany({ where: { ...where, seriesId: series.id, isDeleted: false, status: { not: 'Completed' } }, select: { id: true } }))
        .map((row) => row.id)
        .filter((rowId) => !keep.has(rowId));
    if (ids.length === 0) return;
    await lockRecords(tx, 'activity', ids);
    const rows = await tx.activity.findMany({ where: { id: { in: ids }, isDeleted: false }, include: WITH_ATTENDEES });
    for (const row of rows) {
        ctx.written.push(await softDeleteActivityRow(tx, row, actorUser(ctx.actor), ctx.now));
        ctx.counts.deleted++;
    }
}

/** The audited difference between two versions of a series (rule summary, time, template fields). */
function seriesDiff(before: ActivitySeries, after: ActivitySeries): Record<string, { from: unknown; to: unknown }> {
    const out: Record<string, { from: unknown; to: unknown }> = {};
    const a = summarizeRule(ruleFromColumns(before));
    const b = summarizeRule(ruleFromColumns(after));
    if (a !== b) out.repeat = { from: a, to: b };
    for (const key of ['startTime', 'durationMinutes', 'spanDays', 'allDay', 'assignedTo'] as const) {
        if (before[key] !== after[key]) out[key] = { from: before[key], to: after[key] };
    }
    const ta = parseTemplate(before.templateJson);
    const tb = parseTemplate(after.templateJson);
    for (const key of ['subject', 'followupType', 'location', 'reminder', 'relatedId'] as const) {
        if ((ta[key] ?? '') !== (tb[key] ?? '')) out[key] = { from: ta[key] ?? '', to: tb[key] ?? '' };
    }
    if (JSON.stringify(ta.attendees) !== JSON.stringify(tb.attendees)) out.attendees = { from: ta.attendees.length, to: tb.attendees.length };
    return out;
}

// ── Nightly ──────────────────────────────────────────────────────────────────

/**
 * Extends the horizon of up to SERIES_NIGHTLY_BATCH live series whose occurrences stop before today +
 * SERIES_HORIZON_DAYS (least recently written first, so every series takes its turn), one short transaction each under
 * the series lock. A unique-index race (another process created a slot first) aborts that series' transaction; it is
 * run once more from the start (D45). Any other failure is logged and the series goes to the back of the queue (its
 * `updatedAt` is touched), so a series that can't be extended never blocks the others.
 */
export async function extendSeriesHorizons(now = new Date()): Promise<{ series: number; created: number }> {
    const through = horizonDay(now);
    const due = await prisma.activitySeries.findMany({
        where: { isDeleted: false, endedAt: null, OR: [{ materializedThrough: null }, { materializedThrough: { lt: through } }] },
        orderBy: [{ updatedAt: 'asc' }],
        take: SERIES_NIGHTLY_BATCH,
        select: { id: true },
    });
    if (due.length === 0) return { series: 0, created: 0 };
    const config = await loadActivityConfig();
    let created = 0;
    for (const { id } of due) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const ctx = newContext('system', config, now);
            try {
                await runInTransaction(async (tx) => {
                    ctx.written = [];
                    ctx.counts = { created: 0, updated: 0, deleted: 0 };
                    const series = await lockedSeries(tx, id);
                    if (!series || series.endedAt) return;
                    // Audit as the person who last set the series up (the calendar mark reads the series for D41).
                    ctx.actor = series.updatedBy ?? series.createdBy;
                    await materializeSeries(tx, series, through, ctx);
                });
                created += ctx.counts.created;
                if (ctx.written.length > 0) {
                    await cacheService.invalidateEntityCaches('activities');
                    await runActivityPostCommit(ctx.written, ctx.actor, { notify: false });
                }
                break;
            } catch (err) {
                if (attempt === 1 && isUniqueViolation(err)) continue;
                logger.error({ err: (err as Error).message, seriesId: id }, 'Could not extend the recurring series; it is tried again after the other series');
                await prisma.activitySeries.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => undefined);
                break;
            }
        }
    }
    return { series: due.length, created };
}

/** The owners whose occurrences the nightly may mark: their live connection as `ownerConnectionOf` picks it, usable. */
interface WindowOwner {
    connectionId: string;
    provider: string;
    /** The first-sync backfill's stamp: occurrences that existed before it are backfilled copies (D23). */
    backfilledAt: Date;
}

/**
 * Owners with a usable calendar connection (sync.outbox.ts `ownerConnectionOf`'s rules up front, so occurrences the
 * outbox would skip never fill the batch): the latest live row per user, already backfilled (until then the first-sync
 * backfill copies the occurrences inside the window), its provider switched on, the user active and not a group login.
 */
async function windowOwners(): Promise<Map<string, WindowOwner>> {
    const [{ LIVE_CONNECTION_STATUSES }, { isFakeProviderEnabled }] = await Promise.all([
        import('../calendar-sync/connection.constants.js'),
        import('../calendar-sync/providers/fakeSwitch.js'),
    ]);
    const rows = await prisma.calendarConnection.findMany({
        where: { status: { in: [...LIVE_CONNECTION_STATUSES] } },
        orderBy: [{ enrolledAt: 'desc' }],
        select: { id: true, username: true, provider: true, backfilledAt: true },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!latest.has(row.username.toLowerCase())) latest.set(row.username.toLowerCase(), row);
    const candidates = [...latest.values()].filter((row) => row.backfilledAt);
    if (candidates.length === 0) return new Map();
    const providers = [...new Set(candidates.map((row) => row.provider).filter((provider) => provider !== 'fake'))];
    const enabled = new Set(
        providers.length ? (await prisma.integrationProvider.findMany({ where: { provider: { in: providers }, enabled: true }, select: { provider: true } })).map((p) => p.provider) : [],
    );
    if (isFakeProviderEnabled()) enabled.add('fake');
    const usable = candidates.filter((row) => enabled.has(row.provider));
    if (usable.length === 0) return new Map();
    const users = await prisma.user.findMany({ where: { username: { in: usable.map((row) => row.username) }, isActive: true }, select: { username: true, isGroupUser: true } });
    const active = new Set(users.filter((u) => !u.isGroupUser).map((u) => u.username.toLowerCase()));
    return new Map(
        usable
            .filter((row) => active.has(row.username.toLowerCase()))
            .map((row) => [row.username.toLowerCase(), { connectionId: row.id, provider: row.provider, backfilledAt: row.backfilledAt as Date }]),
    );
}

/** Followup Types never synced (Task, Note, and options whose calendarSync is off): the window queries skip them. */
async function unsyncedTypes(config: ActivityConfig): Promise<string[]> {
    const { isTypeSyncable } = await import('../calendar-sync/sync.outbox.js');
    const off = (config.followupTypes?.options ?? []).filter((o) => !isTypeSyncable(o.value, config)).map((o) => o.value);
    return [...new Set([...ACTIVITY_ONLY_FOLLOWUP_TYPES, ...off])];
}

/**
 * Invitation flood control (design §5): occurrences more than SERIES_SYNC_WINDOW_DAYS ahead are not create-eligible
 * for calendar sync (sync.outbox.ts `isCreateEligible`). Each night (one DB wake shared with the 00:20 job; a few
 * indexed reads when nothing is due):
 * - Occurrences inside the window without a calendar copy (syncable types, owners with a usable connection, at most
 *   SERIES_SYNC_BATCH, earliest first) are marked through the outbox as if just written. The actor is the row's last
 *   editor, or else the series' last writer (D41: a series someone else set up stays a private copy until the owner
 *   sends). An occurrence that existed before its owner's first-sync backfill becomes a backfilled private copy when
 *   it has guests (D23), as the backfill would have made it. One "invitations held" notice per series: none while
 *   another occurrence of it still waits for the owner.
 * - Occurrences whose event is gone (`cancelled` / `removed_remote`, settled while they were outside the window) are
 *   dirtied again, so the push creates or restores them now that they are create-eligible.
 * Then the push is woken.
 */
export async function markSeriesSyncWindow(now = new Date()): Promise<number> {
    const owners = await windowOwners();
    if (owners.size === 0) return 0;
    const config = await loadActivityConfig();
    const until = new Date(now.getTime() + SERIES_SYNC_WINDOW_DAYS * 24 * 60 * 60_000);
    const base = {
        seriesId: { not: null },
        isDeleted: false,
        status: PLANNED_STATUS,
        assignedTo: { in: [...owners.keys()] },
        startAt: { gte: now, lt: until },
        followupType: { notIn: await unsyncedTypes(config) },
    };
    const GONE = ['cancelled', 'removed_remote'];
    const [due, gone] = await Promise.all([
        prisma.activity.findMany({ where: { ...base, externalLinks: { none: { role: 'organizer' } } }, orderBy: [{ startAt: 'asc' }], take: SERIES_SYNC_BATCH, select: { id: true } }),
        prisma.activity.findMany({
            where: { ...base, externalLinks: { some: { role: 'organizer', state: { in: GONE }, dirtyAt: null } } },
            orderBy: [{ startAt: 'asc' }],
            take: SERIES_SYNC_BATCH,
            select: { id: true, startAt: true },
        }),
    ]);
    if (due.length === 0 && gone.length === 0) return 0;
    const { markActivityForSync, isCreateEligible } = await import('../calendar-sync/sync.outbox.js');
    const { requestedIdFor } = await import('../calendar-sync/sync.keys.js');
    const { backfillGuestCount } = await import('../calendar-sync/sync.backfill.js');
    const marked: { after: ActivityRow }[] = [];
    const direct: { id: string; dirtyAt: Date }[] = [];

    // A gone event is re-dirtied only when its link was settled while the occurrence was still outside the window.
    const goneLinks = gone.length
        ? (await prisma.activityExternalLink.findMany({ where: { activityId: { in: gone.map((g) => g.id) }, role: 'organizer', state: { in: GONE }, dirtyAt: null }, select: { id: true, activityId: true, updatedAt: true } })).filter((link) => {
              const start = gone.find((g) => g.id === link.activityId)?.startAt;
              return start ? link.updatedAt.getTime() < start.getTime() - SERIES_SYNC_WINDOW_DAYS * 24 * 60 * 60_000 : false;
          })
        : [];

    // One short transaction for the batch: record locks, a re-read, then the outbox as for any new write.
    await runInTransaction(async (tx) => {
        marked.length = 0;
        direct.length = 0;
        const ids = [...new Set([...due.map((row) => row.id), ...goneLinks.map((link) => link.activityId)])];
        await lockRecords(tx, 'activity', ids);
        for (const link of goneLinks) {
            const { count } = await tx.activityExternalLink.updateMany({ where: { id: link.id, dirtyAt: null }, data: { dirtyAt: now, attempts: 0, nextAttemptAt: null } });
            if (count > 0) direct.push({ id: link.id, dirtyAt: now });
        }
        if (due.length === 0) return;
        // Re-read under the locks: a row that got an organizer link meanwhile is left alone (the outbox would insert a
        // second one for `before = null`; D45 pre-read).
        const rows = await tx.activity.findMany({
            where: { id: { in: due.map((row) => row.id) }, isDeleted: false, status: PLANNED_STATUS, externalLinks: { none: { role: 'organizer' } } },
            include: WITH_ATTENDEES,
        });
        const seriesIds = [...new Set(rows.map((row) => row.seriesId as string))];
        const seriesRows = await tx.activitySeries.findMany({ where: { id: { in: seriesIds } }, select: { id: true, createdBy: true, updatedBy: true } });
        const seriesById = new Map(seriesRows.map((row) => [row.id, row]));
        // Series with a private copy still waiting for its owner: the owner was told already.
        const waiting = new Set(
            (
                await tx.activity.findMany({
                    where: { seriesId: { in: seriesIds }, isDeleted: false, externalLinks: { some: { role: 'organizer', invites: 'withhold' } } },
                    select: { seriesId: true },
                })
            ).map((row) => row.seriesId as string),
        );
        for (const row of rows) {
            const owner = owners.get(row.assignedTo.toLowerCase());
            if (!owner || !isCreateEligible(row, config, now)) continue;
            if (row.createdAt.getTime() <= owner.backfilledAt.getTime()) {
                // Existed before the calendar was connected: the copy the first-sync backfill would have made (D23),
                // stamped like its other copies (sync.view.ts tells the owner why it is private).
                const link = await tx.activityExternalLink.create({
                    data: {
                        activityId: row.id,
                        connectionId: owner.connectionId,
                        provider: owner.provider,
                        role: 'organizer',
                        state: 'pending',
                        invites: backfillGuestCount(row) > 0 ? 'withhold' : 'send',
                        requestedId: requestedIdFor(row.id, owner.connectionId, 0),
                        dirtyAt: now,
                        createdAt: owner.backfilledAt,
                    },
                    select: { id: true },
                });
                direct.push({ id: link.id, dirtyAt: now });
                continue;
            }
            const series = seriesById.get(row.seriesId as string);
            const actor = row.updatedBy ?? series?.updatedBy ?? series?.createdBy ?? row.createdBy;
            const result = await markActivityForSync(tx, { before: null, after: row, actor, now, markSync: true, config });
            if (!result) continue;
            if (waiting.has(row.seriesId as string)) result.notices = [];
            else if (result.notices.length > 0) waiting.add(row.seriesId as string);
            marked.push({ after: row });
        }
    });
    try {
        const { runCalendarPostCommit, wakePushes } = await import('../calendar-sync/sync.wake.js');
        if (marked.length > 0) await runCalendarPostCommit(marked);
        if (direct.length > 0) await wakePushes(direct);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Could not wake the calendar push; the outbox sweep covers it');
    }
    return marked.length + direct.length;
}
