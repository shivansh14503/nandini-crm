import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deliverActivityReminder, reminderKey, type ReminderDb } from './notification.reminders.js';

/**
 * `deliverActivityReminder` against a Prisma double: an in-memory activity row, users and notifications, and a
 * `$transaction` that rolls its writes back when the callback throws (as SQL Server does).
 */

const now = new Date('2026-11-25T04:45:00.000Z');
const updatedAt = new Date('2026-11-24T09:00:00.000Z');

interface ActivityState {
    id: string;
    subject: string;
    followupType: string;
    status: string;
    assignedTo: string;
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
    timeZone: string;
    location: string | null;
    relatedTo: string | null;
    relatedCode: string | null;
    remindAt: Date | null;
    reminderSentAt: Date | null;
    updatedAt: Date;
    isDeleted: boolean;
    attendees: { kind: string; username: string | null; responseStatus: string }[];
}

const baseActivity = (): ActivityState => ({
    id: 'a1',
    subject: 'Demo with ACME',
    followupType: 'Meeting',
    status: 'Planned',
    assignedTo: 'palak',
    startAt: new Date('2026-11-25T05:00:00.000Z'),
    endAt: new Date('2026-11-25T06:00:00.000Z'),
    allDay: false,
    timeZone: 'Asia/Kolkata',
    location: null,
    relatedTo: 'Ramesh',
    relatedCode: 'LD-0012',
    remindAt: new Date('2026-11-25T04:45:00.000Z'),
    reminderSentAt: null,
    updatedAt,
    isDeleted: false,
    attendees: [
        { kind: 'user', username: 'ravi', responseStatus: 'accepted' },
        { kind: 'user', username: 'asha', responseStatus: 'declined' },
        { kind: 'user', username: 'mohan', responseStatus: 'needsAction' },
    ],
});

interface Options {
    activity?: Partial<ActivityState>;
    activeUsers?: string[];
    failInsert?: boolean;
    /** The claim loses this many times (a concurrent edit). */
    loseClaims?: number;
    /** Users who turned activity reminders off (My Profile › Notifications). */
    remindersOff?: string[];
}

function fakeDb(options: Options = {}) {
    const state = {
        activity: { ...baseActivity(), ...options.activity } as ActivityState,
        notifications: [] as { dedupeKey: string; username: string; title: string; body: string | null; createdAt: Date }[],
    };
    const calls = { transactions: 0, claims: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[] };
    let losses = options.loseClaims ?? 0;
    const active = options.activeUsers ?? ['palak', 'ravi', 'asha'];

    // Read inside the claim transaction (the producer's mute filter); users without a row have every kind on.
    const userPreferenceModel = {
        async findMany({ where }: { where: { user: { username: { in: string[] } } } }) {
            const wanted = new Set(where.user.username.in.map((name) => name.toLowerCase()));
            return (options.remindersOff ?? [])
                .filter((name) => wanted.has(name.toLowerCase()))
                .map((username) => ({ user: { username }, inAppActivityReminder: false, inAppActivityAssigned: true, inAppActivityInvited: true, inAppContractRenewal: true }));
        },
    };

    const notificationModel = {
        async findMany({ where }: { where: { dedupeKey: { in: string[] } } }) {
            return state.notifications.filter((row) => where.dedupeKey.in.includes(row.dedupeKey)).map((row) => ({ dedupeKey: row.dedupeKey }));
        },
        async createMany({ data }: { data: typeof state.notifications }) {
            if (options.failInsert) throw new Error('insert failed');
            state.notifications.push(...data);
            return { count: data.length };
        },
    };

    const db = {
        activity: {
            async findUnique({ where }: { where: { id: string } }) {
                return where.id === state.activity.id ? { ...state.activity, attendees: [...state.activity.attendees] } : null;
            },
        },
        user: {
            async findMany({ where }: { where: { username: { in: string[] } } }) {
                const wanted = new Set(where.username.in.map((name) => name.toLowerCase()));
                return active.filter((name) => wanted.has(name.toLowerCase())).map((username) => ({ username }));
            },
        },
        notification: notificationModel,
        userPreference: userPreferenceModel,
        async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
            calls.transactions++;
            const snapshot = { activity: { ...state.activity }, notifications: [...state.notifications] };
            const tx = {
                activity: {
                    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
                        calls.claims.push({ where, data });
                        if (losses > 0) {
                            losses--;
                            return { count: 0 };
                        }
                        const row = state.activity;
                        const matches =
                            row.id === where.id &&
                            row.reminderSentAt === null &&
                            (row.remindAt?.getTime() ?? null) === ((where.remindAt as Date | null)?.getTime() ?? null) &&
                            row.updatedAt.getTime() === (where.updatedAt as Date).getTime();
                        if (!matches) return { count: 0 };
                        Object.assign(row, data);
                        return { count: 1 };
                    },
                },
                notification: notificationModel,
                userPreference: userPreferenceModel,
            };
            try {
                return await fn(tx);
            } catch (err) {
                state.activity = snapshot.activity;
                state.notifications = snapshot.notifications;
                throw err;
            }
        },
    };
    return { db: db as unknown as ReminderDb, state, calls };
}

describe('deliverActivityReminder', () => {
    it('claims and inserts in one transaction: owner and non-declined active attendees', async () => {
        const { db, state, calls } = fakeDb();
        const result = await deliverActivityReminder('a1', now, db);
        assert.deepEqual(result, { outcome: 'delivered', notified: 2 });
        assert.equal(calls.transactions, 1);
        assert.equal(state.activity.reminderSentAt?.toISOString(), now.toISOString());
        assert.deepEqual(state.notifications.map((row) => row.username).sort(), ['palak', 'ravi']);
        const remindAt = baseActivity().remindAt!;
        assert.deepEqual(state.notifications.map((row) => row.dedupeKey).sort(), [reminderKey('a1', remindAt, 'palak'), reminderKey('a1', remindAt, 'ravi')]);
        assert.equal(state.notifications[0].title, 'Reminder: Demo with ACME');
    });

    it('keeps updatedAt: the claim matches it and writes it back unchanged', async () => {
        const { db, state, calls } = fakeDb();
        await deliverActivityReminder('a1', now, db);
        const claim = calls.claims[0];
        assert.equal((claim.where.updatedAt as Date).getTime(), updatedAt.getTime());
        assert.equal((claim.data.updatedAt as Date).getTime(), updatedAt.getTime());
        assert.equal(claim.where.reminderSentAt, null);
        assert.equal(state.activity.updatedAt.getTime(), updatedAt.getTime());
    });

    it('leaves reminderSentAt null when the insert fails (nothing claimed, retried later)', async () => {
        const { db, state } = fakeDb({ failInsert: true });
        await assert.rejects(() => deliverActivityReminder('a1', now, db), /insert failed/);
        assert.equal(state.activity.reminderSentAt, null);
        assert.equal(state.notifications.length, 0);
    });

    it('is a no-op for a job whose activity was rescheduled to later', async () => {
        const { db, state, calls } = fakeDb({ activity: { remindAt: new Date(now.getTime() + 60 * 60_000) } });
        assert.deepEqual(await deliverActivityReminder('a1', now, db), { outcome: 'not-due', notified: 0 });
        assert.equal(calls.transactions, 0);
        assert.equal(state.notifications.length, 0);
    });

    it('does nothing for a reminder already sent, a cancelled or deleted activity, or a missing one', async () => {
        for (const activity of [{ reminderSentAt: now }, { status: 'Cancelled' }, { isDeleted: true }, { remindAt: null }]) {
            const { db, calls } = fakeDb({ activity });
            assert.equal((await deliverActivityReminder('a1', now, db)).outcome, 'not-due');
            assert.equal(calls.transactions, 0);
        }
        assert.equal((await deliverActivityReminder('missing', now, fakeDb().db)).outcome, 'missing');
    });

    it('claims a stale reminder (over 6 h late, activity over) without notifying', async () => {
        const { db, state } = fakeDb({
            activity: {
                remindAt: new Date(now.getTime() - 8 * 60 * 60_000),
                startAt: new Date(now.getTime() - 7 * 60 * 60_000),
                endAt: new Date(now.getTime() - 6 * 60 * 60_000),
            },
        });
        assert.deepEqual(await deliverActivityReminder('a1', now, db), { outcome: 'stale', notified: 0 });
        assert.notEqual(state.activity.reminderSentAt, null);
        assert.equal(state.notifications.length, 0);
    });

    it('reads again after losing the claim to an edit, and gives up after three tries', async () => {
        const once = fakeDb({ loseClaims: 1 });
        assert.equal((await deliverActivityReminder('a1', now, once.db)).outcome, 'delivered');
        assert.equal(once.calls.transactions, 2);

        const always = fakeDb({ loseClaims: 10 });
        assert.deepEqual(await deliverActivityReminder('a1', now, always.db), { outcome: 'conflict', notified: 0 });
        assert.equal(always.state.notifications.length, 0);
        assert.equal(always.state.activity.reminderSentAt, null);
    });

    it('skips a recipient who turned reminders off; a reminder whose only recipient muted it is still claimed', async () => {
        const muted = fakeDb({ remindersOff: ['Ravi'] });
        assert.deepEqual(await deliverActivityReminder('a1', now, muted.db), { outcome: 'delivered', notified: 1 });
        assert.deepEqual(muted.state.notifications.map((row) => row.username), ['palak']);

        const alone = fakeDb({ activity: { attendees: [] }, remindersOff: ['palak'] });
        assert.deepEqual(await deliverActivityReminder('a1', now, alone.db), { outcome: 'delivered', notified: 0 });
        assert.equal(alone.state.notifications.length, 0);
        assert.equal(alone.state.activity.reminderSentAt?.toISOString(), now.toISOString(), 'claimed, so it is not retried');
        assert.equal(alone.calls.transactions, 1);
    });

    it('does not insert a notification whose key is already stored (a retried job)', async () => {
        const { db, state } = fakeDb();
        state.notifications.push({ dedupeKey: reminderKey('a1', baseActivity().remindAt!, 'palak'), username: 'palak', title: '', body: null, createdAt: now });
        assert.deepEqual(await deliverActivityReminder('a1', now, db), { outcome: 'delivered', notified: 1 });
        assert.deepEqual(state.notifications.map((row) => row.username).sort(), ['palak', 'ravi']);
    });
});
