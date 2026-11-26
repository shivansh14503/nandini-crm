import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { TransactionClient } from '../../config/prisma.js';
import { prisma } from '../../config/prisma.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import { addDays, zonedDayOf } from '../../utils/zonedTime.js';
import { insertSystemActivity, type SystemActivityFields } from '../activities/activity.system.js';
import { RELATED_LOADERS } from '../activities/activity.links.js';
import type { ActivityRelatedModule } from '../activities/activity.schedule.js';
import { loadActivityConfig, runActivityPostCommit, type ActivityCommitRow, type ActivityConfig } from '../activities/activity.service.js';
import { activityBusyBlock, busyActivityWhere, busyTimes } from '../calendar-sync/busy.service.js';
import type { Interval } from '../calendar-sync/busy.intervals.js';
import { holidayService } from '../holidays/holiday.service.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { insertMissingNotifications, invalidateUnreadCounts } from '../notifications/notification.producer.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import {
    BOOKING_ACTOR,
    BOOKING_AUDIT_ROUTE,
    BOOKING_ERROR_CODES,
    BOOKING_NOTIFICATION_KIND,
    BOOKING_ORIGIN,
    BOOKING_SLOT_PAGE_DAYS,
} from './bookingLink.constants.js';
import { buildIcs } from './bookingLink.ics.js';
import { findPublicLink, loadBookingSettings, type LinkConfig, type PublicLink } from './bookingLink.service.js';
import { bookableDays, clashes, computeSlots, daysRange, slotRuleProblem } from './bookingLink.slots.js';
import { signSlot, tokenHashOf, verifySlot } from './bookingLink.token.js';
import { bookBodySchema, slotsQuerySchema, type BookBody } from './bookingLink.validator.js';

/**
 * The public booking page (`/api/public/booking/:slug…`, no sign-in; bookingLink.public.routes.ts adds the rate limits).
 *
 * Every "this link can't be used" case answers the same 404 (no link, turned off, company switch off, owner inactive
 * or a shared login), so the API can't be used to find links or people. Only the link's own public fields and free
 * start times leave the server: never busy blocks, subjects, usernames, emails or the owner's calendar status.
 *
 * Booking (`book`): the slot token must be one this server signed for this version of the link; the hours, notice,
 * horizon and holidays are checked again; the company calendar is read again (outside the transaction); then, inside
 * one transaction under a per-owner lock (D45: pre-read under the lock, never a caught unique error), the CRM
 * activities are read again through `tx`, the daily cap is counted again, the meeting activity is inserted through
 * the system write path, the booking row and the owner's `booking_created` notification are written. A unique
 * violation (the same token submitted twice at once) aborts the transaction; the booking is retried once from the
 * start and the retry finds the first one (same confirmation for the same visitor).
 */

/** What the public module calls, as an object so tests can replace parts (mock.method). */
export const bookingDeps = {
    findPublicLink,
    loadBookingSettings,
    busyTimes,
    loadActivityConfig,
    loadCalendarSettings,
    insertSystemActivity,
    runActivityPostCommit,
    /** Active holidays `[from, to]` (inclusive days), cached 10 minutes. */
    async holidays(from: string, to: string): Promise<Set<string>> {
        const days = await cacheService.getOrSet(`cache:booking-holidays:${from}:${to}`, 600, async () =>
            (await holidayService.calendar(from, to)).map((h) => h.holidayDate),
        );
        return new Set(days);
    },
    /** Bookings of the link per business day in `[from, to)` whose activity is still planned (for maxPerDay). */
    async bookedPerDay(db: TransactionClient | typeof prisma, linkId: string, range: Interval, tz: string): Promise<Map<string, number>> {
        const rows = await db.bookingLinkBooking.findMany({
            where: { bookingLinkId: linkId, startAt: { gte: new Date(range.start), lt: new Date(range.end) } },
            select: { activityId: true, startAt: true },
            take: 2000,
        });
        if (rows.length === 0) return new Map();
        const live = await db.activity.findMany({
            where: { id: { in: rows.map((r) => r.activityId) }, isDeleted: false, status: { not: 'Cancelled' } },
            select: { id: true },
        });
        const liveIds = new Set(live.map((a) => a.id));
        const out = new Map<string, number>();
        for (const row of rows) {
            if (!liveIds.has(row.activityId)) continue;
            const day = zonedDayOf(row.startAt, tz);
            out.set(day, (out.get(day) ?? 0) + 1);
        }
        return out;
    },
    async afterCommit(rows: ActivityCommitRow[], owner: string): Promise<void> {
        await bookingDeps.runActivityPostCommit(rows, BOOKING_ACTOR, { notify: false });
        await cacheService.invalidateEntityCaches('activities');
        await invalidateUnreadCounts([owner]);
    },
    now: () => new Date(),
};

const notFound = () => HttpError.notFound('This booking page doesn’t exist or is no longer available.');

const slotUnavailable = (message = 'That time is no longer available. Please pick another time.') =>
    new HttpError(message, StatusCodes.CONFLICT, { code: BOOKING_ERROR_CODES.slotUnavailable });

const calendarUnavailable = () =>
    new HttpError("Times can't be shown right now. Please try again in a few minutes.", StatusCodes.SERVICE_UNAVAILABLE, {
        code: BOOKING_ERROR_CODES.calendarUnavailable,
    });

/** The live link of `slug` with the company switch on, else the one 404. */
async function liveLink(slug: string): Promise<PublicLink> {
    const settings = await bookingDeps.loadBookingSettings();
    if (!settings.enabled) throw notFound();
    const found = await bookingDeps.findPublicLink(slug);
    if (!found) throw notFound();
    return found;
}

const ownerAsRequester = (link: LinkConfig): AuthUser => ({ id: 0, username: link.ownerUsername, role: '' });

/**
 * The owner's busy blocks in `[from, to)` (CRM activities + company calendar, any kind). Throws 503
 * CALENDAR_UNAVAILABLE when the company calendar part couldn't be read (`error` / `unavailable`): offering or booking
 * a time the CRM can't check against Google / Outlook would double-book. `not_connected` = CRM only. An owner that
 * busy times no longer knows (inactive since the link was cached) is the 404.
 */
async function ownerBusy(link: LinkConfig, range: Interval, now: Date): Promise<Interval[]> {
    const answer = await bookingDeps.busyTimes(
        { users: [link.ownerUsername], from: new Date(range.start).toISOString(), to: new Date(range.end).toISOString(), exclude: undefined },
        ownerAsRequester(link),
        now,
        { budgetKey: `booking:${link.id}` },
    );
    const person = answer.people[0];
    if (!person || person.status === 'unknown') throw notFound();
    if (person.status === 'error' || person.status === 'unavailable') {
        logger.info({ linkId: link.id, status: person.status }, 'Booking page: owner calendar unreadable; no times offered');
        throw calendarUnavailable();
    }
    return person.busy.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
}

// ── View ─────────────────────────────────────────────────────────────────────

export interface PublicLinkDto {
    slug: string;
    title: string;
    ownerName: string;
    /** The activity type (e.g. Meeting, Call, Demo / Presentation). */
    typeLabel: string;
    durations: number[];
    defaultDuration: number;
    location: string;
    note: string;
    askPhone: boolean;
    askCompany: boolean;
    timeZone: string;
    /** First and last business day a visitor may book (YYYY-MM-DD). */
    firstDay: string;
    lastDay: string;
}

// ── Slots ────────────────────────────────────────────────────────────────────

export interface PublicSlotsDto {
    timeZone: string;
    duration: number;
    days: { date: string; slots: { start: string; token: string }[] }[];
    firstDay: string;
    lastDay: string;
    /** The `from` of the previous / next page, null at the ends. */
    prevFrom: string | null;
    nextFrom: string | null;
}

// ── Book ─────────────────────────────────────────────────────────────────────

export interface BookingConfirmationDto {
    booking: {
        id: string;
        title: string;
        typeLabel: string;
        ownerName: string;
        start: string;
        end: string;
        durationMinutes: number;
        timeZone: string;
        location: string;
    };
    /** The meeting as an iCalendar file (text), for "Add to my calendar". */
    ics: string;
}

/** Who asked (for the audit origin and logs). */
export interface RequestMeta {
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
}

const MINUTE = 60_000;

function confirmation(link: LinkConfig, ownerName: string, booking: { id: string; startAt: Date; endAt: Date }, now: Date, typeLabel: string): BookingConfirmationDto {
    const minutes = Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / MINUTE);
    return {
        booking: {
            id: booking.id,
            title: link.title,
            typeLabel,
            ownerName,
            start: booking.startAt.toISOString(),
            end: booking.endAt.toISOString(),
            durationMinutes: minutes,
            timeZone: ENV.BUSINESS_TIMEZONE,
            location: link.location ?? '',
        },
        ics: buildIcs({
            uid: `booking-${booking.id}@nandini-crm`,
            start: booking.startAt,
            end: booking.endAt,
            summary: `${link.title} with ${ownerName}`,
            location: link.location,
            description: link.note,
            stamp: now,
        }),
    };
}

/** The activity's remarks: where it came from and what the visitor told us (never sent to calendars, D15). */
export function bookingRemarks(link: Pick<LinkConfig, 'title' | 'slug'>, body: Pick<BookBody, 'phone' | 'company' | 'message'>): string {
    const lines = [`Booked online through "${link.title}" (/book/${link.slug}).`];
    if (body.phone) lines.push(`Phone: ${body.phone}`);
    if (body.company) lines.push(`Company: ${body.company}`);
    if (body.message) lines.push(`Message: ${body.message}`);
    const text = lines.join('\n');
    return text.length > 2000 ? `${text.slice(0, 1999)}…` : text;
}

/** "Mon, 30 Nov 2026, 10:30 am" in the business time zone (notification text). */
function whenText(start: Date): string {
    return new Intl.DateTimeFormat('en-IN', { timeZone: ENV.BUSINESS_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(start);
}

/** The Followup Type's display label (admins can rename a label; the stored value stays). */
export const typeLabelOf = (config: ActivityConfig | null, value: string): string =>
    config?.followupTypes?.options.find((o) => o.value === value)?.label?.trim() || value;

const awayTypesOf = (config: ActivityConfig) => new Set((config.followupTypes?.options ?? []).filter((o) => o.meta?.icon === 'visit').map((o) => o.value));

interface Attempt {
    link: LinkConfig;
    ownerName: string;
    body: BookBody;
    start: Date;
    end: Date;
    tokenHash: string;
    config: ActivityConfig;
    followUpActivities: boolean;
    now: Date;
}

type AttemptResult = { kind: 'created'; booking: { id: string; startAt: Date; endAt: Date }; rows: ActivityCommitRow[] } | { kind: 'existing'; booking: { id: string; startAt: Date; endAt: Date } };

/** One try of the booking transaction (see the module comment). */
async function bookOnce(a: Attempt): Promise<AttemptResult> {
    const { link, body, start, end, now } = a;
    const tz = ENV.BUSINESS_TIMEZONE;
    return runInTransaction(async (tx) => {
        await acquireLocks(tx, [`booking:owner:${link.ownerUsername.trim().toLowerCase()}`]);

        // The same token again (a double click, a retried request): one booking.
        const used = await tx.bookingLinkBooking.findUnique({ where: { tokenHash: a.tokenHash }, select: { id: true, startAt: true, endAt: true, visitorEmail: true } });
        if (used) {
            if (used.visitorEmail.toLowerCase() === body.email.toLowerCase()) return { kind: 'existing', booking: used };
            throw slotUnavailable();
        }

        // CRM activities again, through the transaction (the same rules as busy times).
        const from = new Date(start.getTime() - link.rules.bufferBeforeMinutes * MINUTE);
        const to = new Date(end.getTime() + link.rules.bufferAfterMinutes * MINUTE);
        const rows = await tx.activity.findMany({
            where: busyActivityWhere([link.ownerUsername], from, to, a.followUpActivities),
            select: { id: true, followupType: true, startAt: true, endAt: true, allDay: true },
            take: 50,
        });
        const awayTypes = awayTypesOf(a.config);
        const crmBusy = rows.map((row) => activityBusyBlock(row, awayTypes)).filter((b): b is NonNullable<typeof b> => b !== null);
        if (clashes(start.getTime(), end.getTime(), link.rules, crmBusy)) throw slotUnavailable('That time was just taken. Please pick another time.');

        if (link.rules.maxPerDay !== null) {
            const day = zonedDayOf(start, tz);
            const perDay = await bookingDeps.bookedPerDay(tx, link.id, daysRange(day, day, tz), tz);
            if ((perDay.get(day) ?? 0) >= link.rules.maxPerDay) {
                throw new HttpError('That day is fully booked. Please pick another day.', StatusCodes.CONFLICT, { code: BOOKING_ERROR_CODES.dayFull });
            }
        }

        // The link's related record, unless it was deleted since (the booking still goes through, unlinked).
        let related: { module: ActivityRelatedModule; id: string } | null = null;
        if (link.relatedModule && link.relatedId) {
            const found = await RELATED_LOADERS[link.relatedModule].find(tx, link.relatedId);
            if (found && !found.isDeleted) related = { module: link.relatedModule, id: link.relatedId };
        }

        // A Contact with exactly this email (one live contact only) is linked; nothing is created.
        let contactId: string | null = null;
        let contactName: string | null = null;
        if (!related) {
            const emails = await tx.entityEmail.findMany({
                where: { email: body.email, contactId: { not: null }, contact: { isDeleted: false } },
                select: { contactId: true, contact: { select: { name: true } } },
                take: 5,
            });
            const ids = [...new Set(emails.map((e) => e.contactId).filter((id): id is string => Boolean(id)))];
            if (ids.length === 1) {
                contactId = ids[0];
                contactName = emails.find((e) => e.contactId === contactId)?.contact?.name ?? null;
            }
        }

        const fields: SystemActivityFields = {
            followupType: link.followupType,
            subject: `${link.title} with ${body.name}`.slice(0, 200),
            assignedTo: link.ownerUsername,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            allDay: false,
            location: link.location,
            reminder: link.reminder,
            remarks: bookingRemarks(link, body),
            relatedModule: related?.module ?? null,
            relatedId: related?.id ?? null,
            contactId,
            contact: contactName,
            attendees: [{ kind: 'email', email: body.email, name: body.name }],
        };
        const row = await bookingDeps.insertSystemActivity(tx, fields, BOOKING_ACTOR, now, {
            activityConfig: a.config,
            createdBy: link.ownerUsername,
            rowData: { origin: BOOKING_ORIGIN },
            notify: false,
        });

        const booking = await tx.bookingLinkBooking.create({
            data: {
                bookingLinkId: link.id,
                activityId: row.after.id,
                ownerUsername: link.ownerUsername,
                startAt: start,
                endAt: end,
                visitorName: body.name,
                visitorEmail: body.email,
                visitorPhone: body.phone ?? null,
                visitorCompany: body.company ?? null,
                contactId,
                tokenHash: a.tokenHash,
            },
            select: { id: true, startAt: true, endAt: true },
        });

        await insertMissingNotifications(
            tx,
            [
                {
                    username: link.ownerUsername,
                    kind: BOOKING_NOTIFICATION_KIND,
                    title: `New booking: ${body.name}`,
                    body: `${link.title} · ${whenText(start)}${body.company ? ` · ${body.company}` : ''}`,
                    entityModule: 'activities',
                    entityId: row.after.id,
                    dueAt: start,
                    actor: BOOKING_ACTOR,
                    dedupeKey: `${BOOKING_NOTIFICATION_KIND}:${booking.id}`,
                },
            ],
            now,
        );
        return { kind: 'created', booking, rows: [row] };
    });
}

export const bookingPublicService = {
    async view(slug: string): Promise<PublicLinkDto> {
        const { link, ownerName } = await liveLink(slug);
        const days = bookableDays(link.rules, bookingDeps.now(), ENV.BUSINESS_TIMEZONE);
        // From the cached form configuration; a failure just shows the stored value.
        const config = await bookingDeps.loadActivityConfig().catch(() => null);
        return {
            slug: link.slug,
            title: link.title,
            ownerName,
            typeLabel: typeLabelOf(config, link.followupType),
            durations: link.durations,
            defaultDuration: link.durations[0],
            location: link.location ?? '',
            note: link.note ?? '',
            askPhone: link.askPhone,
            askCompany: link.askCompany,
            timeZone: ENV.BUSINESS_TIMEZONE,
            firstDay: days.first,
            lastDay: days.last,
        };
    },

    async slots(slug: string, rawQuery: unknown): Promise<PublicSlotsDto> {
        const query = slotsQuerySchema.parse(rawQuery ?? {});
        const { link } = await liveLink(slug);
        const now = bookingDeps.now();
        const tz = ENV.BUSINESS_TIMEZONE;
        const duration = query.duration ?? link.durations[0];
        if (!link.durations.includes(duration)) {
            throw new HttpError('Pick one of the offered durations.', StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message: 'Pick one of the offered durations.', path: ['duration'] }] });
        }
        const bounds = bookableDays(link.rules, now, tz);
        const fromDay = !query.from || query.from < bounds.first ? bounds.first : query.from > bounds.last ? bounds.last : query.from;
        const lastAsked = addDays(fromDay, query.days - 1);
        const lastDay = lastAsked > bounds.last ? bounds.last : lastAsked;
        const range = daysRange(fromDay, lastDay, tz);
        const [busy, holidays, bookedPerDay] = await Promise.all([
            ownerBusy(link, range, now),
            bookingDeps.holidays(fromDay, lastDay),
            link.rules.maxPerDay !== null ? bookingDeps.bookedPerDay(prisma, link.id, range, tz) : Promise.resolve(new Map<string, number>()),
        ]);
        const days = computeSlots({ rules: link.rules, durationMinutes: duration, fromDay, days: query.days, now, tz, busy, holidays, bookedPerDay });
        const version = { id: link.id, updatedAt: link.updatedAt };
        const prev = addDays(fromDay, -query.days);
        return {
            timeZone: tz,
            duration,
            days: days.map((d) => ({ date: d.day, slots: d.starts.map((start) => ({ start: start.toISOString(), token: signSlot(version, { start, durationMinutes: duration }, now) })) })),
            firstDay: bounds.first,
            lastDay: bounds.last,
            prevFrom: fromDay > bounds.first ? (prev < bounds.first ? bounds.first : prev) : null,
            nextFrom: lastDay < bounds.last ? addDays(lastDay, 1) : null,
        };
    },

    async book(slug: string, rawBody: unknown, meta: RequestMeta = {}): Promise<BookingConfirmationDto> {
        const body = bookBodySchema.parse(rawBody ?? {});
        const { link, ownerName } = await liveLink(slug);
        // Honeypot: a field people never see. Refused without detail (after the 404 check, so it says nothing more).
        if (body.website && body.website.trim()) {
            logger.info({ linkId: link.id }, 'Booking page: honeypot filled; refused');
            throw new HttpError('Your booking could not be completed. Please try again.', StatusCodes.BAD_REQUEST, { code: BOOKING_ERROR_CODES.rejected });
        }
        const now = bookingDeps.now();
        const tz = ENV.BUSINESS_TIMEZONE;
        const verified = verifySlot({ id: link.id, updatedAt: link.updatedAt }, body.token, now);
        if (!verified.ok) throw slotUnavailable(verified.problem === 'expired' ? 'Those times were shown a while ago. Please pick a time again.' : undefined);
        const { start, durationMinutes } = verified.claim;
        if (!link.durations.includes(durationMinutes)) throw slotUnavailable();
        const day = zonedDayOf(start, tz);
        if (slotRuleProblem(link.rules, start, durationMinutes, now, tz, await bookingDeps.holidays(day, day))) throw slotUnavailable();
        const end = new Date(start.getTime() + durationMinutes * MINUTE);

        // The company calendar again (network: outside the transaction). The CRM part is re-read inside it.
        const busy = await ownerBusy(link, { start: start.getTime() - link.rules.bufferBeforeMinutes * MINUTE, end: end.getTime() + link.rules.bufferAfterMinutes * MINUTE }, now);
        if (clashes(start.getTime(), end.getTime(), link.rules, busy)) throw slotUnavailable('That time was just taken. Please pick another time.');

        const [config, calendarSettings] = await Promise.all([bookingDeps.loadActivityConfig(), bookingDeps.loadCalendarSettings()]);
        const attempt: Attempt = { link, ownerName, body, start, end, tokenHash: tokenHashOf(body.token), config, followUpActivities: calendarSettings.followUpActivities, now };

        // Audit entries carry where this came from: the public page, the visitor's IP and browser.
        const result = await runWithAuditOrigin(
            { source: 'API', requestId: meta.requestId, route: BOOKING_AUDIT_ROUTE, httpMethod: 'POST', ipAddress: meta.ipAddress, userAgent: meta.userAgent },
            async () => {
                try {
                    return await bookOnce(attempt);
                } catch (err) {
                    // D45: a unique violation aborted the transaction; one retry from the start finds the winner's row.
                    if (!isUniqueViolation(err)) throw err;
                    logger.info({ linkId: link.id }, 'Booking: the same slot token raced; retrying once');
                    return bookOnce(attempt);
                }
            },
        );
        if (result.kind === 'created') {
            await bookingDeps.afterCommit(result.rows, link.ownerUsername).catch((err: Error) => logger.warn({ err: err.message, linkId: link.id }, 'Booking: post-commit steps failed'));
        }
        return confirmation(link, ownerName, result.booking, now, typeLabelOf(config, link.followupType));
    },
};
