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
 * rows without a slot are deleted; slots on a free day are created (a day holding a deleted, completed, exception or
 * kept row stays as it is). Past and Completed occurrences are never touched. The caller holds the series lock.
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
    const eligible = (row: ActivityRow) =>
        !row.isDeleted && row.status === PLANNED_STATUS && !row.seriesException && !opts.keep.has(row.id) && (row.startAt?.getTime() ?? 0) >= ctx.now.getTime();
    const blocked = new Map<string, ActivityRow[]>();
    const open = new Map<string, ActivityRow>();
    const extra: ActivityRow[] = [];
    for (const row of rows) {
        const day = slotDay(row.originalStartAt);
        if (!eligible(row)) blocked.set(day, [...(blocked.get(day) ?? []), row]);
        else if (day < fromDay || open.has(day)) extra.push(row);
        else open.set(day, row);
    }

    const slots = cancelling ? [] : occurrenceDays(rule, series.startDay, throughDay).filter((slot) => slot.day >= fromDay);
    for (const slot of slots) {
        const times = occurrenceTimes(shape, slot.day);
        if (!times.allDay && times.originalStartAt.getTime() < ctx.now.getTime()) continue;
        const row = open.get(slot.day);
        const blockers = blocked.get(slot.day) ?? [];
        if (row) {
            open.delete(slot.day);
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

    for (const row of cancelling ? [...open.values(), ...extra] : []) {
        const fields = { ...toActivityDto(row), status: opts.status };
        const { input, schedule } = parseOccurrence(fields, ctx.config);
        const writer: ActivityWriter = { actor: ctx.actor, user: null, config: ctx.config, markSync: true };
        const after = await updateActivityRow(tx, row, input, schedule, writer, ctx.now);
        ctx.written.push({ before: row, after, notify: false });
        ctx.counts.updated++;
    }
    if (!cancelling) {
        for (const row of [...open.values(), ...extra]) {
            ctx.written.push(await softDeleteActivityRow(tx, row, actorUser(ctx.actor), ctx.now));
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
        const before = await tx.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES });
        if (!before) throw HttpError.notFound('Activity not found');
        const pivot = before.originalStartAt ?? before.startAt ?? now;
        const pivotDay = slotDay(pivot);
        const updated = await applyCrmUpdate(tx, id, patch, user, config, { seriesException: false });
        assertRepeatable(updated.row);
        const { day: newDay, shape } = shapeOf(updated.row, tz);
        const oldRule = ruleFromColumns(series);
        const template = templateOf(updated.row);
        const cancelled = updated.row.status === 'Cancelled' && before.status !== 'Cancelled';

        if (scope === 'all' && newDay !== slotDay(before.startAt)) throwFieldIssues([{ path: ['startAt'], message: SERIES_MOVE_DAY_MESSAGE }]);

        // "Does not repeat" from here, or Cancelled from here: the series stops after this occurrence.
        if ((repeat.present && repeat.rule === null) || cancelled) {
            const keep = new Set([id]);
            const fromDay = scope === 'all' ? today(now) : pivotDay;
            if (cancelled) {
                await rewriteSeries(tx, series, ctx, { keep, fromDay, status: 'Cancelled' });
            } else {
                // Following: nothing after this one; all: no future occurrence but this one (past ones stay).
                await deleteAfter(tx, series, scope === 'all' ? addDays(today(now), -1) : pivotDay, keep, ctx);
            }
            await tx.activitySeries.update({
                where: { id: seriesId },
                data: {
                    ...(cancelled ? {} : { untilDay: pivotDay > today(now) || scope === 'following' ? pivotDay : today(now), count: null }),
                    endedAt: series.endedAt ?? now,
                    updatedBy: user.username,
                    revision: { increment: 1 },
                },
            });
            await auditSeries(tx, seriesId, 'UPDATE', user.username, {
                scope,
                ...(cancelled ? { status: 'Cancelled' } : { repeat: { from: summarizeRule(oldRule), to: 'Does not repeat' } }),
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
            const slot = occurrenceDays(rule, series.startDay, newDay).find((s) => s.day === newDay);
            const row = await setSeriesColumns(tx, updated.row, seriesColumnsFor(seriesId, occurrenceTimes(shape, newDay), slot?.index ?? before.seriesIndex ?? 1));
            await rewriteSeries(tx, next, ctx, { keep: new Set([id]), fromDay: today(now) });
            await auditSeries(tx, seriesId, 'UPDATE', user.username, {
                scope,
                ...seriesDiff(series, next),
                occurrences: ctx.counts,
            });
            return { existing: updated.existing, row };
        }

        // following: split at this occurrence.
        let rule = askedRule?.rule ?? oldRule;
        if (!askedRule && rule.ends === 'after' && rule.count) rule = { ...rule, count: Math.max(1, rule.count - ((before.seriesIndex ?? 1) - 1)) };
        const oldUntil = addDays(pivotDay, -1);
        const emptied = pivotDay <= series.startDay;
        await tx.activitySeries.update({
            where: { id: seriesId },
            data: emptied
                ? { isDeleted: true, deletedAt: now, endedAt: series.endedAt ?? now, updatedBy: user.username, revision: { increment: 1 } }
                : { untilDay: oldUntil, count: null, endedAt: series.endedAt ?? now, updatedBy: user.username, revision: { increment: 1 } },
        });
        const fresh = await createSeriesRow(tx, { rule, anchorDay: newDay, shape, template, actor: user.username, splitFromId: seriesId });
        await acquireLocks(tx, [seriesLockKey(fresh.id)]);
        // Rows of the old series from this occurrence on move to the new series (bookkeeping, no audit entry each).
        const moving = await tx.activity.findMany({ where: { seriesId, originalStartAt: { gte: pivot } }, select: { id: true } });
        if (moving.length > 0) await tx.activity.updateMany({ where: { id: { in: moving.map((m) => m.id) } }, data: { seriesId: fresh.id } });
        const row = await setSeriesColumns(tx, updated.row, seriesColumnsFor(fresh.id, occurrenceTimes(shape, newDay), 1));
        await rewriteSeries(tx, fresh, ctx, { keep: new Set([id]), fromDay: newDay, sweepFromDay: pivotDay });
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

/** Deletes the live, non-completed occurrences of `series` after `untilDay` (except `keep`). */
async function deleteAfter(tx: TransactionClient, series: ActivitySeries, untilDay: string, keep: ReadonlySet<string>, ctx: SeriesContext): Promise<void> {
    const from = zonedStartOfDay(addDays(untilDay, 1), series.timeZone);
    const ids = (await tx.activity.findMany({ where: { seriesId: series.id, isDeleted: false, status: { not: 'Completed' }, originalStartAt: { gte: from } }, select: { id: true } }))
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
 * SERIES_HORIZON_DAYS (oldest horizon first), one short transaction each under the series lock. A unique-index race
 * (another process created a slot first) aborts that series' transaction; it is run once more from the start (D45),
 * then left for the next night.
 */
export async function extendSeriesHorizons(now = new Date()): Promise<{ series: number; created: number }> {
    const through = horizonDay(now);
    const due = await prisma.activitySeries.findMany({
        where: { isDeleted: false, endedAt: null, OR: [{ materializedThrough: null }, { materializedThrough: { lt: through } }] },
        orderBy: [{ materializedThrough: 'asc' }],
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
                    // D41: the occurrences are written as the person who last set the series up.
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
                logger.warn({ err: (err as Error).message, seriesId: id }, 'Could not extend the recurring series; the next night tries again');
                break;
            }
        }
    }
    return { series: due.length, created };
}

/**
 * Invitation flood control (design §5): occurrences more than SERIES_SYNC_WINDOW_DAYS ahead are not create-eligible
 * for calendar sync (sync.outbox.ts `isCreateEligible`). Each night, the occurrences that came inside the window
 * without a calendar copy (owners with a live calendar connection only, at most SERIES_SYNC_BATCH) are marked for
 * sync through the outbox as their last writer (D41) and the push is woken.
 */
export async function markSeriesSyncWindow(now = new Date()): Promise<number> {
    const { LIVE_CONNECTION_STATUSES } = await import('../calendar-sync/connection.constants.js');
    const owners = await prisma.calendarConnection.findMany({ where: { status: { in: [...LIVE_CONNECTION_STATUSES] } }, select: { username: true } });
    if (owners.length === 0) return 0;
    const until = new Date(now.getTime() + SERIES_SYNC_WINDOW_DAYS * 24 * 60 * 60_000);
    const due = await prisma.activity.findMany({
        where: {
            seriesId: { not: null },
            isDeleted: false,
            status: PLANNED_STATUS,
            assignedTo: { in: [...new Set(owners.map((o) => o.username))] },
            startAt: { gte: now, lt: until },
            externalLinks: { none: { role: 'organizer' } },
        },
        orderBy: [{ startAt: 'asc' }],
        take: SERIES_SYNC_BATCH,
        select: { id: true },
    });
    if (due.length === 0) return 0;
    const config = await loadActivityConfig();
    const { markActivityForSync } = await import('../calendar-sync/sync.outbox.js');
    const marked: { after: ActivityRow }[] = [];
    // One short transaction for the batch: record locks, a re-read, then the outbox as for any new write.
    await runInTransaction(async (tx) => {
        marked.length = 0;
        const ids = due.map((row) => row.id);
        await lockRecords(tx, 'activity', ids);
        // Re-read under the locks: a row that got an organizer link meanwhile is left alone (the outbox would insert a
        // second one for `before = null`; D45 pre-read).
        const rows = await tx.activity.findMany({
            where: { id: { in: ids }, isDeleted: false, status: PLANNED_STATUS, externalLinks: { none: { role: 'organizer' } } },
            include: WITH_ATTENDEES,
        });
        for (const row of rows) {
            const result = await markActivityForSync(tx, { before: null, after: row, actor: row.updatedBy ?? row.createdBy, now, markSync: true, config });
            if (result) marked.push({ after: row });
        }
    });
    if (marked.length > 0) {
        try {
            const { runCalendarPostCommit } = await import('../calendar-sync/sync.wake.js');
            await runCalendarPostCommit(marked);
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Could not wake the calendar push; the outbox sweep covers it');
        }
    }
    return marked.length;
}
