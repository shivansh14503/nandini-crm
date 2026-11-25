import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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

/** Records every read and insert; `stored` keys exist up front; `raceKeys` make createMany fail like a lost race. */
function fakeDb(stored: string[] = [], raceKeys: string[] = []) {
    const keys = new Set(stored);
    const reads: number[] = [];
    const batches: number[] = [];
    const singles: string[] = [];
    const db = {
        notification: {
            async findMany({ where }: { where: { dedupeKey: { in: string[] } } }) {
                reads.push(where.dedupeKey.in.length);
                return where.dedupeKey.in.filter((key) => keys.has(key)).map((dedupeKey) => ({ dedupeKey }));
            },
            async createMany({ data }: { data: { dedupeKey: string }[] }) {
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

describe('notify', () => {
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
