import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma.js';
import { auditService, type AuditEntry } from '../../services/audit.service.js';
import type { MailInput, MailResult } from '../../services/mail.service.js';
import { HttpError } from '../../utils/httpError.js';
import { INVALID_INVITE_MESSAGE, inviteMail, inviteService } from './invite.service.js';
import { hashInviteToken } from './invite.token.js';

/** UserInvite / User doubles on the real Prisma client (restored after each test). */
interface InviteRow {
    id: number;
    userId: number;
    tokenHash: string;
    purpose: string;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    createdBy: string | null;
}
interface UserRow {
    id: number;
    username: string;
    firstName: string | null;
    fullName: string;
    role: string;
    isActive: boolean;
    invitePending: boolean;
    passwordHash: string;
    passwordChangedAt: Date | null;
    lastLoginAt: Date | null;
}

type Where = Record<string, unknown>;
const matches = (row: Record<string, unknown>, where: Where = {}) =>
    Object.entries(where).every(([key, cond]) => {
        const value = row[key];
        if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
            const c = cond as { not?: unknown; lt?: number; gt?: Date };
            if ('not' in c) return value !== c.not;
            if ('lt' in c) return (value as number) < (c.lt as number);
            if ('gt' in c) return (value as Date).getTime() > (c.gt as Date).getTime();
        }
        return value === cond;
    });

const admin = { id: 1, username: 'admin', role: 'Admin' };
let invites: InviteRow[];
let users: UserRow[];
let mails: MailInput[];
let audits: AuditEntry[];
let nextId: number;
const real = new Map<string, unknown>();

function stub(name: string, fake: unknown) {
    const client = prisma as unknown as Record<string, unknown>;
    if (!real.has(name)) real.set(name, client[name]);
    Object.defineProperty(client, name, { value: fake, configurable: true, writable: true });
}

const pick = (row: Record<string, unknown> | undefined, select?: Record<string, unknown>) => {
    if (!row) return null;
    if (!select) return { ...row };
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) if (key !== 'photo') out[key] = row[key];
    if ('photo' in select) out.photo = null;
    return out;
};

function install() {
    const userInvite = {
        create: async ({ data }: { data: Omit<InviteRow, 'id' | 'usedAt' | 'revokedAt'> }) => {
            const row: InviteRow = { usedAt: null, revokedAt: null, ...data, id: nextId++, createdBy: data.createdBy ?? null };
            invites.push(row);
            return { id: row.id };
        },
        findUnique: async ({ where }: { where: { tokenHash: string } }) => {
            const row = invites.find((i) => i.tokenHash === where.tokenHash);
            if (!row) return null;
            const user = users.find((u) => u.id === row.userId)!;
            return { ...row, user: { ...user } };
        },
        updateMany: async ({ where, data }: { where: Where; data: Partial<InviteRow> }) => {
            const rows = invites.filter((i) => matches(i as unknown as Record<string, unknown>, where));
            for (const row of rows) Object.assign(row, data);
            return { count: rows.length };
        },
        delete: async ({ where }: { where: { id: number } }) => {
            invites = invites.filter((i) => i.id !== where.id);
            return {};
        },
    };
    const user = {
        findUnique: async ({ where, select }: { where: { id: number }; select?: Record<string, unknown> }) => pick(users.find((u) => u.id === where.id) as never, select),
        update: async ({ where, data, select }: { where: { id: number }; data: Partial<UserRow>; select?: Record<string, unknown> }) => {
            const row = users.find((u) => u.id === where.id)!;
            Object.assign(row, data);
            return pick(row as never, select);
        },
    };
    stub('userInvite', userInvite);
    stub('user', user);
    stub('$transaction', async (fn: (tx: unknown) => Promise<unknown>) => {
        const snapshot = { invites: invites.map((i) => ({ ...i })), users: users.map((u) => ({ ...u })) };
        try {
            return await fn({ userInvite, user, $queryRaw: async () => [{ result: 0 }] });
        } catch (err) {
            invites = snapshot.invites;
            users = snapshot.users;
            throw err;
        }
    });
    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => void audits.push(entry));
    mock.method(auditService, 'enqueue', async (entry: AuditEntry) => void audits.push(entry));
}

function mailReturns(result: MailResult, configured = true) {
    mock.method(inviteMail, 'isMailConfigured', () => configured);
    mock.method(inviteMail, 'sendMail', async (input: MailInput) => {
        mails.push(input);
        return result;
    });
}

/** The token inside the last email's plain-text link. */
const lastToken = () => /token=([A-Za-z0-9_-]{43})/.exec(mails.at(-1)?.text ?? '')?.[1] ?? '';

const recipient = { id: 7, username: 'asha.k', email: 'asha@nandiniinfosys.com', firstName: 'Asha', fullName: 'Asha Kapoor' };

async function rejectsInvalid(promise: Promise<unknown>) {
    await assert.rejects(promise, (err: unknown) => err instanceof HttpError && err.statusCode === 400 && err.code === 'INVALID_INVITE' && err.message === INVALID_INVITE_MESSAGE);
}

beforeEach(() => {
    nextId = 1;
    invites = [];
    mails = [];
    audits = [];
    users = [
        { id: 1, username: 'admin', firstName: 'Rahul', fullName: 'Rahul Mehta', role: 'Admin', isActive: true, invitePending: false, passwordHash: 'x', passwordChangedAt: null, lastLoginAt: null },
        { id: 7, username: 'asha.k', firstName: 'Asha', fullName: 'Asha Kapoor', role: 'Sales Executive', isActive: true, invitePending: true, passwordHash: 'x', passwordChangedAt: null, lastLoginAt: null },
    ];
    install();
});

afterEach(() => {
    for (const [name, value] of real) Object.defineProperty(prisma, name, { value, configurable: true, writable: true });
    real.clear();
    mock.restoreAll();
});

describe('inviteService.send', () => {
    it('emails a link whose token is stored only as a hash, valid for 72 hours, and audits it without the token', async () => {
        mailReturns({ status: 'sent', logId: 'l1' });
        const now = new Date('2026-11-27T10:00:00.000Z');
        const outcome = await inviteService.send(admin, recipient, 'invite', now);
        assert.deepEqual(outcome, { status: 'sent', purpose: 'invite', sentTo: 'asha@nandiniinfosys.com', expiresAt: '2026-11-30T10:00:00.000Z' });
        assert.equal(mails.length, 1);
        assert.equal(mails[0].to, 'asha@nandiniinfosys.com');
        assert.equal(mails[0].kind, 'user_invite');
        const token = lastToken();
        assert.equal(invites.length, 1);
        assert.equal(invites[0].tokenHash, hashInviteToken(token));
        assert.notEqual(invites[0].tokenHash, token);
        assert.match(mails[0].html, /Rahul Mehta added you/);
        const audit = audits.find((a) => a.action === 'INVITE_SENT');
        assert.deepEqual(audit?.changes, { purpose: 'invite', email: 'sent', expiresAt: '2026-11-30T10:00:00.000Z' });
        assert.equal(JSON.stringify(audits).includes(token), false);
    });

    it('stops the older links once a new one is sent', async () => {
        mailReturns({ status: 'sent' });
        await inviteService.send(admin, recipient, 'invite');
        await inviteService.send(admin, recipient, 'invite');
        assert.equal(invites.length, 2);
        assert.notEqual(invites[0].revokedAt, null);
        assert.equal(invites[1].revokedAt, null);
    });

    it('reports a failed send with the reason, drops the new link and keeps the older one working', async () => {
        mailReturns({ status: 'sent' });
        await inviteService.send(admin, recipient, 'invite');
        mailReturns({ status: 'failed', error: '550 mailbox unavailable' });
        const outcome = await inviteService.send(admin, recipient, 'invite');
        assert.deepEqual(outcome, { status: 'failed', purpose: 'invite', sentTo: recipient.email, error: '550 mailbox unavailable' });
        assert.equal(invites.length, 1);
        assert.equal(invites[0].revokedAt, null);
        assert.deepEqual(audits.at(-1)?.changes, { purpose: 'invite', email: 'failed' });
    });

    it('says so when outgoing email is turned off, without creating a link', async () => {
        mailReturns({ status: 'skipped' }, false);
        const outcome = await inviteService.send(admin, recipient, 'reset');
        assert.equal(outcome.status, 'mail_disabled');
        assert.match('error' in outcome ? outcome.error : '', /MAIL_ENABLED/);
        assert.equal(invites.length, 0);
        assert.equal(mails.length, 0);
    });
});

describe('inviteService.verify / accept', () => {
    async function sendLink(purpose: 'invite' | 'reset' = 'invite') {
        mailReturns({ status: 'sent' });
        await inviteService.send(admin, recipient, purpose);
        return lastToken();
    }

    it('tells the page who the link is for', async () => {
        const token = await sendLink();
        const check = await inviteService.verify(token);
        assert.equal(check.username, 'asha.k');
        assert.equal(check.name, 'Asha');
        assert.equal(check.purpose, 'invite');
    });

    it('answers every bad link the same way', async () => {
        const token = await sendLink();
        await rejectsInvalid(inviteService.verify('not-a-token'));
        await rejectsInvalid(inviteService.verify(undefined));
        await rejectsInvalid(inviteService.verify(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`));
        await rejectsInvalid(inviteService.verify(token, new Date(Date.now() + 73 * 60 * 60 * 1000)));
        users[1].isActive = false;
        await rejectsInvalid(inviteService.verify(token));
    });

    it('sets the password with the app rules, burns the link, clears Invited and signs the user in', async () => {
        const token = await sendLink();
        await assert.rejects(inviteService.accept(token, 'short'), (err: unknown) => err instanceof HttpError && err.code === 'WEAK_PASSWORD');
        // A refused password leaves the link working.
        assert.equal(invites[0].usedAt, null);

        const result = await inviteService.accept(token, 'Welcome2026', { ip: '10.0.0.5' });
        assert.equal(result.user.username, 'asha.k');
        assert.ok(result.token.split('.').length === 3);
        assert.notEqual(invites[0].usedAt, null);
        assert.equal(users[1].invitePending, false);
        assert.ok(users[1].passwordChangedAt);
        assert.equal(await bcrypt.compare('Welcome2026', users[1].passwordHash), true);
        assert.deepEqual(
            audits.map((a) => a.action),
            ['INVITE_SENT', 'PASSWORD_SET', 'LOGIN'],
        );
        assert.equal(JSON.stringify(audits).includes('Welcome2026'), false);
        // Single use.
        await rejectsInvalid(inviteService.accept(token, 'Another2026'));
        await rejectsInvalid(inviteService.verify(token));
    });

    it('a used link stops every other outstanding link of the user', async () => {
        const first = await sendLink();
        invites[0].revokedAt = null; // as if both were live (two sends racing)
        mailReturns({ status: 'sent' });
        await inviteService.send(admin, recipient, 'invite');
        invites[0].revokedAt = null;
        await inviteService.accept(lastToken(), 'Welcome2026');
        await rejectsInvalid(inviteService.verify(first));
    });

    it('a reset link refuses the current password', async () => {
        users[1].invitePending = false;
        users[1].passwordHash = await bcrypt.hash('Current2026', 4);
        const token = await sendLink('reset');
        await assert.rejects(inviteService.accept(token, 'Current2026'), /different from your current password/);
        await inviteService.accept(token, 'Brandnew2026');
    });
});
