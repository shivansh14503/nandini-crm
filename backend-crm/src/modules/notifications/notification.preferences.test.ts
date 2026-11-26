import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withoutMutedRecipients } from './notification.preferences.js';
import { DEDUPE_KEY_READ_CHUNK, type NotificationDb, type NotificationInput } from './notification.producer.js';

const row = (username: string, kind: NotificationInput['kind'], key = `${kind}:${username}`): NotificationInput => ({
    username,
    kind,
    title: 'A notification',
    dedupeKey: key,
});

type Switches = Partial<Record<'inAppActivityReminder' | 'inAppActivityAssigned' | 'inAppActivityInvited' | 'inAppContractRenewal', boolean>>;

/** UserPreference rows by username (stored case as given); records each query's usernames. */
function fakeDb(preferences: Record<string, Switches> = {}) {
    const queries: string[][] = [];
    const db = {
        userPreference: {
            async findMany({ where, select }: { where: { user: { username: { in: string[] } } }; select: Record<string, unknown> }) {
                queries.push(where.user.username.in);
                assert.deepEqual(Object.keys(select).sort(), ['inAppActivityAssigned', 'inAppActivityInvited', 'inAppActivityReminder', 'inAppContractRenewal', 'user']);
                const wanted = new Set(where.user.username.in);
                return Object.entries(preferences)
                    .filter(([username]) => wanted.has(username.toLowerCase()))
                    .map(([username, switches]) => ({
                        user: { username },
                        inAppActivityReminder: true,
                        inAppActivityAssigned: true,
                        inAppActivityInvited: true,
                        inAppContractRenewal: true,
                        ...switches,
                    }));
            },
        },
        notification: {},
    };
    return { db: db as unknown as NotificationDb, queries };
}

describe('withoutMutedRecipients', () => {
    it('drops the rows of a kind the recipient turned off (usernames compare case-insensitively)', async () => {
        const rows = [
            row('Palak', 'activity_reminder'),
            row('palak', 'activity_assigned'),
            row('ravi', 'activity_reminder'),
            row('asha', 'contract_renewal'),
            row('asha', 'activity_invited'),
        ];
        const { db, queries } = fakeDb({ PALAK: { inAppActivityReminder: false }, asha: { inAppContractRenewal: false, inAppActivityInvited: false } });
        const kept = await withoutMutedRecipients(db, rows);
        assert.deepEqual(
            kept.map((item) => `${item.username}/${item.kind}`),
            ['palak/activity_assigned', 'ravi/activity_reminder'],
        );
        assert.equal(queries.length, 1, 'one batched query, not one per recipient');
        assert.deepEqual(queries[0].sort(), ['asha', 'palak', 'ravi']);
    });

    it('keeps everything for users without a row (every kind on)', async () => {
        const rows = [row('palak', 'activity_reminder'), row('ravi', 'contract_renewal')];
        assert.deepEqual(await withoutMutedRecipients(fakeDb().db, rows), rows);
    });

    it('never filters a kind without a switch (calendar_reconnect) and makes no query when no row is configurable', async () => {
        const { db, queries } = fakeDb({ palak: { inAppActivityReminder: false, inAppActivityAssigned: false, inAppActivityInvited: false, inAppContractRenewal: false } });
        const rows = [row('palak', 'calendar_reconnect')];
        assert.deepEqual(await withoutMutedRecipients(db, rows), rows);
        assert.deepEqual(queries, []);

        const mixed = [row('palak', 'calendar_reconnect'), row('palak', 'activity_reminder')];
        assert.deepEqual(await withoutMutedRecipients(db, mixed), [mixed[0]]);
        assert.deepEqual(queries, [['palak']], 'only the configurable rows’ recipients are read');
    });

    it(`reads at most ${DEDUPE_KEY_READ_CHUNK} usernames per query`, async () => {
        const rows = Array.from({ length: DEDUPE_KEY_READ_CHUNK * 2 + 1 }, (_, n) => row(`user${n}`, 'activity_reminder'));
        const { db, queries } = fakeDb({ user7: { inAppActivityReminder: false } });
        const kept = await withoutMutedRecipients(db, rows);
        assert.deepEqual(queries.map((part) => part.length), [DEDUPE_KEY_READ_CHUNK, DEDUPE_KEY_READ_CHUNK, 1]);
        assert.equal(kept.length, rows.length - 1);
        assert.equal(kept.some((item) => item.username === 'user7'), false);
    });

    it('returns no rows for no rows, without a query', async () => {
        const { db, queries } = fakeDb();
        assert.deepEqual(await withoutMutedRecipients(db, []), []);
        assert.deepEqual(queries, []);
    });
});
