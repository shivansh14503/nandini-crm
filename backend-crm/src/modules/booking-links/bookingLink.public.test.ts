import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { prisma } from '../../config/prisma.js';
import type { ActivityConfig } from '../activities/activity.service.js';
import type { BusyTimesDto } from '../calendar-sync/busy.service.js';
import { bookingDeps, bookingPublicService } from './bookingLink.public.js';
import type { LinkConfig, PublicLink } from './bookingLink.service.js';
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
                return { id: row.id, startAt: row.startAt, endAt: row.endAt };
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
    };
    installTransaction();
    mock.method(bookingDeps, 'now', () => NOW);
    mock.method(bookingDeps, 'loadBookingSettings', async () => ({ enabled: world.enabled, whoCanCreate: 'everyone' }));
    mock.method(bookingDeps, 'findPublicLink', async (slug: string) => (world.link && world.link.link.slug === slug ? world.link : null));
    mock.method(bookingDeps, 'holidays', async () => world.holidays);
    mock.method(bookingDeps, 'busyTimes', async (): Promise<BusyTimesDto> => ({
        timeZone: 'Asia/Kolkata',
        from: '',
        to: '',
        generatedAt: NOW.toISOString(),
        people:
            world.calendarStatus === 'unknown'
                ? [{ username: 'priya', name: 'priya', provider: null, status: 'unknown', sources: [], busy: [] }]
                : [{ username: 'priya', name: 'Priya Sharma', provider: 'google', status: world.calendarStatus, sources: [], busy: world.providerBusy.map((b) => ({ ...b, kind: 'busy' as const })) }],
    }));
    mock.method(bookingDeps, 'loadActivityConfig', async () => ({ followupTypes: { options: [] } }) as unknown as ActivityConfig);
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
        const again = await bookingPublicService.book(LINK.slug, visitor(token));
        assert.equal(again.booking.id, first.booking.id);
        assert.equal(world.inserted.length, 1);
        assert.equal(world.afterCommit, 1);
        await rejects(bookingPublicService.book(LINK.slug, visitor(token, { email: 'other@example.com' })), 409, 'SLOT_UNAVAILABLE');
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
