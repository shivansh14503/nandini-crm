import { ENV } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { fromDateOnly, fromWallClock, toDateOnly } from '../../utils/mappers.js';
import { fakeUtcToInstant, instantToZonedWallClock, zonedDayOf, zonedStartOfDay, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import { parseTimeOfDay } from '../../validators/notInPast.js';
import { buildAccessScopeWhere } from '../shared/accessControl.js';
import { loadRatingConfig } from '../leads/lead.followUp.js';
import { CLOSED_SALES_STAGES } from '../opportunities/opportunity.validator.js';
import { activityScopeWhere, canEditActivity, myResponseOf } from './activity.access.js';
import { allDayRange } from './activity.mapper.js';
import { ACTIVITY_MAX_DURATION_DAYS, NOTE_TYPE, PLANNED_STATUS } from './activity.schedule.js';
import { CALENDAR_DEFAULT_STATUSES, CALENDAR_SOURCES, type CalendarQuery, type CalendarSource } from './activity.validator.js';

/**
 * `GET /api/activities/calendar`: one feed of everything with a time in a window `[from, to)`: activities, plus the
 * lead / opportunity next follow-ups and contract renewal reminders those modules already store (read only, never
 * written). The where builders and row → item mappers are pure, so the rules are tested without a database.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows read per source; a source that hits its cap sets `truncated`. */
export const CALENDAR_CAPS: Readonly<Record<CalendarSource, number>> = {
    activity: 2000,
    leadFollowup: 1000,
    opportunityFollowup: 1000,
    contractRenewal: 1000,
};
export const CONTRACT_EXPIRED_STATUS = 'Expired';

export type CalendarModule = 'activities' | 'leads' | 'opportunities' | 'contracts';

export interface CalendarItem {
    /** `<source>:<record id>`, unique in a feed. */
    key: string;
    source: CalendarSource;
    module: CalendarModule;
    recordId: string;
    title: string;
    followupType: string | null;
    /** ISO instant. */
    start: string;
    /** ISO instant, null for follow-ups and renewals (a point in time). All-day: exclusive midnight. */
    end: string | null;
    allDay: boolean;
    /** All-day items: inclusive first / last day in the business timezone; null otherwise. */
    startDay: string | null;
    endDay: string | null;
    status: string;
    assignedTo: string;
    /** The record the item is about: activities their related record ('' when none), derived items their own. */
    relatedModule: string;
    relatedId: string;
    relatedTo: string;
    location: string;
    attendeeCount: number;
    /** The caller's reply when invited to the activity, else null. */
    myResponse: string | null;
    /** True when the caller may reschedule it here (activities they may edit). */
    editable: boolean;
    overdue: boolean;
}

export interface CalendarFeed {
    timeZone: string;
    from: string;
    to: string;
    /** True when a source had more rows than it returns. */
    truncated: boolean;
    items: CalendarItem[];
}

// ── Ranges ───────────────────────────────────────────────────────────────────

/**
 * Activities overlapping `[from, to)`. `startAt` is bounded from below by `from − ACTIVITY_MAX_DURATION_DAYS` (no
 * activity lasts longer), which turns the `[isDeleted, startAt]` index seek into a bounded range; the second arm keeps
 * zero-length items (an Email, a Task) that sit exactly at `from`.
 */
export function activityRangeWhere(from: Date, to: Date): Prisma.ActivityWhereInput {
    return {
        startAt: { gte: new Date(from.getTime() - ACTIVITY_MAX_DURATION_DAYS * DAY_MS), lt: to },
        OR: [{ endAt: { gt: from } }, { startAt: { gte: from } }],
    };
}

/** What `activityRangeWhere` selects, for one item (`end` null = zero length). */
export function overlaps(start: Date, end: Date | null, from: Date, to: Date): boolean {
    return start < to && ((end ?? start) > from || start >= from);
}

/** Lead / opportunity `nextFollowupDate` (a DATE) of the business-timezone days `[from, to)` touches. */
export function followupDayRange(from: Date, to: Date, timeZone: string): { gte: Date; lte: Date } {
    return { gte: fromDateOnly(zonedDayOf(from, timeZone)), lte: fromDateOnly(zonedDayOf(new Date(to.getTime() - 1), timeZone)) };
}

/** `Contract.renewalReminderDate` (fake-UTC wall clock) of `[from, to)`. */
export function renewalRange(from: Date, to: Date, timeZone: string): { gte: Date; lt: Date } {
    return { gte: fromWallClock(instantToZonedWallClock(from, timeZone)), lt: fromWallClock(instantToZonedWallClock(to, timeZone)) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * When a lead / opportunity follow-up happens: its date at its 12-hour time (`11:00 AM`) in the business timezone,
 * or the whole day when the time is missing or unreadable.
 */
export function followUpSlotInstant(date: Date, time: string | null | undefined, timeZone: string): { start: Date; allDay: boolean; day: string } {
    const day = toDateOnly(date);
    const minutes = parseTimeOfDay(time);
    if (minutes === null) return { start: zonedStartOfDay(day, timeZone), allDay: true, day };
    return { start: zonedWallClockToInstant(`${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`, timeZone), allDay: false, day };
}

// ── Where builders ───────────────────────────────────────────────────────────

export interface CalendarFilters {
    /** Owners / invited colleagues to show. */
    users: readonly string[];
    types?: readonly string[];
    /** Activity statuses. */
    statuses: readonly string[];
}

export function activityCalendarWhere(user: AuthUser, filters: CalendarFilters, from: Date, to: Date): Prisma.ActivityWhereInput {
    const and: Prisma.ActivityWhereInput[] = [
        { isDeleted: false },
        activityScopeWhere(user),
        { followupType: { not: NOTE_TYPE } },
        { OR: [{ assignedTo: { in: [...filters.users] } }, { attendees: { some: { username: { in: [...filters.users] } } } }] },
        { status: { in: [...filters.statuses] } },
        activityRangeWhere(from, to),
    ];
    if (filters.types?.length) and.push({ followupType: { in: [...filters.types] } });
    return { AND: and };
}

/**
 * Bounds on a lead / opportunity `nextFollowupDate` (DATE): the calendar passes a window (`gte` / `lte`), the morning
 * summary one day or "before today" (`lt`).
 */
export interface FollowupDayFilter {
    gte?: Date;
    lte?: Date;
    lt?: Date;
}

/** Open leads (no closing status: Converted and every "Closes the lead" status) with a follow-up in the window. */
export function leadFollowupWhere(
    user: AuthUser,
    filters: Pick<CalendarFilters, 'users' | 'types'>,
    closingStatuses: ReadonlySet<string>,
    days: FollowupDayFilter,
): Prisma.LeadWhereInput {
    const and: Prisma.LeadWhereInput[] = [
        { isDeleted: false },
        buildAccessScopeWhere(user, 'assignedTo'),
        { assignedTo: { in: [...filters.users] } },
        { status: { notIn: [...closingStatuses] } },
        { nextFollowupDate: days },
    ];
    if (filters.types?.length) and.push({ followupType: { in: [...filters.types] } });
    return { AND: and };
}

/** Open opportunities (not Closed Won / Lost) with a follow-up in the window. */
export function opportunityFollowupWhere(user: AuthUser, filters: Pick<CalendarFilters, 'users' | 'types'>, days: FollowupDayFilter): Prisma.OpportunityWhereInput {
    const and: Prisma.OpportunityWhereInput[] = [
        { isDeleted: false },
        buildAccessScopeWhere(user, 'assignedTo'),
        { assignedTo: { in: [...filters.users] } },
        { salesStage: { notIn: [...CLOSED_SALES_STAGES] } },
        { nextFollowupDate: days },
    ];
    if (filters.types?.length) and.push({ followupType: { in: [...filters.types] } });
    return { AND: and };
}

/** Contracts (not Expired) whose renewal reminder falls in the window. Followup Types don't apply. */
export function contractRenewalWhere(user: AuthUser, filters: Pick<CalendarFilters, 'users'>, range: { gte: Date; lt: Date }): Prisma.ContractWhereInput {
    return {
        AND: [
            { isDeleted: false },
            buildAccessScopeWhere(user, 'assignedTo'),
            { assignedTo: { in: [...filters.users] } },
            { status: { not: CONTRACT_EXPIRED_STATUS } },
            { renewalReminderDate: range },
        ],
    };
}

// ── Items ────────────────────────────────────────────────────────────────────

export const ACTIVITY_CALENDAR_SELECT = {
    id: true,
    subject: true,
    followupType: true,
    status: true,
    startAt: true,
    endAt: true,
    allDay: true,
    timeZone: true,
    assignedTo: true,
    createdBy: true,
    relatedModule: true,
    relatedId: true,
    relatedTo: true,
    location: true,
    attendees: { select: { kind: true, username: true, responseStatus: true } },
} as const;

export interface ActivityCalendarRow {
    id: string;
    subject: string;
    followupType: string;
    status: string;
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
    timeZone: string;
    assignedTo: string;
    createdBy: string;
    relatedModule: string | null;
    relatedId: string | null;
    relatedTo: string | null;
    location: string | null;
    attendees: { kind: string; username: string | null; responseStatus: string }[];
}

export function activityToCalendarItem(row: ActivityCalendarRow, user: AuthUser, now: Date): CalendarItem {
    const start = row.startAt ?? now;
    const days = row.allDay ? allDayRange(start, row.endAt, row.timeZone) : null;
    return {
        key: `activity:${row.id}`,
        source: 'activity',
        module: 'activities',
        recordId: row.id,
        title: row.subject,
        followupType: row.followupType,
        start: start.toISOString(),
        end: row.endAt ? row.endAt.toISOString() : null,
        allDay: row.allDay,
        startDay: days?.startDay ?? null,
        endDay: days?.endDay ?? null,
        status: row.status,
        assignedTo: row.assignedTo,
        relatedModule: row.relatedModule ?? '',
        relatedId: row.relatedId ?? '',
        relatedTo: row.relatedTo ?? '',
        location: row.location ?? '',
        attendeeCount: row.attendees.length,
        myResponse: myResponseOf(user, row),
        editable: canEditActivity(user, row),
        overdue: row.status === PLANNED_STATUS && (row.endAt ?? start) < now,
    };
}

/** A follow-up slot is overdue once it has passed (an all-day one once its day has). */
const slotOverdue = (slot: { start: Date; allDay: boolean; day: string }, now: Date, timeZone: string) =>
    slot.allDay ? slot.day < zonedDayOf(now, timeZone) : slot.start < now;

interface FollowupFields {
    id: string;
    followupType: string | null;
    assignedTo: string;
    nextFollowupDate: Date | null;
    nextFollowupTime: string | null;
}

function followupItem(
    source: 'leadFollowup' | 'opportunityFollowup',
    module: 'leads' | 'opportunities',
    row: FollowupFields,
    fields: { title: string; status: string; code: string },
    timeZone: string,
    now: Date,
): CalendarItem {
    const slot = followUpSlotInstant(row.nextFollowupDate ?? now, row.nextFollowupTime, timeZone);
    return {
        key: `${source}:${row.id}`,
        source,
        module,
        recordId: row.id,
        title: fields.title,
        followupType: row.followupType || null,
        start: slot.start.toISOString(),
        end: null,
        allDay: slot.allDay,
        startDay: slot.allDay ? slot.day : null,
        endDay: slot.allDay ? slot.day : null,
        status: fields.status,
        assignedTo: row.assignedTo,
        relatedModule: module,
        relatedId: row.id,
        relatedTo: fields.code,
        location: '',
        attendeeCount: 0,
        myResponse: null,
        editable: false,
        overdue: slotOverdue(slot, now, timeZone),
    };
}

export const LEAD_FOLLOWUP_SELECT = {
    id: true,
    leadCode: true,
    name: true,
    organizationName: true,
    followupType: true,
    status: true,
    assignedTo: true,
    nextFollowupDate: true,
    nextFollowupTime: true,
} as const;

export function leadFollowupToCalendarItem(
    row: FollowupFields & { leadCode: string; name: string; organizationName: string | null; status: string },
    timeZone: string,
    now: Date,
): CalendarItem {
    const title = row.organizationName ? `${row.name} · ${row.organizationName}` : row.name;
    return followupItem('leadFollowup', 'leads', row, { title, status: row.status, code: row.leadCode }, timeZone, now);
}

export const OPPORTUNITY_FOLLOWUP_SELECT = {
    id: true,
    opportunityCode: true,
    opportunityName: true,
    organizationName: true,
    followupType: true,
    salesStage: true,
    assignedTo: true,
    nextFollowupDate: true,
    nextFollowupTime: true,
} as const;

export function opportunityFollowupToCalendarItem(
    row: FollowupFields & { opportunityCode: string; opportunityName: string | null; organizationName: string; salesStage: string },
    timeZone: string,
    now: Date,
): CalendarItem {
    return followupItem(
        'opportunityFollowup',
        'opportunities',
        row,
        { title: row.opportunityName || row.organizationName, status: row.salesStage, code: row.opportunityCode },
        timeZone,
        now,
    );
}

export const CONTRACT_RENEWAL_SELECT = {
    id: true,
    contractNumber: true,
    contractTitle: true,
    organizationName: true,
    status: true,
    assignedTo: true,
    renewalReminderDate: true,
} as const;

export function contractRenewalToCalendarItem(
    row: { id: string; contractNumber: string; contractTitle: string; organizationName: string; status: string; assignedTo: string; renewalReminderDate: Date | null },
    timeZone: string,
    now: Date,
): CalendarItem {
    const start = row.renewalReminderDate ? fakeUtcToInstant(row.renewalReminderDate, timeZone) : now;
    return {
        key: `contractRenewal:${row.id}`,
        source: 'contractRenewal',
        module: 'contracts',
        recordId: row.id,
        title: `Renewal: ${row.contractTitle} · ${row.organizationName}`,
        followupType: null,
        start: start.toISOString(),
        end: null,
        allDay: false,
        startDay: null,
        endDay: null,
        status: row.status,
        assignedTo: row.assignedTo,
        relatedModule: 'contracts',
        relatedId: row.id,
        relatedTo: row.contractNumber,
        location: '',
        attendeeCount: 0,
        myResponse: null,
        editable: false,
        overdue: false,
    };
}

/** One list sorted by start, then key; `truncated` when any source was cut at its cap. */
export function mergeCalendarItems(sources: readonly { items: readonly CalendarItem[]; truncated: boolean }[]): { items: CalendarItem[]; truncated: boolean } {
    const items = sources.flatMap((source) => source.items);
    items.sort((a, b) => (a.start === b.start ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.start < b.start ? -1 : 1));
    return { items, truncated: sources.some((source) => source.truncated) };
}

/** Rows up to `cap`, and whether there were more (the query reads `cap + 1`). */
export function capRows<T>(rows: readonly T[], cap: number): { rows: T[]; truncated: boolean } {
    return rows.length > cap ? { rows: rows.slice(0, cap), truncated: true } : { rows: [...rows], truncated: false };
}

// ── Feed ─────────────────────────────────────────────────────────────────────

const empty = { items: [] as CalendarItem[], truncated: false };

export async function calendarFeed(query: CalendarQuery, user: AuthUser, now = new Date()): Promise<CalendarFeed> {
    const timeZone = ENV.BUSINESS_TIMEZONE;
    const from = new Date(query.from);
    const to = new Date(query.to);
    const sources = new Set<CalendarSource>(query.sources?.length ? query.sources : CALENDAR_SOURCES);
    const filters: CalendarFilters = {
        users: query.users?.length ? query.users : [user.username],
        types: query.types?.length ? query.types : undefined,
        statuses: query.status?.length ? query.status : CALENDAR_DEFAULT_STATUSES,
    };
    const days = followupDayRange(from, to, timeZone);

    const [activities, leads, opportunities, contracts] = await Promise.all([
        sources.has('activity')
            ? prisma.activity
                  .findMany({
                      where: activityCalendarWhere(user, filters, from, to),
                      select: ACTIVITY_CALENDAR_SELECT,
                      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
                      take: CALENDAR_CAPS.activity + 1,
                  })
                  .then((rows) => {
                      const capped = capRows(rows, CALENDAR_CAPS.activity);
                      return { items: capped.rows.map((row) => activityToCalendarItem(row, user, now)), truncated: capped.truncated };
                  })
            : empty,
        sources.has('leadFollowup')
            ? loadRatingConfig(prisma).then(async ({ closingStatuses }) => {
                  const rows = await prisma.lead.findMany({
                      where: leadFollowupWhere(user, filters, closingStatuses, days),
                      select: LEAD_FOLLOWUP_SELECT,
                      orderBy: [{ nextFollowupDate: 'asc' }, { id: 'asc' }],
                      take: CALENDAR_CAPS.leadFollowup + 1,
                  });
                  const capped = capRows(rows, CALENDAR_CAPS.leadFollowup);
                  return { items: capped.rows.map((row) => leadFollowupToCalendarItem(row, timeZone, now)), truncated: capped.truncated };
              })
            : empty,
        sources.has('opportunityFollowup')
            ? prisma.opportunity
                  .findMany({
                      where: opportunityFollowupWhere(user, filters, days),
                      select: OPPORTUNITY_FOLLOWUP_SELECT,
                      orderBy: [{ nextFollowupDate: 'asc' }, { id: 'asc' }],
                      take: CALENDAR_CAPS.opportunityFollowup + 1,
                  })
                  .then((rows) => {
                      const capped = capRows(rows, CALENDAR_CAPS.opportunityFollowup);
                      return { items: capped.rows.map((row) => opportunityFollowupToCalendarItem(row, timeZone, now)), truncated: capped.truncated };
                  })
            : empty,
        sources.has('contractRenewal')
            ? prisma.contract
                  .findMany({
                      where: contractRenewalWhere(user, filters, renewalRange(from, to, timeZone)),
                      select: CONTRACT_RENEWAL_SELECT,
                      orderBy: [{ renewalReminderDate: 'asc' }, { id: 'asc' }],
                      take: CALENDAR_CAPS.contractRenewal + 1,
                  })
                  .then((rows) => {
                      const capped = capRows(rows, CALENDAR_CAPS.contractRenewal);
                      return { items: capped.rows.map((row) => contractRenewalToCalendarItem(row, timeZone, now)), truncated: capped.truncated };
                  })
            : empty,
    ]);

    const merged = mergeCalendarItems([activities, leads, opportunities, contracts]);
    return { timeZone, from: from.toISOString(), to: to.toISOString(), truncated: merged.truncated, items: merged.items };
}
