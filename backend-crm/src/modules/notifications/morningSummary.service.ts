import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { isMailConfigured, MAIL_DISABLED_MESSAGE, sendMail } from '../../services/mail.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { fromDateOnly } from '../../utils/mappers.js';
import { addDays, zonedDayOf, zonedStartOfDay } from '../../utils/zonedTime.js';
import {
    activityCalendarWhere,
    CONTRACT_EXPIRED_STATUS,
    CONTRACT_RENEWAL_SELECT,
    contractRenewalWhere,
    LEAD_FOLLOWUP_SELECT,
    leadFollowupToCalendarItem,
    leadFollowupWhere,
    OPPORTUNITY_FOLLOWUP_SELECT,
    opportunityFollowupToCalendarItem,
    opportunityFollowupWhere,
    renewalRange,
} from '../activities/activity.calendar.js';
import { NOTE_TYPE, PLANNED_STATUS } from '../activities/activity.schedule.js';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '../form-configs/formConfig.defaults.js';
import { loadRatingConfig } from '../leads/lead.followUp.js';
import { buildAccessScopeWhere } from '../shared/accessControl.js';
import { renderMorningSummary } from './morningSummary.render.js';
import { shouldCatchUpMorningSummary } from './morningSummary.schedule.js';
import {
    buildMorningSummary,
    ENDING_SOON_DAYS,
    SUMMARY_LIST_MAX,
    type MorningSummary,
    type MorningSummaryInput,
    type SummaryCounts,
} from './morningSummary.sections.js';
import { DECLINED } from './notification.reminders.js';

/**
 * The morning summary email (about 9 AM, MORNING_SUMMARY_CRON): one email per active user with an email address,
 * listing today's activities, overdue activities, follow-ups due today and overdue, and contract renewals. The rows
 * come from the calendar feed's where-builders (activity.calendar.ts), so open leads / opportunities and the access
 * rules are the calendar's. Each send is deduplicated per business day and user (EmailLog), so a retry, a catch-up
 * run or a second worker process never mails a user twice.
 */

export const MORNING_SUMMARY_KIND = 'morning_summary';
export const MORNING_SUMMARY_TEST_KIND = 'morning_summary_test';
/** Users built and mailed at the same time. */
export const SUMMARY_USER_CONCURRENCY = 3;
/** Today's schedule lists at most this many activities (the rest are counted). */
const TODAY_CAP = 50;
const FOLLOWUPS_TODAY_CAP = 50;
const CONTRACTS_CAP = 50;

export const NO_EMAIL_MESSAGE = 'Your user account has no email address, so a test email has nowhere to go. Ask an admin to add one.';

/** One email per business day and user. */
export const morningSummaryKey = (day: string, username: string) => `${MORNING_SUMMARY_KIND}:${day}:${username.trim().toLowerCase()}`;

/** Business-day context shared by every user of a run. */
export interface SummaryContext {
    now: Date;
    timeZone: string;
    day: string;
    /** Business-timezone midnight of `day` and of the next day (exclusive). */
    dayStart: Date;
    dayEnd: Date;
    closingStatuses: ReadonlySet<string>;
    typeIcons: Readonly<Record<string, string>>;
    appUrl: string;
}

/** Followup Type value → its option's `meta.icon` (survives an admin renaming the option). */
async function loadTypeIcons(): Promise<Record<string, string>> {
    const options = await prisma.dropdownOption.findMany({
        where: { category: { key: FOLLOWUP_TYPE_CATEGORY_KEY } },
        select: { value: true, metaJson: true },
    });
    const icons: Record<string, string> = {};
    for (const option of options) {
        try {
            const icon = option.metaJson ? (JSON.parse(option.metaJson) as { icon?: unknown }).icon : undefined;
            if (typeof icon === 'string') icons[option.value] = icon;
        } catch {
            // Unreadable meta: the generic icon.
        }
    }
    return icons;
}

export async function summaryContext(now = new Date()): Promise<SummaryContext> {
    const timeZone = ENV.BUSINESS_TIMEZONE;
    const day = zonedDayOf(now, timeZone);
    const [{ closingStatuses }, typeIcons] = await Promise.all([loadRatingConfig(prisma), loadTypeIcons()]);
    return {
        now,
        timeZone,
        day,
        dayStart: zonedStartOfDay(day, timeZone),
        dayEnd: zonedStartOfDay(addDays(day, 1), timeZone),
        closingStatuses,
        typeIcons,
        appUrl: ENV.MAIL.APP_PUBLIC_URL,
    };
}

/** Who a summary is for (a Users row). */
export interface SummaryRecipient {
    id: number;
    username: string;
    role: string;
    fullName: string;
    email: string | null;
}

const RECIPIENT_SELECT = { id: true, username: true, role: true, fullName: true, email: true } as const satisfies Prisma.UserSelect;

const SUMMARY_ACTIVITY_SELECT = {
    id: true,
    subject: true,
    followupType: true,
    startAt: true,
    endAt: true,
    allDay: true,
    timeZone: true,
    location: true,
    relatedTo: true,
    relatedCode: true,
    remarks: true,
} as const satisfies Prisma.ActivitySelect;

/** The user's own activities, or ones they are invited to and haven't declined. */
export function attendingWhere(username: string): Prisma.ActivityWhereInput {
    return { OR: [{ assignedTo: username }, { attendees: { some: { kind: 'user', username, responseStatus: { not: DECLINED } } } }] };
}

/**
 * The user's overdue activities: Planned (not Notes), owned by them, started before today and ended before now.
 * Today's past activities stay in today's schedule rather than being listed twice.
 */
export function overdueActivitiesWhere(username: string, dayStart: Date, now: Date): Prisma.ActivityWhereInput {
    return {
        isDeleted: false,
        assignedTo: username,
        status: PLANNED_STATUS,
        followupType: { not: NOTE_TYPE },
        startAt: { lt: dayStart },
        OR: [{ endAt: { lt: now } }, { endAt: null }],
    };
}

/** Contracts (not Expired) of the user ending between today and ENDING_SOON_DAYS from now. */
export function contractsEndingWhere(user: AuthUser, today: string): Prisma.ContractWhereInput {
    return {
        AND: [
            { isDeleted: false },
            buildAccessScopeWhere(user, 'assignedTo'),
            { assignedTo: user.username },
            { status: { not: CONTRACT_EXPIRED_STATUS } },
            { endDate: { gte: fromDateOnly(today), lte: fromDateOnly(addDays(today, ENDING_SOON_DAYS)) } },
        ],
    };
}

/** Loads one user's rows (about ten small indexed queries). */
export async function loadMorningSummaryInput(recipient: SummaryRecipient, ctx: SummaryContext): Promise<MorningSummaryInput> {
    const user: AuthUser = { id: recipient.id, username: recipient.username, role: recipient.role };
    const users = [recipient.username];
    const todayWhere: Prisma.ActivityWhereInput = {
        AND: [activityCalendarWhere(user, { users, statuses: [PLANNED_STATUS] }, ctx.dayStart, ctx.dayEnd), attendingWhere(recipient.username)],
    };
    const overdueWhere = overdueActivitiesWhere(recipient.username, ctx.dayStart, ctx.now);
    const today = fromDateOnly(ctx.day);
    const leadsToday = leadFollowupWhere(user, { users }, ctx.closingStatuses, { gte: today, lte: today });
    const opportunitiesToday = opportunityFollowupWhere(user, { users }, { gte: today, lte: today });
    const leadsOverdue = leadFollowupWhere(user, { users }, ctx.closingStatuses, { lt: today });
    const opportunitiesOverdue = opportunityFollowupWhere(user, { users }, { lt: today });
    const contractsWhere: Prisma.ContractWhereInput = {
        OR: [contractRenewalWhere(user, { users }, renewalRange(ctx.dayStart, ctx.dayEnd, ctx.timeZone)), contractsEndingWhere(user, ctx.day)],
    };
    const followupOrder = [{ nextFollowupDate: 'asc' as const }, { id: 'asc' as const }];

    const [todayTotal, todayRows, overdueTotal, overdueRows, leadRows, opportunityRows, leadOverdueTotal, leadOverdueRows, oppOverdueTotal, oppOverdueRows, contracts] =
        await Promise.all([
            prisma.activity.count({ where: todayWhere }),
            prisma.activity.findMany({ where: todayWhere, select: SUMMARY_ACTIVITY_SELECT, orderBy: [{ allDay: 'desc' }, { startAt: 'asc' }, { id: 'asc' }], take: TODAY_CAP }),
            prisma.activity.count({ where: overdueWhere }),
            prisma.activity.findMany({ where: overdueWhere, select: SUMMARY_ACTIVITY_SELECT, orderBy: [{ endAt: 'asc' }, { startAt: 'asc' }, { id: 'asc' }], take: SUMMARY_LIST_MAX }),
            prisma.lead.findMany({ where: leadsToday, select: LEAD_FOLLOWUP_SELECT, orderBy: followupOrder, take: FOLLOWUPS_TODAY_CAP }),
            prisma.opportunity.findMany({ where: opportunitiesToday, select: OPPORTUNITY_FOLLOWUP_SELECT, orderBy: followupOrder, take: FOLLOWUPS_TODAY_CAP }),
            prisma.lead.count({ where: leadsOverdue }),
            prisma.lead.findMany({ where: leadsOverdue, select: LEAD_FOLLOWUP_SELECT, orderBy: followupOrder, take: SUMMARY_LIST_MAX }),
            prisma.opportunity.count({ where: opportunitiesOverdue }),
            prisma.opportunity.findMany({ where: opportunitiesOverdue, select: OPPORTUNITY_FOLLOWUP_SELECT, orderBy: followupOrder, take: SUMMARY_LIST_MAX }),
            prisma.contract.findMany({
                where: contractsWhere,
                select: { ...CONTRACT_RENEWAL_SELECT, endDate: true },
                orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
                take: CONTRACTS_CAP,
            }),
        ]);

    const leadItem = (row: (typeof leadRows)[number]) => leadFollowupToCalendarItem(row, ctx.timeZone, ctx.now);
    const opportunityItem = (row: (typeof opportunityRows)[number]) => opportunityFollowupToCalendarItem(row, ctx.timeZone, ctx.now);
    const overdueFollowups = [...leadOverdueRows.map(leadItem), ...oppOverdueRows.map(opportunityItem)]
        .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
        .slice(0, SUMMARY_LIST_MAX);

    return {
        now: ctx.now,
        timeZone: ctx.timeZone,
        appUrl: ctx.appUrl,
        recipient: { username: recipient.username, fullName: recipient.fullName },
        typeIcons: ctx.typeIcons,
        today: { total: todayTotal, rows: todayRows },
        overdue: { total: overdueTotal, rows: overdueRows },
        followupsToday: [...leadRows.map(leadItem), ...opportunityRows.map(opportunityItem)],
        overdueFollowups: { leads: leadOverdueTotal, opportunities: oppOverdueTotal, rows: overdueFollowups },
        contracts,
    };
}

export async function buildMorningSummaryFor(recipient: SummaryRecipient, ctx: SummaryContext): Promise<MorningSummary> {
    return buildMorningSummary(await loadMorningSummaryInput(recipient, ctx));
}

/** Runs `fn` over `items`, at most `limit` at a time. */
export async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const lanes = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
        while (next < items.length) await fn(items[next++]);
    });
    await Promise.all(lanes);
}

export interface MorningSummaryRunResult {
    day: string;
    /** Users considered (active, not a group user, not on leave, with an email address). */
    users: number;
    sent: number;
    /** Already sent today (another run / process), or mail turned off meanwhile. */
    skipped: number;
    failed: number;
    /** Users with nothing due (no email, MORNING_SUMMARY_SKIP_EMPTY). */
    empty: number;
    /** Set when the run did nothing because the summary or mail is turned off. */
    disabled?: 'summary' | 'mail';
}

/** The business day this process last ran the summary for (the catch-up check reads it). */
let lastRunDay: string | null = null;
let running: Promise<MorningSummaryRunResult> | null = null;
let loggedMailOff = false;

async function runFor(now: Date): Promise<MorningSummaryRunResult> {
    const ctx = await summaryContext(now);
    const recipients = await prisma.user.findMany({
        where: { isActive: true, isGroupUser: false, onLeave: false, email: { not: null } },
        select: RECIPIENT_SELECT,
        orderBy: { username: 'asc' },
    });
    const withEmail = recipients.filter((row) => (row.email ?? '').trim() !== '');
    const result: MorningSummaryRunResult = { day: ctx.day, users: withEmail.length, sent: 0, skipped: 0, failed: 0, empty: 0 };

    await forEachLimited(withEmail, SUMMARY_USER_CONCURRENCY, async (recipient) => {
        try {
            const summary = await buildMorningSummaryFor(recipient, ctx);
            if (summary.empty && ENV.NOTIFICATIONS.MORNING_SUMMARY_SKIP_EMPTY) {
                result.empty++;
                return;
            }
            const email = renderMorningSummary(summary);
            const sent = await sendMail({
                to: (recipient.email ?? '').trim(),
                toUsername: recipient.username,
                subject: email.subject,
                html: email.html,
                text: email.text,
                kind: MORNING_SUMMARY_KIND,
                dedupeKey: morningSummaryKey(ctx.day, recipient.username),
            });
            if (sent.status === 'sent') result.sent++;
            else if (sent.status === 'failed') result.failed++;
            else result.skipped++;
        } catch (err) {
            result.failed++;
            logger.warn({ err: (err as Error).message, username: recipient.username }, 'Morning summary could not be built or sent for a user');
        }
    });

    lastRunDay = ctx.day;
    logger.info(result, 'Morning summary run finished');
    return result;
}

/**
 * Sends today's summaries. Each user is built and sent on their own (3 at a time); one user's failure doesn't stop
 * the rest. Does nothing (and touches no table) while the summary or mail is turned off. A second call while one
 * runs in this process waits for that run.
 */
export function runMorningSummary(now = new Date()): Promise<MorningSummaryRunResult> {
    const day = zonedDayOf(now, ENV.BUSINESS_TIMEZONE);
    if (!ENV.NOTIFICATIONS.MORNING_SUMMARY_ENABLED) {
        return Promise.resolve({ day, users: 0, sent: 0, skipped: 0, failed: 0, empty: 0, disabled: 'summary' });
    }
    if (!isMailConfigured()) {
        if (!loggedMailOff) {
            loggedMailOff = true;
            logger.warn('Morning summary emails are not sent: outgoing email is turned off (MAIL_ENABLED / SMTP_HOST)');
        }
        return Promise.resolve({ day, users: 0, sent: 0, skipped: 0, failed: 0, empty: 0, disabled: 'mail' });
    }
    running ??= runFor(now).finally(() => {
        running = null;
    });
    return running;
}

/** True when any summary of `day` is in EmailLog (some process already ran it). */
async function ranToday(day: string): Promise<boolean> {
    const row = await prisma.emailLog.findFirst({ where: { dedupeKey: { startsWith: `${MORNING_SUMMARY_KIND}:${day}:` } }, select: { id: true } });
    return row !== null;
}

/**
 * Makes up a run the scheduler missed (worker started late, Redis was down at 9): between the scheduled time and
 * noon on a scheduled day, once per process and day. Checks nothing in the database outside that window.
 */
export async function catchUpMorningSummary(now = new Date()): Promise<MorningSummaryRunResult | null> {
    if (!ENV.NOTIFICATIONS.MORNING_SUMMARY_ENABLED || !isMailConfigured()) return null;
    if (!shouldCatchUpMorningSummary(now, ENV.NOTIFICATIONS.MORNING_SUMMARY_CRON, ENV.BUSINESS_TIMEZONE, lastRunDay)) return null;
    const day = zonedDayOf(now, ENV.BUSINESS_TIMEZONE);
    if (await ranToday(day)) {
        lastRunDay = day;
        return null;
    }
    logger.info({ day }, 'Morning summary missed its scheduled time; sending it now');
    return runMorningSummary(now);
}

async function loadRecipient(user: AuthUser): Promise<SummaryRecipient> {
    const row = await prisma.user.findUnique({ where: { username: user.username }, select: RECIPIENT_SELECT });
    if (!row) throw HttpError.notFound('User not found');
    return row;
}

export interface MorningSummaryPreview {
    subject: string;
    html: string;
    text: string;
    counts: SummaryCounts;
    /** Nothing due: with MORNING_SUMMARY_SKIP_EMPTY no email would go out today. */
    empty: boolean;
    /** Whether outgoing email is turned on (else nothing is sent; the preview still works). */
    mailEnabled: boolean;
    /** The caller's email address ('' when none: they would get no email). */
    email: string;
}

/** `GET /api/notifications/morning-summary/preview`: the caller's email for today, sent nowhere. */
export async function previewMorningSummary(user: AuthUser, now = new Date()): Promise<MorningSummaryPreview> {
    const recipient = await loadRecipient(user);
    const summary = await buildMorningSummaryFor(recipient, await summaryContext(now));
    const email = renderMorningSummary(summary);
    return { ...email, counts: summary.counts, empty: summary.empty, mailEnabled: isMailConfigured(), email: (recipient.email ?? '').trim() };
}

export interface MorningSummaryTestResult {
    status: 'sent' | 'failed' | 'skipped' | 'duplicate';
    error?: string;
    /** Where it went. */
    email: string;
    /** For the toast. */
    message: string;
}

/**
 * `POST /api/notifications/morning-summary/test` (admins): builds the caller's summary and sends it to their own
 * address now, with no dedupe (EmailLog kind `morning_summary_test`). 400 when mail is off or they have no address.
 */
export async function sendTestMorningSummary(user: AuthUser, now = new Date()): Promise<MorningSummaryTestResult> {
    if (!isMailConfigured()) throw HttpError.badRequest(MAIL_DISABLED_MESSAGE);
    const recipient = await loadRecipient(user);
    const to = (recipient.email ?? '').trim();
    if (!to) throw HttpError.badRequest(NO_EMAIL_MESSAGE);
    const summary = await buildMorningSummaryFor(recipient, await summaryContext(now));
    const email = renderMorningSummary(summary);
    const result = await sendMail({
        to,
        toUsername: recipient.username,
        subject: `[Test] ${email.subject}`,
        html: email.html,
        text: email.text,
        kind: MORNING_SUMMARY_TEST_KIND,
    });
    const message =
        result.status === 'sent'
            ? `Test email sent to ${to}.`
            : result.status === 'failed'
              ? `The test email could not be sent: ${result.error ?? 'unknown error'}`
              : 'The test email was not sent.';
    return { status: result.status, ...(result.error ? { error: result.error } : {}), email: to, message };
}
