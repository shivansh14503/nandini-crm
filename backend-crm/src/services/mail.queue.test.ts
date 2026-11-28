import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { setMailConfigForTests, type MailConfig } from '../modules/email/email.settings.js';
import { MailSendError } from '../modules/email/gmail.sender.js';
import { deliverDueEmails, mailTransport, MAX_SEND_ATTEMPTS, nextAttemptAfter, openBody, retryEmailNow, RETRY_DELAYS_MS, sendMail, type EmailLogDb } from './mail.service.js';
import { configureSecretBox, parseKeyRing } from './secretBox.js';

type Row = Record<string, unknown> & { id: string; dedupeKey: string; status: string; attempts: number };

/** EmailLog double with the calls the queue makes (simple where matching). */
function fakeDb() {
    const rows: Row[] = [];
    let ids = 1;
    const match = (row: Row, where: Record<string, unknown> = {}): boolean =>
        Object.entries(where).every(([k, v]) => {
            const value = row[k];
            if (v && typeof v === 'object' && !(v instanceof Date)) {
                const cond = v as { in?: unknown[]; lte?: Date; lt?: number | Date; gte?: Date; not?: unknown };
                if (cond.in) return cond.in.includes(value);
                if ('not' in cond) return value !== cond.not && value !== undefined;
                if (cond.lte) return value instanceof Date && value <= cond.lte;
                if (cond.gte) return value instanceof Date && value >= cond.gte;
                if (cond.lt !== undefined) return value instanceof Date ? value < (cond.lt as Date) : (value as number) < (cond.lt as number);
                return false;
            }
            return value === v;
        });
    const db = {
        emailLog: {
            async create({ data }: { data: Row }) {
                if (rows.some((r) => r.dedupeKey === data.dedupeKey)) throw Object.assign(new Error('Unique'), { code: 'P2002' });
                const row = { bodyEnc: null, nextAttemptAt: null, lastAttemptAt: null, ...data, id: `r${ids++}` } as Row;
                rows.push(row);
                return { id: row.id };
            },
            async findUnique({ where }: { where: { id?: string; dedupeKey?: string } }) {
                return rows.find((r) => (where.id ? r.id === where.id : r.dedupeKey === where.dedupeKey)) ?? null;
            },
            async findMany({ where, take }: { where: Record<string, unknown>; take: number }) {
                return rows.filter((r) => match(r, where)).slice(0, take);
            },
            async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
                const hit = rows.filter((r) => match(r, where));
                for (const r of hit) Object.assign(r, data);
                return { count: hit.length };
            },
            async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
                const row = rows.find((r) => r.id === where.id)!;
                Object.assign(row, data);
                return row;
            },
            async count({ where }: { where: Record<string, unknown> }) {
                return rows.filter((r) => match(r, where)).length;
            },
        },
    };
    return { db: db as unknown as EmailLogDb, rows };
}

const gmailConfig = (dailyLimit = 1500): MailConfig => ({
    settings: {
        provider: 'gmail',
        enabled: true,
        senderEmail: 'crm@nandiniinfosys.com',
        senderName: 'Nandini CRM',
        replyTo: null,
        dailyLimit,
        lastTestAt: null,
        lastTestOk: null,
        lastTestMessage: null,
        updatedBy: null,
        updatedAt: null,
        saved: true,
    },
    googleKey: { configured: true, clientEmail: 'sa@p.iam.gserviceaccount.com', clientId: '1' },
});

const mail = { to: 'asha@nandiniinfosys.com', toUsername: 'asha.k', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi', kind: 'morning_summary' };

beforeEach(() => {
    configureSecretBox(parseKeyRing(randomBytes(32).toString('base64')));
    setMailConfigForTests(gmailConfig());
});

afterEach(() => {
    mock.restoreAll();
    setMailConfigForTests(null);
    configureSecretBox(null);
});

describe('backoff', () => {
    it('waits 1 min, 5 min, 30 min, 2 h, then gives up', () => {
        const now = new Date('2026-11-28T06:00:00Z');
        assert.deepEqual(
            [1, 2, 3, 4].map((n) => nextAttemptAfter(n, now)!.getTime() - now.getTime()),
            [...RETRY_DELAYS_MS],
        );
        assert.equal(nextAttemptAfter(MAX_SEND_ATTEMPTS, now), null);
    });
});

describe('sendMail through the configured provider', () => {
    it('sends as the sender mailbox, logs it as sent and drops the kept message', async () => {
        const { db, rows } = fakeDb();
        const seen: unknown[] = [];
        mock.method(mailTransport, 'deliver', async (readiness: unknown, _c: unknown, message: unknown) => {
            seen.push(readiness, message);
            return { messageId: 'gm-1' };
        });
        const result = await sendMail(mail, db);
        assert.equal(result.status, 'sent');
        assert.deepEqual(seen[0], { ready: true, provider: 'gmail', fromEmail: 'crm@nandiniinfosys.com', fromName: 'Nandini CRM' });
        assert.equal(rows[0].status, 'sent');
        assert.equal(rows[0].provider, 'gmail');
        assert.equal(rows[0].fromEmail, 'crm@nandiniinfosys.com');
        assert.equal(rows[0].bodyEnc, null);
    });

    it('keeps a failed message sealed and schedules a retry; the queue sends it later', async () => {
        const { db, rows } = fakeDb();
        mock.method(mailTransport, 'deliver', async () => {
            throw new MailSendError('network', 'Google is not reachable', true);
        });
        const result = await sendMail(mail, db);
        assert.equal(result.status, 'failed');
        assert.equal(rows[0].status, 'failed');
        assert.ok(rows[0].bodyEnc, 'kept');
        assert.doesNotMatch(String(rows[0].bodyEnc), /Hi/);
        assert.deepEqual(openBody(rows[0].dedupeKey, String(rows[0].bodyEnc)), { html: '<p>Hi</p>', text: 'Hi' });
        assert.ok(rows[0].nextAttemptAt instanceof Date);

        mock.restoreAll();
        mock.method(mailTransport, 'deliver', async () => ({ messageId: 'gm-2' }));
        // Not yet due.
        assert.equal((await deliverDueEmails({}, db)).sent, 0);
        const run = await deliverDueEmails({ now: new Date(Date.now() + RETRY_DELAYS_MS[0] + 1000) }, db);
        assert.equal(run.sent, 1);
        assert.equal(rows[0].status, 'sent');
        assert.equal(rows[0].attempts, 2);
        assert.equal(rows[0].bodyEnc, null);
    });

    it('does not retry an error that will not pass, nor a message that was not kept', async () => {
        const { db, rows } = fakeDb();
        mock.method(mailTransport, 'deliver', async () => {
            throw new MailSendError('scope_missing', 'add gmail.send', false);
        });
        await sendMail(mail, db);
        assert.equal(rows[0].nextAttemptAt, null);
        await sendMail({ ...mail, kind: 'user_invite', retainBody: false }, db);
        assert.equal(rows[1].bodyEnc, null);
        assert.equal(rows[1].nextAttemptAt, null);
    });

    it('holds non-essential emails past the daily limit for the next day, but still sends essential ones', async () => {
        setMailConfigForTests(gmailConfig(1));
        const { db, rows } = fakeDb();
        mock.method(mailTransport, 'deliver', async () => ({ messageId: 'x' }));
        assert.equal((await sendMail(mail, db)).status, 'sent');
        rows[0].sentAt = new Date();
        const held = await sendMail({ ...mail, toUsername: 'b' }, db);
        assert.equal(held.status, 'queued');
        assert.ok((rows[1].nextAttemptAt as Date).getTime() > Date.now());
        assert.match(String(rows[1].error), /Daily send limit/);
        assert.equal((await sendMail({ ...mail, kind: 'user_invite', essential: true, retainBody: false }, db)).status, 'sent');
        assert.equal((await deliverDueEmails({ now: new Date(Date.now() + 60_000) }, db)).held, 'daily_limit');
    });

    it('logs the reason and sends nothing while mail is switched off', async () => {
        setMailConfigForTests({ ...gmailConfig(), settings: { ...gmailConfig().settings, enabled: false } });
        const { db, rows } = fakeDb();
        const deliver = mock.method(mailTransport, 'deliver', async () => ({ messageId: 'x' }));
        assert.equal((await sendMail(mail, db)).status, 'skipped');
        assert.equal(deliver.mock.callCount(), 0);
        assert.match(String(rows[0].error), /switched off/);
    });
});

describe('retryEmailNow', () => {
    it('sends a failed email again past the attempt cap, and refuses one that was not kept', async () => {
        const { db, rows } = fakeDb();
        mock.method(mailTransport, 'deliver', async () => {
            throw new MailSendError('network', 'down', true);
        });
        await sendMail(mail, db);
        rows[0].attempts = MAX_SEND_ATTEMPTS;
        mock.restoreAll();
        mock.method(mailTransport, 'deliver', async () => ({ messageId: 'x' }));
        const result = await retryEmailNow(rows[0].id, db);
        assert.equal(result.status, 'sent');
        assert.equal(rows[0].status, 'sent');

        await sendMail({ ...mail, retainBody: false, toUsername: 'z', kind: 'user_invite' }, db);
        rows[1].status = 'failed';
        await assert.rejects(retryEmailNow(rows[1].id, db), /not_kept/);
    });

    it('marks rows a stopped process left sending as failed without sending them', async () => {
        const { db, rows } = fakeDb();
        rows.push({ id: 'old', dedupeKey: 'k', status: 'sending', attempts: 1, lastAttemptAt: new Date(Date.now() - 60 * 60_000), bodyEnc: 'x', nextAttemptAt: null });
        const deliver = mock.method(mailTransport, 'deliver', async () => ({ messageId: 'x' }));
        const run = await deliverDueEmails({}, db);
        assert.equal(run.interrupted, 1);
        assert.equal(rows[0].status, 'failed');
        assert.equal(deliver.mock.callCount(), 0);
    });
});
