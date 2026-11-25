import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { claimEmailLog, isMailConfigured, isRetryableEmail, MAX_SEND_ATTEMPTS, recipientForLog, sendMail, type EmailLogDb, type EmailLogRow } from './mail.service.js';

/** EmailLog double: rows by dedupe key, a unique index on the key, conditional updates. */
function fakeDb(existing?: { status: string; attempts: number }) {
    const rows = new Map<string, { id: string; status: string; attempts: number; dedupeKey: string; [key: string]: unknown }>();
    if (existing) rows.set('morning_summary:2026-11-25:palak', { id: 'log1', dedupeKey: 'morning_summary:2026-11-25:palak', ...existing });
    let ids = 1;
    const updates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
    const db = {
        emailLog: {
            async create({ data }: { data: { dedupeKey: string; status: string; attempts: number } }) {
                if (rows.has(data.dedupeKey)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
                const row = { ...data, id: `new${ids++}` };
                rows.set(data.dedupeKey, row);
                return { id: row.id };
            },
            async findUnique({ where }: { where: { dedupeKey: string } }) {
                const row = rows.get(where.dedupeKey);
                return row ? { id: row.id, status: row.status, attempts: row.attempts } : null;
            },
            async updateMany({ where, data }: { where: { id: string; status: string; attempts: number }; data: Record<string, unknown> }) {
                updates.push({ where, data });
                const row = [...rows.values()].find((item) => item.id === where.id);
                if (!row || row.status !== where.status || row.attempts !== where.attempts) return { count: 0 };
                Object.assign(row, data);
                return { count: 1 };
            },
        },
    };
    return { db: db as unknown as EmailLogDb, rows, updates };
}

const logRow: EmailLogRow = {
    kind: 'morning_summary',
    toUsername: 'palak',
    toEmail: 'palak@nandiniinfosys.com',
    subject: 'Your CRM day',
    dedupeKey: 'morning_summary:2026-11-25:palak',
};

describe('claimEmailLog', () => {
    it('claims a new key by inserting it as sending', async () => {
        const { db, rows } = fakeDb();
        const claim = await claimEmailLog(db, logRow);
        assert.equal(claim.claimed, true);
        assert.equal(rows.get(logRow.dedupeKey)?.status, 'sending');
        assert.equal(rows.get(logRow.dedupeKey)?.attempts, 1);
    });

    it('skips a key another run sent or is sending', async () => {
        for (const status of ['sent', 'sending']) {
            const { db, updates } = fakeDb({ status, attempts: 1 });
            assert.deepEqual(await claimEmailLog(db, logRow), { claimed: false, reason: status });
            assert.equal(updates.length, 0);
        }
    });

    it('retries a failed send by a conditional update while attempts < 3', async () => {
        const { db, rows, updates } = fakeDb({ status: 'failed', attempts: 2 });
        assert.deepEqual(await claimEmailLog(db, logRow), { claimed: true, id: 'log1', attempts: 3 });
        assert.deepEqual(updates[0].where, { id: 'log1', status: 'failed', attempts: 2 });
        assert.equal(rows.get(logRow.dedupeKey)?.status, 'sending');
    });

    it('gives up on a send that failed 3 times', async () => {
        const { db } = fakeDb({ status: 'failed', attempts: MAX_SEND_ATTEMPTS });
        assert.deepEqual(await claimEmailLog(db, logRow), { claimed: false, reason: 'failed' });
    });

    it('takes over a send skipped while mail was off', async () => {
        const { db } = fakeDb({ status: 'skipped', attempts: 0 });
        assert.deepEqual(await claimEmailLog(db, logRow), { claimed: true, id: 'log1', attempts: 1 });
    });

    it('loses to a run that retried the same failed row first', async () => {
        const { db, rows } = fakeDb({ status: 'failed', attempts: 1 });
        const first = claimEmailLog(db, logRow);
        const second = claimEmailLog(db, logRow);
        const results = await Promise.all([first, second]);
        assert.equal(results.filter((result) => result.claimed).length, 1);
        assert.equal(rows.get(logRow.dedupeKey)?.attempts, 2);
    });
});

describe('isRetryableEmail', () => {
    it('retries skipped sends and failed ones below the attempt cap', () => {
        assert.equal(isRetryableEmail({ status: 'skipped', attempts: 0 }), true);
        assert.equal(isRetryableEmail({ status: 'failed', attempts: 2 }), true);
        assert.equal(isRetryableEmail({ status: 'failed', attempts: 3 }), false);
        assert.equal(isRetryableEmail({ status: 'sent', attempts: 1 }), false);
        assert.equal(isRetryableEmail({ status: 'sending', attempts: 1 }), false);
    });
});

describe('recipientForLog', () => {
    it('logs the username and the domain, not the address', () => {
        assert.deepEqual(recipientForLog('Palak@NandiniInfosys.com', 'palak'), { toUsername: 'palak', toDomain: 'nandiniinfosys.com' });
        assert.deepEqual(recipientForLog('no-at-sign'), { toDomain: '' });
    });
});

describe('sendMail with mail turned off', () => {
    it('sends nothing, records the send as skipped and does not throw', async () => {
        assert.equal(isMailConfigured(), false, 'tests run without MAIL_ENABLED / SMTP_HOST');
        const { db, rows } = fakeDb();
        const result = await sendMail({ to: 'palak@nandiniinfosys.com', toUsername: 'palak', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', kind: 'morning_summary', dedupeKey: logRow.dedupeKey }, db);
        assert.equal(result.status, 'skipped');
        assert.equal(rows.get(logRow.dedupeKey)?.status, 'skipped');
        assert.equal(rows.get(logRow.dedupeKey)?.attempts, 0);
    });

    it('gives a one-off send its own key', async () => {
        const { db, rows } = fakeDb();
        await sendMail({ to: 'a@b.co', subject: 'Test', html: '', text: '', kind: 'morning_summary_test' }, db);
        await sendMail({ to: 'a@b.co', subject: 'Test', html: '', text: '', kind: 'morning_summary_test' }, db);
        assert.equal(rows.size, 2);
        assert.ok([...rows.keys()].every((key) => key.startsWith('morning_summary_test:')));
    });
});
