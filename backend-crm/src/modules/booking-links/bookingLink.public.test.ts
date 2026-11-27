import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { prisma } from '../../config/prisma.js';
import type { ActivityConfig } from '../activities/activity.service.js';
import type { BusyTimesDto } from '../calendar-sync/busy.service.js';
import { bookingDeps, bookingPublicService, bookingVideo, confirmationVideo, type ActivityVideo } from './bookingLink.public.js';
import type { LinkConfig, PublicLink } from './bookingLink.service.js';
import { addDays } from '../../utils/zonedTime.js';
import { busyBlocks } from './bookingLink.slots.js';
import { signSlot } from './bookingLink.token.js';

/**
 * The public booking flow against doubles: the link lookup, settings, busy times, holidays and the system write
 * path are replaced through `bookingDeps`; `prisma.$transaction` hands the callback an in-memory client (bookings,
 * activities, contact emails, notifications) that is rolled back when the callback throws.
 */

/** Monday 30 Nov 2026, 09:00 IST. */
const NOW = new Date('2026-11-30T03:30:00.000Z');
const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

const LINK: LinkConfig = {
    id: 'link-1',
    slug: 'priya-demo-abcdefgh',
    ownerUsername: 'priya',
    title: 'Product demo',
    followupType: 'Meeting',
    durations: [30, 60],
    location: 'Office, Pune',
    videoMeeting: null,
    note: null,
    reminder: '15 minutes before',
    askPhone: true,
    askCompany: true,
    relatedModule: null,
    relatedId: null,
    isActive: true,
    rules: {
        slotStepMinutes: 30,
        availability: { '1': [{ start: '10:00', end: '13:00' }] },
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 10,
        minNoticeMinutes: 60,
        horizonDays: 14,
        maxPerDay: null,
    },
    updatedAt: new Date('2026-11-26T10:00:00.000Z'),
    createdAt: new Date('2026-11-26T10:00:00.000Z'),
    createdBy: 'priya',
};

interface Booking {
    id: string;
    bookingLinkId: string;
    activityId: string;
    startAt: Date;
    endAt: Date;
    visitorEmail: string;
    tokenHash: string;
    contactId: string | null;
}

interface World {
    enabled: boolean;
    link: PublicLink | null;
    calendarStatus: 'ok' | 'not_connected' | 'error' | 'unavailable' | 'unknown';
    providerBusy: { start: string; end: string }[];
    holidays: Set<string>;
    activities: { id: string; startAt: Date; endAt: Date; followupType: string; allDay: boolean }[];
    bookings: Booking[];
    contactEmails: { email: string; contactId: string }[];
    notifications: Record<string, unknown>[];
    inserted: { fields: Record<string, unknown>; actor: string; opts: Record<string, unknown> }[];
    afterCommit: number;
    /** Throw a P2002 from the booking insert this many times. */
    raceOnce: number;
    transactions: number;
    /** Per-link rate limit charges (`kind:linkId`). */
    charges: string[];
    /** busyTimes calls: the window and the budget key. */
    busyCalls: { from: string; to: string; budgetKey?: string }[];
    /** What the owner's company calendar creates video links for, and how often it was asked. */
    ownerVideo: 'meet' | 'teams' | null;
    ownerVideoReads: number;
    /** Conference columns of booked activities (by activity id), for resubmitted confirmations. */
    activityVideo: Map<string, ActivityVideo>;
    /** Followup Type options of the activity configuration. */
    typeOptions: { value: string; label: string; isActive: boolean; meta?: Record<string, unknown> }[];
}

let world: World;
const realTransaction = Object.getOwnPropertyDescriptor(prisma, '$transaction');

function overlaps(a: { startAt: Date; endAt: Date }, from: Date, to: Date): boolean {
    return a.startAt < to && a.endAt > from;
}

function installTransaction(): void {
    const tx = {
        $queryRaw: async () => [{ result: 0 }],
        bookingLinkBooking: {
            findUnique: async ({ where }: { where: { tokenHash: string } }) => world.bookings.find((b) => b.tokenHash === where.tokenHash) ?? null,
            findMany: async ({ where }: { where: { bookingLinkId: string; startAt: { gte: Date; lt: Date } } }) =>
                world.bookings.filter((b) => b.bookingLinkId === where.bookingLinkId && b.startAt >= where.startAt.gte && b.startAt < where.startAt.lt),
            create: async ({ data }: { data: Omit<Booking, 'id'> }) => {
                if (world.raceOnce > 0) {
                    world.raceOnce -= 1;
                    // The racing request's row, committed meanwhile.
                    world.bookings.push({ ...data, id: 'booking-race' });
                    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
                }
                const row = { ...data, id: `booking-${world.bookings.length + 1}` };
                world.bookings.push(row);
                return { id: row.id, startAt: row.startAt, endAt: row.endAt, activityId: row.activityId };
            },
        },
        activity: {
            findMany: async ({ where }: { where: { id?: { in: string[] } } }) => {
                if (where.id) return world.activities.filter((a) => where.id!.in.includes(a.id)).map((a) => ({ id: a.id }));
                return world.activities;
            },
        },
        entityEmail: {
            findMany: async ({ where }: { where: { email: string } }) => world.contactEmails.filter((e) => e.email === where.email).map((e) => ({ contactId: e.contactId, contact: { name: `Contact ${e.contactId}` } })),
        },
        notification: {
            findMany: async () => [],
            createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
                world.notifications.push(...data);
                return { count: data.length };
            },
        },
        userPreference: { findMany: async () => [] },
        // Related leads: none exists (the link's related record was deleted since).
        lead: { findUnique: async () => null },
    };
    Object.defineProperty(prisma, '$transaction', {
        configurable: true,
        writable: true,
        value: async (fn: (client: unknown) => Promise<unknown>) => {
            world.transactions += 1;
            const snapshot = { bookings: [...world.bookings], activities: [...world.activities], notifications: [...world.notifications], inserted: [...world.inserted] };
            try {
                return await fn(tx);
            } catch (err) {
                // Roll back, except the racing request's row (another transaction committed it).
                const race = world.bookings.filter((b) => b.id === 'booking-race');
                Object.assign(world, snapshot);
                world.bookings.push(...race.filter((r) => !world.bookings.includes(r)));
                throw err;
            }
        },
    });
}

beforeEach(() => {
    world = {
        enabled: true,
        link: { link: LINK, ownerName: 'Priya Sharma' },
        calendarStatus: 'ok',
        providerBusy: [],
        holidays: new Set(),
        activities: [],
        bookings: [],
        contactEmails: [],
        notifications: [],
        inserted: [],
        afterCommit: 0,
        raceOnce: 0,
        transactions: 0,
        charges: [],
        busyCalls: [],
        ownerVideo: 'meet',
        ownerVideoReads: 0,
        activityVideo: new Map(),
        typeOptions: [],
    };
    installTransaction();
    mock.method(bookingDeps, 'now', () => NOW);
    mock.method(bookingDeps, 'loadBookingSettings', async () => ({ enabled: world.enabled, whoCanCreate: 'everyone' }));
    mock.method(bookingDeps, 'findPublicLink', async (slug: string) => (world.link && world.link.link.slug === slug ? world.link : null));
    mock.method(bookingDeps, 'holidays', async () => world.holidays);
    mock.method(bookingDeps, 'chargeLink', async (kind: string, linkId: string) => {
        world.charges.push(`${kind}:${linkId}`);
    });
    mock.method(bookingDeps, 'bookingByToken', async (linkId: string, tokenHash: string) => world.bookings.find((b) => b.bookingLinkId === linkId && b.tokenHash === tokenHash) ?? null);
    // Like the real busy times: the owner's CRM activities (always) plus the company calendar part when readable.
    mock.method(bookingDeps, 'busyTimes', async (query: { from: string; to: string }, _user: unknown, _now: Date, opts: { budgetKey?: string } = {}): Promise<BusyTimesDto> => {
        world.busyCalls.push({ from: query.from, to: query.to, budgetKey: opts.budgetKey });
        const from = new Date(query.from);
        const to = new Date(query.to);
        const crm = world.activities.filter((a) => overlaps(a, from, to)).map((a) => ({ start: a.startAt.toISOString(), end: a.endAt.toISOString(), kind: 'busy' as const }));
        const provider = world.calendarStatus === 'ok' ? world.providerBusy.map((b) => ({ ...b, kind: 'busy' as const })) : [];
        return {
            timeZone: 'Asia/Kolkata',
            from: query.from,
            to: query.to,
            generatedAt: NOW.toISOString(),
            people:
                world.calendarStatus === 'unknown'
                    ? [{ username: 'priya', name: 'priya', provider: null, status: 'unknown', sources: [], busy: [] }]
                    : [{ username: 'priya', name: 'Priya Sharma', provider: 'google', status: world.calendarStatus, sources: [], busy: [...crm, ...provider] }],
        };
    });
    mock.method(bookingDeps, 'loadActivityConfig', async () => ({ followupTypes: { options: world.typeOptions } }) as unknown as ActivityConfig);
    mock.method(bookingDeps, 'ownerVideo', async () => {
        world.ownerVideoReads += 1;
        return world.ownerVideo;
    });
    mock.method(bookingDeps, 'activityVideo', async (id: string) => world.activityVideo.get(id) ?? null);
    mock.method(bookingDeps, 'loadCalendarSettings', async () => ({ followUpActivities: false }) as never);
    mock.method(bookingDeps, 'insertSystemActivity', async (_tx: unknown, fields: Record<string, unknown>, actor: string, _now: Date, opts: Record<string, unknown>) => {
        world.inserted.push({ fields, actor, opts });
        const id = `activity-${world.inserted.length}`;
        world.activities.push({ id, startAt: new Date(fields.startAt as string), endAt: new Date(fields.endAt as string), followupType: 'Meeting', allDay: false });
        return { before: null, after: { id } } as never;
    });
    mock.method(bookingDeps, 'afterCommit', async () => {
        world.afterCommit += 1;
    });
});

afterEach(() => {
    mock.restoreAll();
    if (realTransaction) Object.defineProperty(prisma, '$transaction', realTransaction);
});

const tokenFor = (start: Date, minutes = 30, link: LinkConfig = LINK) => signSlot({ id: link.id, updatedAt: link.updatedAt }, { start, durationMinutes: minutes }, NOW);
const visitor = (token: string, extra: Record<string, unknown> = {}) => ({ token, name: 'Asha Rao', email: 'asha@example.com', company: 'Acme', ...extra });

async function rejects(promise: Promise<unknown>, status: number, code?: string): Promise<void> {
    await assert.rejects(promise, (err: { statusCode?: number; status?: number; code?: string; details?: { code?: string } }) => {
        assert.equal(err.statusCode ?? err.status, status);
        if (code) assert.equal(err.code ?? err.details?.code, code);
        return true;
    });
}

describe('public booking: the one 404', () => {
    it('is the same for a missing link, the switch off, and an owner busy times no longer knows', async () => {
        const errors: string[] = [];
        for (const setup of [() => (world.link = null), () => (world.enabled = false)]) {
            setup();
            await assert.rejects(bookingPublicService.view(LINK.slug), (err: Error & { statusCode?: number }) => {
                errors.push(`${err.statusCode}:${err.message}`);
                return true;
            });
            world.link = { link: LINK, ownerName: 'Priya Sharma' };
            world.enabled = true;
        }
        world.calendarStatus = 'unknown';
        await assert.rejects(bookingPublicService.slots(LINK.slug, {}), (err: Error & { statusCode?: number }) => {
            errors.push(`${err.statusCode}:${err.message}`);
            return true;
        });
        assert.equal(new Set(errors).size, 1, errors.join(' | '));
        assert.match(errors[0], /^404:/);
    });

    it('view shows only public fields', async () => {
        const view = await bookingPublicService.view(LINK.slug);
        assert.equal(view.ownerName, 'Priya Sharma');
        assert.equal(view.firstDay, '2026-11-30');
        assert.equal(view.lastDay, '2026-12-14');
        assert.ok(!('ownerUsername' in view));
    });
});

describe('public booking: slots', () => {
    it('offers signed starts and leaves out busy times; never sends the busy blocks', async () => {
        world.providerBusy = [{ start: ist('2026-11-30', '11:00').toISOString(), end: ist('2026-11-30', '11:30').toISOString() }];
        const page = await bookingPublicService.slots(LINK.slug, { days: '1' });
        assert.equal(page.days.length, 1);
        const starts = page.days[0].slots.map((s) => s.start);
        assert.deepEqual(starts, ['10:00', '11:30', '12:00', '12:30'].map((t) => ist('2026-11-30', t).toISOString()));
        assert.ok(page.days[0].slots.every((s) => /^v1\./.test(s.token)));
        assert.ok(!/busy|kind|priya"/.test(JSON.stringify(page)), 'no busy blocks or usernames');
        assert.equal(page.prevFrom, null);
        assert.equal(page.nextFrom, '2026-12-01');
    });

    it('refuses a duration the link does not offer', async () => {
        await rejects(bookingPublicService.slots(LINK.slug, { duration: '45' }), 400);
    });

    it('answers 503 when the company calendar can’t be read (fail closed)', async () => {
        world.calendarStatus = 'error';
        await rejects(bookingPublicService.slots(LINK.slug, {}), 503, 'CALENDAR_UNAVAILABLE');
        world.calendarStatus = 'unavailable';
        await rejects(bookingPublicService.slots(LINK.slug, {}), 503, 'CALENDAR_UNAVAILABLE');
    });

    it('reads busy times in the fixed blocks, whatever window is asked; counts the link only for valid asks', async () => {
        await bookingPublicService.slots(LINK.slug, { from: '2026-12-02', days: '2' });
        const first = world.busyCalls.map((c) => `${c.from}/${c.to}`);
        world.busyCalls = [];
        await bookingPublicService.slots(LINK.slug, { from: '2026-12-03', days: '3' });
        assert.deepEqual(world.busyCalls.map((c) => `${c.from}/${c.to}`), first, 'the same reads (and cache keys)');
        const block = busyBlocks('2026-12-02', '2026-12-02')[0];
        assert.equal(first.length, 1);
        assert.equal(block.last >= '2026-12-05' && block.first <= '2026-12-02', true, 'one block covers both asks');
        assert.equal(first[0], `${ist(block.first, '00:00').toISOString()}/${ist(addDays(block.last, 1), '00:00').toISOString()}`);
        assert.ok(world.busyCalls.every((c) => c.budgetKey === 'booking:link-1'));
        assert.deepEqual(world.charges, ['slots:link-1', 'slots:link-1']);
        await rejects(bookingPublicService.slots(LINK.slug, { duration: '45' }), 400);
        world.link = null;
        await rejects(bookingPublicService.slots(LINK.slug, {}), 404);
        assert.equal(world.charges.length, 2, 'a bad query or a missing link is not counted per link');
    });

    it('not connected = CRM activities only', async () => {
        world.calendarStatus = 'not_connected';
        const page = await bookingPublicService.slots(LINK.slug, { days: '1' });
        assert.equal(page.days[0].slots.length, 6);
    });
});

describe('public booking: book', () => {
    it('creates the meeting for the owner, the booking row and the owner notification', async () => {
        const start = ist('2026-11-30', '11:00');
        const result = await bookingPublicService.book(LINK.slug, visitor(tokenFor(start)), { ipAddress: '203.0.113.9' });
        assert.equal(result.booking.start, start.toISOString());
        assert.equal(result.booking.durationMinutes, 30);
        assert.equal(result.booking.ownerName, 'Priya Sharma');
        assert.ok(result.ics.includes('BEGIN:VEVENT'));
        assert.equal(world.inserted.length, 1);
        const [{ fields, actor, opts }] = world.inserted;
        assert.equal(actor, 'system');
        assert.equal(fields.assignedTo, 'priya');
        assert.deepEqual(fields.attendees, [{ kind: 'email', email: 'asha@example.com', name: 'Asha Rao' }]);
        assert.equal(opts.createdBy, 'priya');
        assert.deepEqual(opts.rowData, { origin: 'booking' });
        assert.equal(opts.notify, false);
        assert.equal(world.bookings.length, 1);
        assert.equal(world.notifications.length, 1);
        assert.equal(world.notifications[0].kind, 'booking_created');
        assert.equal(world.notifications[0].username, 'priya');
        assert.equal(world.notifications[0].entityModule, 'activities');
        assert.equal(world.afterCommit, 1);
    });

    it('the same token twice is one booking (same visitor) or a conflict (someone else)', async () => {
        const token = tokenFor(ist('2026-11-30', '11:00'));
        const first = await bookingPublicService.book(LINK.slug, visitor(token));
        // The busy times now include the visitor's own meeting: the resubmit must still get its confirmation.
        const again = await bookingPublicService.book(LINK.slug, visitor(token, { email: 'ASHA@example.com' }));
        assert.equal(again.booking.id, first.booking.id);
        assert.equal(again.booking.start, first.booking.start);
        assert.equal(world.inserted.length, 1);
        assert.equal(world.afterCommit, 1);
        await rejects(bookingPublicService.book(LINK.slug, visitor(token, { email: 'other@example.com' })), 409, 'SLOT_UNAVAILABLE');
    });

    it('a resubmit after the token expired (a lost response) still gets the same confirmation', async () => {
        const token = tokenFor(ist('2026-11-30', '11:00'));
        const first = await bookingPublicService.book(LINK.slug, visitor(token));
        mock.method(bookingDeps, 'now', () => new Date(NOW.getTime() + 45 * 60_000));
        const again = await bookingPublicService.book(LINK.slug, visitor(token));
        assert.equal(again.booking.id, first.booking.id);
        assert.equal(world.inserted.length, 1);
        // An expired token that never booked is refused.
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '12:00')))), 409, 'SLOT_UNAVAILABLE');
    });

    it('counts the link only for valid, unused tokens; the confirmation read uses its own budget', async () => {
        await assert.rejects(bookingPublicService.book(LINK.slug, {}));
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00')), { website: 'http://spam' })), 400, 'BOOKING_REJECTED');
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00'), 30, { ...LINK, id: 'link-2' }))), 409, 'SLOT_UNAVAILABLE');
        assert.deepEqual(world.charges, [], 'junk is not counted per link');
        const token = tokenFor(ist('2026-11-30', '11:00'));
        await bookingPublicService.book(LINK.slug, visitor(token));
        await bookingPublicService.book(LINK.slug, visitor(token));
        assert.deepEqual(world.charges, ['book:link-1'], 'one real attempt; the resubmit is free');
        assert.ok(world.busyCalls.length > 0 && world.busyCalls.every((c) => c.budgetKey === 'booking-book:link-1'));
    });

    it('a CRM activity in the slot (or its buffer) wins', async () => {
        world.activities.push({ id: 'a1', startAt: ist('2026-11-30', '11:30'), endAt: ist('2026-11-30', '12:00'), followupType: 'Meeting', allDay: false });
        // 11:00–11:30 plus the 10-minute buffer after reaches 11:40.
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00')))), 409, 'SLOT_UNAVAILABLE');
        assert.equal(world.bookings.length, 0);
        assert.equal(world.inserted.length, 0);
    });

    it('a second visitor can’t take the slot just booked', async () => {
        await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00'))));
        const otherToken = signSlot({ id: LINK.id, updatedAt: LINK.updatedAt }, { start: ist('2026-11-30', '11:00'), durationMinutes: 30 }, new Date(NOW.getTime() + 1000));
        await rejects(bookingPublicService.book(LINK.slug, visitor(otherToken, { email: 'b@example.com' })), 409, 'SLOT_UNAVAILABLE');
        assert.equal(world.bookings.length, 1);
    });

    it('a company calendar block refuses before any write; an unreadable calendar is 503', async () => {
        world.providerBusy = [{ start: ist('2026-11-30', '11:00').toISOString(), end: ist('2026-11-30', '11:30').toISOString() }];
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00')))), 409, 'SLOT_UNAVAILABLE');
        world.providerBusy = [];
        world.calendarStatus = 'error';
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00')))), 503, 'CALENDAR_UNAVAILABLE');
        assert.equal(world.transactions, 0);
    });

    it('refuses a token for another link, a changed link, an expired one, or a slot off the rules', async () => {
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00'), 30, { ...LINK, id: 'link-2' }))), 409, 'SLOT_UNAVAILABLE');
        await rejects(
            bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00'), 30, { ...LINK, updatedAt: new Date(LINK.updatedAt.getTime() - 1) }))),
            409,
            'SLOT_UNAVAILABLE',
        );
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '09:30')))), 409, 'SLOT_UNAVAILABLE');
        world.holidays = new Set(['2026-11-30']);
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00')))), 409, 'SLOT_UNAVAILABLE');
        world.holidays = new Set();
        mock.method(bookingDeps, 'now', () => new Date(NOW.getTime() + 2 * 3600_000));
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '12:00')))), 409, 'SLOT_UNAVAILABLE');
        assert.equal(world.bookings.length, 0);
    });

    it('the honeypot refuses without detail; bad bodies are 400', async () => {
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00')), { website: 'http://spam' })), 400, 'BOOKING_REJECTED');
        await assert.rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00')), { admin: true })));
        assert.equal(world.bookings.length, 0);
    });

    it('a day at its cap is full', async () => {
        world.link = { link: { ...LINK, rules: { ...LINK.rules, maxPerDay: 1 } }, ownerName: 'Priya Sharma' };
        await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '10:00'))));
        await rejects(bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '12:00')), { email: 'b@example.com' })), 409, 'BOOKING_DAY_FULL');
    });

    it('links exactly one matching contact', async () => {
        world.contactEmails = [{ email: 'asha@example.com', contactId: 'c1' }];
        await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '10:00'))));
        assert.equal(world.inserted[0].fields.contactId, 'c1');
        assert.equal(world.inserted[0].fields.contact, 'Contact c1');
        world.contactEmails.push({ email: 'b@example.com', contactId: 'c2' }, { email: 'b@example.com', contactId: 'c3' });
        await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '12:00')), { email: 'b@example.com' }));
        assert.equal(world.inserted[1].fields.contactId, null, 'two contacts share the email: none linked');
    });

    it('a related record deleted since the link was made is dropped (the contact match applies)', async () => {
        world.link = { link: { ...LINK, relatedModule: 'leads', relatedId: 'lead-gone' }, ownerName: 'Priya Sharma' };
        world.contactEmails = [{ email: 'asha@example.com', contactId: 'c1' }];
        await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '10:00'))));
        assert.equal(world.inserted[0].fields.relatedModule, null);
        assert.equal(world.inserted[0].fields.relatedId, null);
        assert.equal(world.inserted[0].fields.contactId, 'c1');
    });

    it('a unique violation (the same token at once) is retried once and finds the first booking', async () => {
        world.raceOnce = 1;
        const token = tokenFor(ist('2026-11-30', '11:00'));
        // The racing row carries the same token hash and this visitor's email.
        const result = await bookingPublicService.book(LINK.slug, visitor(token));
        assert.equal(result.booking.id, 'booking-race');
        assert.equal(world.transactions, 2);
        assert.equal(world.inserted.length, 0, 'the first try rolled back');
        assert.equal(world.afterCommit, 0);
    });
});

describe('public booking: the link\'s video meeting', () => {
    const MEETING_WITH_VIDEO = { value: 'Meeting', label: 'Meeting', isActive: true, meta: { videoMeeting: true } };
    const withVideo = (videoMeeting: 'meet' | 'teams' = 'meet') => {
        world.link = { link: { ...LINK, videoMeeting }, ownerName: 'Priya Sharma' };
        world.typeOptions = [MEETING_WITH_VIDEO];
    };

    it('the page names the video meeting from the link and type only (never the owner’s calendar)', async () => {
        withVideo('teams');
        world.ownerVideo = null;
        const view = await bookingPublicService.view(LINK.slug);
        assert.deepEqual(view.videoMeeting, { provider: 'teams', label: 'Microsoft Teams' });
        assert.equal(world.ownerVideoReads, 0, 'the page view reads no calendar');
        world.typeOptions = [{ ...MEETING_WITH_VIDEO, meta: {} }];
        assert.equal((await bookingPublicService.view(LINK.slug)).videoMeeting, null, 'a type that no longer offers video');
        world.link = { link: LINK, ownerName: 'Priya Sharma' };
        assert.equal((await bookingPublicService.view(LINK.slug)).videoMeeting, null);
    });

    it('a booking asks for the link with the meeting; the confirmation and .ics say the organiser sends it', async () => {
        withVideo('meet');
        const result = await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00'))));
        assert.equal(world.inserted[0].fields.videoMeeting, 'meet');
        assert.doesNotMatch(String(world.inserted[0].fields.remarks), /video|Meet/i);
        assert.deepEqual(result.video, { provider: 'meet', label: 'Google Meet', joinUrl: null });
        const unfolded = result.ics.replace(/\r\n /g, '');
        assert.match(unfolded, /DESCRIPTION:Google Meet link: sent by Priya Sharma/);
        assert.doesNotMatch(unfolded, /\r\nURL:/);
        assert.equal(world.ownerVideoReads, 1);
    });

    it('no video meeting on the link: nothing asked, no calendar read', async () => {
        world.typeOptions = [MEETING_WITH_VIDEO];
        const result = await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '11:00'))));
        assert.equal(world.inserted[0].fields.videoMeeting, null);
        assert.equal(result.video, null);
        assert.equal(world.ownerVideoReads, 0);
    });

    it('books without the link (and notes why for the owner) when the calendar or the type no longer allows it', async () => {
        withVideo('meet');
        world.ownerVideo = 'teams';
        const first = await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '10:00'))));
        assert.equal(world.inserted[0].fields.videoMeeting, null);
        assert.match(String(world.inserted[0].fields.remarks), /No Google Meet link was requested: The owner's company calendar creates Microsoft Teams links/);
        assert.equal(first.video, null);
        assert.doesNotMatch(first.ics, /Meet/, 'the visitor hears nothing about a link that won’t come');

        world.ownerVideo = 'meet';
        world.typeOptions = [{ ...MEETING_WITH_VIDEO, meta: {} }];
        const second = await bookingPublicService.book(LINK.slug, visitor(tokenFor(ist('2026-11-30', '12:00')), { email: 'b@example.com' }));
        assert.equal(world.inserted[1].fields.videoMeeting, null);
        assert.match(String(world.inserted[1].fields.remarks), /Meeting doesn't offer video meetings any more/);
        assert.equal(second.video, null);
    });

    it('a resubmit shows the join link once the calendar made it (and only a trusted one)', async () => {
        withVideo('meet');
        const token = tokenFor(ist('2026-11-30', '11:00'));
        const first = await bookingPublicService.book(LINK.slug, visitor(token));
        const activityId = world.bookings[0].activityId;
        world.activityVideo.set(activityId, { conferenceProvider: 'meet', conferenceState: 'ready', conferenceJoinUrl: 'https://meet.google.com/abc-defg-hij', status: 'Planned', isDeleted: false });
        const again = await bookingPublicService.book(LINK.slug, visitor(token));
        assert.equal(again.booking.id, first.booking.id);
        assert.deepEqual(again.video, { provider: 'meet', label: 'Google Meet', joinUrl: 'https://meet.google.com/abc-defg-hij' });
        const unfolded = again.ics.replace(/\r\n /g, '');
        assert.match(unfolded, /\r\nURL:https:\/\/meet.google.com\/abc-defg-hij\r\n/);
        assert.match(unfolded, /DESCRIPTION:Google Meet: https:\/\/meet.google.com\/abc-defg-hij/);

        world.activityVideo.set(activityId, { conferenceProvider: 'meet', conferenceState: 'ready', conferenceJoinUrl: 'https://evil.example.com/x', status: 'Planned', isDeleted: false });
        assert.deepEqual((await bookingPublicService.book(LINK.slug, visitor(token))).video, { provider: 'meet', label: 'Google Meet', joinUrl: null });
        world.activityVideo.set(activityId, { conferenceProvider: 'meet', conferenceState: 'ready', conferenceJoinUrl: 'https://meet.google.com/abc-defg-hij', status: 'Cancelled', isDeleted: false });
        assert.equal((await bookingPublicService.book(LINK.slug, visitor(token))).video, null, 'a cancelled meeting shows no link');
    });

    it('bookingVideo and confirmationVideo (pure)', () => {
        const config = { followupTypes: { options: [MEETING_WITH_VIDEO] } } as unknown as ActivityConfig;
        assert.deepEqual(bookingVideo({ videoMeeting: null, followupType: 'Meeting' }, config, 'meet'), { videoMeeting: null, note: null });
        assert.deepEqual(bookingVideo({ videoMeeting: 'teams', followupType: 'Meeting' }, config, 'teams'), { videoMeeting: 'teams', note: null });
        assert.match(bookingVideo({ videoMeeting: 'teams', followupType: 'Meeting' }, config, null).note ?? '', /needs the owner's company calendar/);
        assert.equal(bookingVideo({ videoMeeting: 'meet', followupType: 'Task' }, config, 'meet').videoMeeting, null);
        assert.equal(confirmationVideo(null), null);
        assert.equal(confirmationVideo({ conferenceProvider: 'zoom', conferenceState: 'ready', conferenceJoinUrl: 'https://zoom.us/j/1', status: 'Planned', isDeleted: false }), null);
        assert.deepEqual(confirmationVideo({ conferenceProvider: 'teams', conferenceState: 'requested', conferenceJoinUrl: null, status: 'Planned', isDeleted: false }), {
            provider: 'teams',
            label: 'Microsoft Teams',
            joinUrl: null,
        });
        assert.equal(confirmationVideo({ conferenceProvider: 'teams', conferenceState: 'failed', conferenceJoinUrl: null, status: 'Planned', isDeleted: true }), null);
    });
});
