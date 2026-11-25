import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import {
    chunk,
    DEDUPE_KEY_READ_CHUNK,
    insertMissingNotifications,
    notify,
    NOTIFICATION_INSERT_CHUNK,
    toNotificationData,
    uniqueByKey,
    type NotificationDb,
    type NotificationInput,
} from './notification.producer.js';

const now = new Date('2026-11-25T04:45:00.000Z');

const row = (n: number, overrides: Partial<NotificationInput> = {}): NotificationInput => ({
    username: `user${n % 7}`,
    kind: 'activity_reminder',
    title: `Reminder ${n}`,
    body: 'Starts at 10:30 AM',
    entityModule: 'activities',
    entityId: `a${n}`,
    dueAt: now,
    actor: 'system',
    dedupeKey: `activity_reminder:a${n}:1:user${n % 7}`,
    ...overrides,
});

/**
 * Records every read and insert; `stored` keys exist up front; `raceKeys` make createMany fail like a lost race;
 * `failBatches` (1-based createMany calls) fail once with another error (a dropped connection).
 */
function fakeDb(stored: string[] = [], raceKeys: string[] = [], failBatches: number[] = []) {
    const keys = new Set(stored);
    const reads: number[] = [];
    const batches: number[] = [];
    const singles: string[] = [];
    const failing = new Set(failBatches);
    let batchCalls = 0;
    const db = {
        notification: {
            async findMany({ where }: { where: { dedupeKey: { in: string[] } } }) {
                reads.push(where.dedupeKey.in.length);
                return where.dedupeKey.in.filter((key) => keys.has(key)).map((dedupeKey) => ({ dedupeKey }));
            },
            async createMany({ data }: { data: { dedupeKey: string }[] }) {
                batchCalls++;
                if (failing.delete(batchCalls)) throw new Error('Connection lost');
                if (data.some((item) => raceKeys.includes(item.dedupeKey))) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
                batches.push(data.length);
                for (const item of data) keys.add(item.dedupeKey);
                return { count: data.length };
            },
            async create({ data }: { data: { dedupeKey: string } }) {
                if (raceKeys.includes(data.dedupeKey) || keys.has(data.dedupeKey)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
                singles.push(data.dedupeKey);
                keys.add(data.dedupeKey);
                return data;
            },
        },
    };
    return { db: db as unknown as NotificationDb, keys, reads, batches, singles };
}

describe('chunk', () => {
    it('slices into parts of at most the size', () => {
        assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
        assert.deepEqual(chunk([], 3), []);
        assert.throws(() => chunk([1], 0));
    });
});

describe('insertMissingNotifications', () => {
    it(`inserts in chunks of at most ${NOTIFICATION_INSERT_CHUNK} rows and skips stored keys`, async () => {
        const rows = Array.from({ length: 400 }, (_, n) => row(n));
        const stored = rows.slice(0, 30).map((item) => item.dedupeKey);
        const { db, batches, reads } = fakeDb(stored);
        const inserted = await insertMissingNotifications(db, rows, now);
        assert.equal(inserted.length, 370);
        assert.deepEqual(batches, [150, 150, 70]);
        assert.ok(batches.every((size) => size <= NOTIFICATION_INSERT_CHUNK));
        assert.ok(reads.every((size) => size <= DEDUPE_KEY_READ_CHUNK));
        assert.equal(inserted.some((item) => stored.includes(item.dedupeKey)), false);
    });

    it('inserts nothing when every key is stored', async () => {
        const rows = [row(1), row(2)];
        const { db, batches } = fakeDb(rows.map((item) => item.dedupeKey));
        assert.deepEqual(await insertMissingNotifications(db, rows, now), []);
        assert.deepEqual(batches, []);
    });

    it('throws a unique violation instead of catching it (the transaction rolls back)', async () => {
        const { db } = fakeDb([], [row(1).dedupeKey]);
        await assert.rejects(() => insertMissingNotifications(db, [row(1)], now), (err: { code?: string }) => err.code === 'P2002');
    });
});

/** Records the usernames whose cached unread counts `notify` drops. */
function watchInvalidations() {
    const dropped: string[] = [];
    const prefix = CACHE_KEYS.notificationsUnread('');
    mock.method(cacheService, 'invalidate', async (...keys: string[]) => {
        dropped.push(...keys.map((key) => key.slice(prefix.length)));
    });
    return dropped;
}

describe('notify', () => {
    afterEach(() => mock.restoreAll());

    it('drops the cached unread counts of the users it notified', async () => {
        const dropped = watchInvalidations();
        const rows = [row(1, { username: 'alice' }), row(2, { username: 'bob' })];
        const { db } = fakeDb([rows[1].dedupeKey]);
        assert.deepEqual(await notify(rows, db, now), { created: 1 });
        assert.deepEqual(dropped, ['alice']);
    });

    it('still drops the counts of every recipient it tried when a later chunk fails (earlier chunks stay committed)', async () => {
        const dropped = watchInvalidations();
        const first = Array.from({ length: NOTIFICATION_INSERT_CHUNK }, (_, n) => row(n, { username: 'alice', dedupeKey: `k:alice:${n}` }));
        const second = Array.from({ length: 10 }, (_, n) => row(n, { username: `user${n}`, dedupeKey: `k:other:${n}` }));
        const { db, keys } = fakeDb([], [], [2]);

        await assert.rejects(() => notify([...first, ...second], db, now), /Connection lost/);
        assert.equal(first.every((item) => keys.has(item.dedupeKey)), true);
        assert.ok(dropped.includes('alice'), 'alice’s rows were committed: her cached count must go');
        assert.deepEqual(new Set(dropped), new Set(['alice', ...second.map((item) => item.username)]));

        // The retry skips alice's stored keys and inserts the rest.
        dropped.length = 0;
        assert.deepEqual(await notify([...first, ...second], db, now), { created: second.length });
        assert.deepEqual(new Set(dropped), new Set(second.map((item) => item.username)));
    });

    it('treats a lost race as already sent: the chunk is retried one row at a time', async () => {
        const rows = [row(1), row(2), row(3)];
        const { db, singles } = fakeDb([], [rows[1].dedupeKey]);
        assert.deepEqual(await notify(rows, db, now), { created: 2 });
        assert.deepEqual(singles, [rows[0].dedupeKey, rows[2].dedupeKey]);
    });

    it('does nothing for no rows', async () => {
        const { db, reads } = fakeDb();
        assert.deepEqual(await notify([], db, now), { created: 0 });
        assert.deepEqual(reads, []);
    });
});

describe('row shaping', () => {
    it('keeps the first row of each key (keys compare case-insensitively)', () => {
        const rows = uniqueByKey([row(1), row(1, { dedupeKey: row(1).dedupeKey.toUpperCase(), title: 'second' }), row(2)]);
        assert.deepEqual(rows.map((item) => item.title), ['Reminder 1', 'Reminder 2']);
    });

    it('cuts texts to their column widths and stamps createdAt', () => {
        const data = toNotificationData(row(1, { title: 'x'.repeat(300), body: 'y'.repeat(900) }), now);
        assert.equal(data.title.length, 200);
        assert.equal(data.body?.length, 500);
        assert.equal(data.createdAt, now);
        assert.equal(toNotificationData(row(1, { body: '' }), now).body, null);
    });
});
