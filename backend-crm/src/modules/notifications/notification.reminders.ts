import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { isQueueAvailable, remindersQueue, tryEnqueue } from '../../jobs/queues.js';
import type { AuthUser } from '../../types/user.types.js';
import { fromWallClock, toWallClock } from '../../utils/mappers.js';
import { fakeUtcToInstant, instantToZonedWallClock, zonedDayOf } from '../../utils/zonedTime.js';
import { allDayRange } from '../activities/activity.mapper.js';
import { NOTE_TYPE, PLANNED_STATUS, TASK_TYPE } from '../activities/activity.schedule.js';
import { CONTRACT_EXPIRED_STATUS } from '../activities/activity.calendar.js';
import { formatDay, formatTime, joinParts, onDay, relatedLabel, relativeDayWord, relativeTime } from './notification.format.js';
import { insertMissingNotifications, invalidateAllUnreadCounts, invalidateUnreadCounts, notify, type NotificationInput } from './notification.producer.js';

/**
 * Activity reminders, assignment / invitation notices and contract renewal reminders (docs/system-design.md §5).
 *
 * The database is touched only when something is due: each activity reminder is a BullMQ delayed job firing at its
 * `remindAt` (`scheduleActivityReminder`, after every committed save), a sweep runs every 15 minutes in business
 * hours as the safety net and for contract renewals, and a nightly job purges old rows and re-arms pending jobs.
 * Delivery is at-least-once with idempotent keys: a reminder is claimed (`Activity.reminderSentAt`) in the same
 * transaction that inserts its notifications, and every notification has a unique dedupe key.
 *
 * The helpers at the top are pure (tested without a database); the rest take the Prisma client as a parameter so
 * tests can pass a double.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A reminder more than this late for an activity that has already ended is claimed without notifying. */
export const STALE_REMINDER_MS = 6 * 60 * MINUTE_MS;
/** Contract renewal reminders up to this many days old are still delivered (first deploy / downtime catch-up). */
export const RENEWAL_WINDOW_DAYS = 7;
/** Due activities read per sweep batch, and at most this many batches per sweep. */
export const SWEEP_BATCH = 200;
export const SWEEP_MAX_BATCHES = 10;
/** Contracts read per sweep. */
export const RENEWAL_SWEEP_CAP = 1000;
/** Pending reminders re-armed per query. */
export const ARM_BATCH = 500;
/** Rows deleted per statement by the retention purge, and at most this many batches per table per night. */
export const PURGE_BATCH = 1000;
const PURGE_MAX_BATCHES = 200;
/** Times a delivery re-reads the activity after losing the claim to a concurrent edit. */
const CLAIM_ATTEMPTS = 3;

export const DECLINED = 'declined';
/** Who caused system notifications. */
export const SYSTEM_ACTOR = 'system';

const userKey = (username: string | null | undefined) => (username ?? '').trim().toLowerCase();
const sameUser = (a: string | null | undefined, b: string | null | undefined) => userKey(a) !== '' && userKey(a) === userKey(b);

// ── Recipients ───────────────────────────────────────────────────────────────

/** What recipients are computed from. */
export interface ReminderAudience {
    assignedTo: string;
    attendees: readonly { kind: string; username: string | null; responseStatus: string }[];
}

/** Usernames to look up: the owner and the invited colleagues who haven't declined. */
export function reminderCandidates(activity: ReminderAudience): string[] {
    const names = [activity.assignedTo];
    for (const attendee of activity.attendees) {
        if (attendee.kind === 'user' && attendee.username && attendee.responseStatus !== DECLINED) names.push(attendee.username);
    }
    const unique = new Map<string, string>();
    for (const name of names) {
        // The first spelling wins (the owner's, then the invitation's).
        if (userKey(name) !== '' && !unique.has(userKey(name))) unique.set(userKey(name), name);
    }
    return [...unique.values()];
}

/**
 * Who gets an activity reminder: the owner plus colleagues invited who haven't declined, active users only, each
 * once (usernames compare case-insensitively; the spelling of the user account is kept).
 */
export function reminderRecipients(activity: ReminderAudience, activeUsernames: readonly string[]): string[] {
    const active = new Map(activeUsernames.map((name) => [userKey(name), name]));
    const out = new Map<string, string>();
    for (const candidate of reminderCandidates(activity)) {
        const canonical = active.get(userKey(candidate));
        if (canonical && !out.has(userKey(candidate))) out.set(userKey(candidate), canonical);
    }
    return [...out.values()];
}

// ── Due / stale policy ───────────────────────────────────────────────────────

export interface ReminderState {
    followupType: string;
    status: string;
    isDeleted: boolean;
    remindAt: Date | null;
    reminderSentAt: Date | null;
}

/** True when the reminder should go out now: live, Planned, not a Note, not yet sent, `remindAt` reached. */
export function isReminderDue(row: ReminderState, now: Date): boolean {
    return (
        !row.isDeleted &&
        row.status === PLANNED_STATUS &&
        row.followupType !== NOTE_TYPE &&
        row.reminderSentAt === null &&
        row.remindAt !== null &&
        row.remindAt.getTime() <= now.getTime()
    );
}

/**
 * A reminder found more than 6 hours late for an activity that has already ended (downtime catch-up) is claimed
 * without notifying, so a restart after an outage doesn't send a burst of reminders for meetings long over.
 */
export function isStaleReminder(row: { remindAt: Date | null; startAt: Date | null; endAt: Date | null }, now: Date): boolean {
    if (!row.remindAt) return false;
    const ended = row.endAt ?? row.startAt ?? row.remindAt;
    return now.getTime() - row.remindAt.getTime() > STALE_REMINDER_MS && ended.getTime() < now.getTime();
}

// ── Keys ─────────────────────────────────────────────────────────────────────

/** One reminder per activity, reminder time and recipient: a reschedule is a new reminder. */
export const reminderKey = (activityId: string, remindAt: Date, username: string) => `activity_reminder:${activityId}:${remindAt.getTime()}:${userKey(username)}`;
/** One per save (its `updatedAt`): a B → C → B reassignment tells B twice. */
export const assignmentKey = (activityId: string, updatedAt: Date, username: string) => `activity_assigned:${activityId}:${updatedAt.getTime()}:${userKey(username)}`;
export const invitationKey = (activityId: string, updatedAt: Date, username: string) => `activity_invited:${activityId}:${updatedAt.getTime()}:${userKey(username)}`;
/** One per contract, reminder date-time (wall clock) and recipient: a changed reminder date is a new reminder. */
export const contractRenewalKey = (contractId: string, renewalWallClock: string, username: string) =>
    `contract_renewal:${contractId}:${renewalWallClock}:${userKey(username)}`;
/** BullMQ job id of an activity's reminder (hyphens only: BullMQ ids may not contain `:`). */
export const reminderJobId = (activityId: string, remindAt: Date) => `reminder-${activityId}-${remindAt.getTime()}`;

// ── Texts ────────────────────────────────────────────────────────────────────

/** The activity columns the texts read. */
export interface ActivityTextRow {
    id: string;
    subject: string;
    followupType: string;
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
    timeZone: string;
    location: string | null;
    relatedTo: string | null;
    relatedCode: string | null;
}

export interface NotificationText {
    title: string;
    body: string;
}

const relatedPart = (row: ActivityTextRow) => {
    const label = relatedLabel(row);
    return label ? `Related to ${label}` : '';
};

/** `Today, 10:30 AM`, `Thu 26 Nov, 10:30 AM`, `All day tomorrow`, `All day, Thu 26 Nov – Sat 28 Nov`; '' for Notes. */
export function activityWhen(row: ActivityTextRow, now: Date): string {
    if (!row.startAt) return '';
    const today = zonedDayOf(now, row.timeZone);
    if (row.allDay) {
        const { startDay, endDay } = allDayRange(row.startAt, row.endAt, row.timeZone);
        if (startDay === endDay) {
            const word = relativeDayWord(startDay, today);
            return word === 'today' || word === 'tomorrow' || word === 'yesterday' ? `All day ${word}` : `All day, ${word}`;
        }
        return `All day, ${formatDay(startDay)} – ${formatDay(endDay)}`;
    }
    const word = relativeDayWord(zonedDayOf(row.startAt, row.timeZone), today);
    const day = word.charAt(0).toUpperCase() + word.slice(1);
    return `${day}, ${formatTime(row.startAt, row.timeZone)}`;
}

/**
 * `Reminder: Demo with ACME` / `Starts at 10:30 AM (in 15 min) · Office · Related to LD-0012 Ramesh`. Tasks are
 * "Due"; all-day activities say the day.
 */
export function reminderText(row: ActivityTextRow, now: Date): NotificationText {
    let when = '';
    if (row.startAt) {
        const today = zonedDayOf(now, row.timeZone);
        if (row.allDay) {
            when = `All day ${onDay(allDayRange(row.startAt, row.endAt, row.timeZone).startDay, today)}`;
        } else {
            const day = zonedDayOf(row.startAt, row.timeZone);
            const verb = row.followupType === TASK_TYPE ? 'Due' : 'Starts';
            const on = day === today ? '' : `${onDay(day, today)} `;
            when = `${verb} ${on}at ${formatTime(row.startAt, row.timeZone)} (${relativeTime(row.startAt, now)})`;
        }
    }
    return { title: `Reminder: ${row.subject}`, body: joinParts([when, row.location, relatedPart(row)]) };
}

/** `Assigned to you: Demo with ACME` / `Meeting · Thu 26 Nov, 10:30 AM · Related to … · by Palak Sharma`. */
export function assignmentText(row: ActivityTextRow, actorName: string, now: Date): NotificationText {
    return {
        title: `Assigned to you: ${row.subject}`,
        body: joinParts([row.followupType, activityWhen(row, now), relatedPart(row), actorName ? `by ${actorName}` : '']),
    };
}

/** `Invitation: Demo with ACME` / `Thu 26 Nov, 10:30 AM · Office · Related to … · from Palak Sharma`. */
export function invitationText(row: ActivityTextRow, actorName: string, now: Date): NotificationText {
    return {
        title: `Invitation: ${row.subject}`,
        body: joinParts([activityWhen(row, now), row.location, relatedPart(row), actorName ? `from ${actorName}` : '']),
    };
}

export interface RenewalTextRow {
    id: string;
    contractNumber: string;
    contractTitle: string;
    organizationName: string;
    renewalReminderDate: Date | null;
}

/** `Contract renewal due: Tally TSS 2026` / `CON-0007 · ACME LTD · Reminder set for Wed 25 Nov, 10:00 AM`. */
export function contractRenewalText(row: RenewalTextRow, timeZone: string): NotificationText {
    const due = row.renewalReminderDate ? fakeUtcToInstant(row.renewalReminderDate, timeZone) : null;
    return {
        title: `Contract renewal due: ${row.contractTitle}`,
        body: joinParts([
            row.contractNumber,
            row.organizationName,
            due ? `Reminder set for ${formatDay(zonedDayOf(due, timeZone))}, ${formatTime(due, timeZone)}` : '',
        ]),
    };
}

// ── Assignment / invitation plan ─────────────────────────────────────────────

/** The activity columns `notifyActivityParticipants` reads (the service's internal rows, attendees included). */
export interface ParticipantRow extends ActivityTextRow {
    status: string;
    assignedTo: string;
    isDeleted: boolean;
    updatedAt: Date;
    attendees: readonly { kind: string; username: string | null }[];
}

export interface ParticipantPlan {
    /** New owner to tell, when someone else made them the owner. */
    assignee: string | null;
    /** Colleagues newly invited by someone else (Planned, non-Note activities only). */
    invitees: string[];
}

/**
 * Who to tell after a committed save (`before` null on create): the new owner when the save gave the activity to
 * someone other than the actor, and colleagues added as attendees by someone else, while the activity is Planned.
 */
export function planParticipantNotifications(before: ParticipantRow | null, after: ParticipantRow, actor: string): ParticipantPlan {
    if (after.isDeleted) return { assignee: null, invitees: [] };
    const ownerChanged = !before || !sameUser(before.assignedTo, after.assignedTo);
    const assignee = ownerChanged && !sameUser(after.assignedTo, actor) ? after.assignedTo : null;

    if (after.followupType === NOTE_TYPE || after.status !== PLANNED_STATUS) return { assignee, invitees: [] };
    const previous = new Set((before?.attendees ?? []).filter((a) => a.kind === 'user').map((a) => userKey(a.username)));
    const invitees = new Map<string, string>();
    for (const attendee of after.attendees) {
        if (attendee.kind !== 'user' || !attendee.username) continue;
        const key = userKey(attendee.username);
        if (previous.has(key) || sameUser(attendee.username, actor) || sameUser(attendee.username, after.assignedTo)) continue;
        invitees.set(key, attendee.username);
    }
    return { assignee, invitees: [...invitees.values()] };
}

// ── Contract renewal window ──────────────────────────────────────────────────

/**
 * Contracts whose renewal reminder (a business-timezone wall clock stored as fake UTC) fell in the last 7 days up to
 * now, not Expired, not deleted. Compared as wall clocks; the Contract table is only read.
 */
export function renewalSweepWhere(nowWall: Date): Prisma.ContractWhereInput {
    return {
        isDeleted: false,
        status: { not: CONTRACT_EXPIRED_STATUS },
        renewalReminderDate: { gt: new Date(nowWall.getTime() - RENEWAL_WINDOW_DAYS * DAY_MS), lte: nowWall },
    };
}

/** Rows the retention purge deletes: read and older than `days`, or older than twice that. */
export function notificationPurgeWhere(now: Date, days: number): Prisma.NotificationWhereInput {
    return {
        OR: [
            { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - days * DAY_MS) } },
            { createdAt: { lt: new Date(now.getTime() - 2 * days * DAY_MS) } },
        ],
    };
}

/** Activities whose reminder is due and unsent (index `[reminderSentAt, remindAt]`). */
export function dueRemindersWhere(now: Date): Prisma.ActivityWhereInput {
    return { reminderSentAt: null, remindAt: { lte: now }, isDeleted: false, status: PLANNED_STATUS };
}

// ── Database ─────────────────────────────────────────────────────────────────

/** The Prisma client (a test double in tests). */
export type ReminderDb = typeof prisma;

async function activeUsernames(db: ReminderDb, candidates: readonly string[]): Promise<string[]> {
    if (candidates.length === 0) return [];
    const rows = await db.user.findMany({ where: { username: { in: [...candidates] }, isActive: true }, select: { username: true } });
    return rows.map((row) => row.username);
}

const DELIVERY_SELECT = {
    id: true,
    subject: true,
    followupType: true,
    status: true,
    assignedTo: true,
    startAt: true,
    endAt: true,
    allDay: true,
    timeZone: true,
    location: true,
    relatedTo: true,
    relatedCode: true,
    remindAt: true,
    reminderSentAt: true,
    updatedAt: true,
    isDeleted: true,
    attendees: { select: { kind: true, username: true, responseStatus: true } },
} as const satisfies Prisma.ActivitySelect;

export type DeliveryOutcome = 'missing' | 'not-due' | 'stale' | 'delivered' | 'conflict';

/** The reminder notification of one recipient. */
export function reminderNotification(row: ActivityTextRow & { remindAt: Date }, username: string, now: Date): NotificationInput {
    const text = reminderText(row, now);
    return {
        username,
        kind: 'activity_reminder',
        ...text,
        entityModule: 'activities',
        entityId: row.id,
        dueAt: row.startAt,
        actor: SYSTEM_ACTOR,
        dedupeKey: reminderKey(row.id, row.remindAt, username),
    };
}

/**
 * Delivers one activity's reminder if it is due. The claim (`reminderSentAt`) and the notification inserts happen in
 * one transaction: if anything fails nothing is claimed, and the job retry or the next sweep tries again. The claim
 * matches the `remindAt` and `updatedAt` it read (a concurrent edit wins; the row is read again) and writes
 * `updatedAt` back unchanged, so a delivered reminder doesn't count as an edit (`unmodifiedDays`, updatedAt sort).
 */
export async function deliverActivityReminder(activityId: string, now = new Date(), db: ReminderDb = prisma): Promise<{ outcome: DeliveryOutcome; notified: number }> {
    for (let attempt = 1; attempt <= CLAIM_ATTEMPTS; attempt++) {
        const row = await db.activity.findUnique({ where: { id: activityId }, select: DELIVERY_SELECT });
        if (!row) return { outcome: 'missing', notified: 0 };
        if (!isReminderDue(row, now) || !row.remindAt) return { outcome: 'not-due', notified: 0 };
        const remindAt = row.remindAt;

        const stale = isStaleReminder(row, now);
        const recipients = stale ? [] : reminderRecipients(row, await activeUsernames(db, reminderCandidates(row)));
        const rows = recipients.map((username) => reminderNotification({ ...row, remindAt }, username, now));

        const inserted = await db.$transaction(
            async (tx) => {
                const claim = await tx.activity.updateMany({
                    where: { id: row.id, reminderSentAt: null, remindAt, updatedAt: row.updatedAt },
                    data: { reminderSentAt: now, updatedAt: row.updatedAt },
                });
                if (claim.count !== 1) return null;
                return insertMissingNotifications(tx, rows, now);
            },
            { maxWait: 5_000, timeout: 15_000 },
        );
        if (inserted === null) continue;
        await invalidateUnreadCounts(inserted.map((item) => item.username));
        return { outcome: stale ? 'stale' : 'delivered', notified: inserted.length };
    }
    return { outcome: 'conflict', notified: 0 };
}

const RENEWAL_SELECT = {
    id: true,
    contractNumber: true,
    contractTitle: true,
    organizationName: true,
    assignedTo: true,
    renewalReminderDate: true,
} as const satisfies Prisma.ContractSelect;

/** The renewal notification of a contract's Contract Manager. */
export function contractRenewalNotification(row: RenewalTextRow & { renewalReminderDate: Date }, username: string, timeZone: string): NotificationInput {
    return {
        username,
        kind: 'contract_renewal',
        ...contractRenewalText(row, timeZone),
        entityModule: 'contracts',
        entityId: row.id,
        dueAt: fakeUtcToInstant(row.renewalReminderDate, timeZone),
        actor: SYSTEM_ACTOR,
        dedupeKey: contractRenewalKey(row.id, toWallClock(row.renewalReminderDate), username),
    };
}

/** Renewal reminders due in the last 7 days → one notification each to the active Contract Manager. */
async function sweepContractRenewals(now: Date, db: ReminderDb): Promise<number> {
    const timeZone = ENV.BUSINESS_TIMEZONE;
    const nowWall = fromWallClock(instantToZonedWallClock(now, timeZone));
    const contracts = await db.contract.findMany({
        where: renewalSweepWhere(nowWall),
        select: RENEWAL_SELECT,
        orderBy: [{ renewalReminderDate: 'asc' }, { id: 'asc' }],
        take: RENEWAL_SWEEP_CAP,
    });
    if (contracts.length === 0) return 0;
    const active = new Map((await activeUsernames(db, [...new Set(contracts.map((row) => row.assignedTo))])).map((name) => [userKey(name), name]));
    const rows = contracts.flatMap((row) => {
        const owner = active.get(userKey(row.assignedTo));
        return owner && row.renewalReminderDate ? [contractRenewalNotification({ ...row, renewalReminderDate: row.renewalReminderDate }, owner, timeZone)] : [];
    });
    return (await notify(rows, db, now)).created;
}

/**
 * The safety net (every 15 minutes in business hours, every minute while Redis is down): delivers activity reminders
 * that are due but unsent (a lost delayed job, a claim lost to an edit, downtime) and contract renewal reminders.
 */
export async function runReminderSweep(now = new Date(), db: ReminderDb = prisma): Promise<{ reminders: number; renewals: number }> {
    let reminders = 0;
    const tried = new Set<string>();
    for (let batch = 0; batch < SWEEP_MAX_BATCHES; batch++) {
        const due = await db.activity.findMany({ where: dueRemindersWhere(now), select: { id: true }, orderBy: [{ remindAt: 'asc' }, { id: 'asc' }], take: SWEEP_BATCH });
        const fresh = due.filter((row) => !tried.has(row.id));
        for (const { id } of fresh) {
            tried.add(id);
            try {
                const result = await deliverActivityReminder(id, now, db);
                if (result.outcome === 'delivered' || result.outcome === 'stale') reminders++;
            } catch (err) {
                logger.warn({ err: (err as Error).message, activityId: id }, 'Activity reminder delivery failed; the next sweep retries');
            }
        }
        if (due.length < SWEEP_BATCH || fresh.length === 0) break;
    }
    let renewals = 0;
    try {
        renewals = await sweepContractRenewals(now, db);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Contract renewal reminders failed; the next sweep retries');
    }
    if (reminders > 0 || renewals > 0) logger.info({ reminders, renewals }, 'Reminder sweep delivered');
    return { reminders, renewals };
}

/** Adds the delayed job that delivers an activity's reminder at `remindAt` (now, when it is already due). */
function enqueueReminder(activityId: string, remindAt: Date, now: Date): Promise<string | null> {
    return tryEnqueue(remindersQueue, 'remind', { activityId }, { delay: Math.max(0, remindAt.getTime() - now.getTime()), jobId: reminderJobId(activityId, remindAt) });
}

/**
 * After a committed save: arms the activity's reminder job. The job id carries the reminder time, so a reschedule adds
 * a new job and the old one finds nothing due; re-adding an existing id is a no-op. Returns null when nothing is
 * armed (no reminder, already sent, or Redis down: the sweep covers it).
 */
export function scheduleActivityReminder(
    row: { id: string; status: string; isDeleted: boolean; remindAt: Date | null; reminderSentAt: Date | null },
    now = new Date(),
): Promise<string | null> {
    if (!row.remindAt || row.reminderSentAt || row.isDeleted || row.status !== PLANNED_STATUS) return Promise.resolve(null);
    return enqueueReminder(row.id, row.remindAt, now);
}

/**
 * Re-adds the delayed job of every pending future reminder (nightly, at worker start and whenever Redis comes back):
 * recovers jobs lost to a Redis flush or never added while Redis was down. Existing job ids are left as they are.
 */
export async function armPendingReminders(now = new Date(), db: ReminderDb = prisma): Promise<number> {
    if (!isQueueAvailable()) return 0;
    let armed = 0;
    let cursor: string | undefined;
    for (;;) {
        const rows = await db.activity.findMany({
            where: { isDeleted: false, status: PLANNED_STATUS, reminderSentAt: null, remindAt: { gt: now }, ...(cursor ? { id: { gt: cursor } } : {}) },
            select: { id: true, remindAt: true },
            orderBy: { id: 'asc' },
            take: ARM_BATCH,
        });
        for (const row of rows) {
            if (!row.remindAt) continue;
            // Redis went away mid-way: stop; the next `ready` re-arms everything.
            if ((await enqueueReminder(row.id, row.remindAt, now)) === null) return armed;
            armed++;
        }
        if (rows.length < ARM_BATCH) break;
        cursor = rows[rows.length - 1].id;
    }
    return armed;
}

/**
 * After a committed create / update / restore / RSVP: tells the new owner (assigned by someone else) and newly invited
 * colleagues. Takes the service's internal rows (attendees included) and the root client; never audited, and the
 * caller catches its errors so it can't fail the save.
 */
export async function notifyActivityParticipants(before: ParticipantRow | null, after: ParticipantRow, actor: AuthUser, db: ReminderDb = prisma, now = new Date()): Promise<number> {
    const plan = planParticipantNotifications(before, after, actor.username);
    if (!plan.assignee && plan.invitees.length === 0) return 0;
    const candidates = [...(plan.assignee ? [plan.assignee] : []), ...plan.invitees];
    const users = await db.user.findMany({
        where: { username: { in: [...new Set([...candidates, actor.username])] } },
        select: { username: true, fullName: true, isActive: true },
    });
    const byKey = new Map(users.map((user) => [userKey(user.username), user]));
    const actorName = byKey.get(userKey(actor.username))?.fullName?.trim() || actor.username;
    const activeName = (username: string) => {
        const user = byKey.get(userKey(username));
        return user?.isActive ? user.username : null;
    };

    const rows: NotificationInput[] = [];
    const assignee = plan.assignee ? activeName(plan.assignee) : null;
    if (assignee) {
        rows.push({
            username: assignee,
            kind: 'activity_assigned',
            ...assignmentText(after, actorName, now),
            entityModule: 'activities',
            entityId: after.id,
            dueAt: after.startAt,
            actor: actor.username,
            dedupeKey: assignmentKey(after.id, after.updatedAt, assignee),
        });
    }
    for (const invitee of plan.invitees) {
        const username = activeName(invitee);
        if (!username) continue;
        rows.push({
            username,
            kind: 'activity_invited',
            ...invitationText(after, actorName, now),
            entityModule: 'activities',
            entityId: after.id,
            dueAt: after.startAt,
            actor: actor.username,
            dedupeKey: invitationKey(after.id, after.updatedAt, username),
        });
    }
    return (await notify(rows, db, now)).created;
}

/** Deletes rows matching `where` in batches of PURGE_BATCH ids (one parameter each). */
async function deleteInBatches(
    load: () => Promise<{ id: string }[]>,
    remove: (ids: string[]) => Promise<{ count: number }>,
): Promise<number> {
    let deleted = 0;
    for (let batch = 0; batch < PURGE_MAX_BATCHES; batch++) {
        const rows = await load();
        if (rows.length === 0) break;
        deleted += (await remove(rows.map((row) => row.id))).count;
        if (rows.length < PURGE_BATCH) break;
    }
    return deleted;
}

/**
 * Nightly retention: notifications read more than NOTIFICATION_RETENTION_DAYS ago (any older than twice that) and
 * EmailLog rows older than EMAIL_LOG_RETENTION_DAYS. Hard deletes; neither table is audited. Then drops every cached
 * unread count.
 */
export async function purgeNotifications(now = new Date(), db: ReminderDb = prisma): Promise<{ notifications: number; emailLogs: number }> {
    const where = notificationPurgeWhere(now, ENV.NOTIFICATIONS.RETENTION_DAYS);
    const notifications = await deleteInBatches(
        () => db.notification.findMany({ where, select: { id: true }, take: PURGE_BATCH }),
        (ids) => db.notification.deleteMany({ where: { id: { in: ids } } }),
    );
    const emailCutoff = new Date(now.getTime() - ENV.MAIL.LOG_RETENTION_DAYS * DAY_MS);
    const emailLogs = await deleteInBatches(
        () => db.emailLog.findMany({ where: { createdAt: { lt: emailCutoff } }, select: { id: true }, take: PURGE_BATCH }),
        (ids) => db.emailLog.deleteMany({ where: { id: { in: ids } } }),
    );
    // Unread rows past twice the retention may have gone, and an invalidation may have been lost: drop every cached
    // count while the database is awake for this job (open tabs re-read it within a minute, not in the night).
    await invalidateAllUnreadCounts();
    if (notifications > 0 || emailLogs > 0) logger.info({ notifications, emailLogs }, 'Old notifications and email log rows deleted');
    return { notifications, emailLogs };
}

/** The 00:20 job: retention purge, then re-arm every pending reminder. */
export async function runNightlyMaintenance(now = new Date()): Promise<{ notifications: number; emailLogs: number; armed: number }> {
    const purged = await purgeNotifications(now);
    const armed = await armPendingReminders(now);
    return { ...purged, armed };
}
