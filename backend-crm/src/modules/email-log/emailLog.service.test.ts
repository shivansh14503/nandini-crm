import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { prisma } from '../../config/prisma.js';
import { auditService, type AuditEntry } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { formConfigService } from '../form-configs/formConfig.service.js';
import { configsWithDomains } from '../calendar-sync/testing/connectionDouble.js';
import { EMAIL_LOGGING_DEFAULTS, type EmailLoggingSettings } from './emailLog.settings.js';
import { emailLogService } from './emailLog.service.js';

/**
 * The read path and the admin writes of email logging against a Prisma double: what reaches a record's Emails tab
 * (record access, restricted visibility, the caller's own "Open in" link, Bcc copies, snippets off, company switch
 * off), and what the person switch / settings / purge write (logging start, cleared cursors, the purge's lease).
 */

const rep: AuthUser = { id: 2, username: 'rep', role: 'Sales Executive' };
const owner: AuthUser = { id: 3, username: 'owner', role: 'Sales Executive' };
const manager: AuthUser = { id: 4, username: 'mgr', role: 'Sales Manager' };
const admin: AuthUser = { id: 1, username: 'admin', role: 'Admin' };

interface CopyRow {
    username: string;
    provider: string;
    providerMessageId: string;
    webLink: string | null;
    addressed: boolean;
}
interface LinkRow {
    module: string;
    recordId: string;
    sentAt: Date;
    email: {
        id: string;
        subject: string;
        fromEmail: string;
        fromName: string | null;
        toJson: string;
        ccJson: string;
        moreRecipients: number;
        sentAt: Date;
        direction: string;
        snippet: string | null;
        hasAttachments: boolean;
        provider: string;
        copies: CopyRow[];
    };
}
interface MailboxState {
    username: string;
    mode: string | null;
    cursorJson: string | null;
    loggingSince?: Date | null;
    nextRunAt?: Date | null;
    leaseId?: string | null;
    leaseUntil?: Date | null;
    purgedAt?: Date | null;
    loggedCount?: number;
}

let settings: EmailLoggingSettings;
let contact: { assignedTo: string; createdBy: string; isDeleted: boolean } | null;
let links: LinkRow[];
let mailboxes: Map<string, MailboxState>;
let events: string[];
let audits: AuditEntry[];
let savedSettings: unknown[];
let linkWhere: unknown;
let snippetsCleared: number;
let copies: { id: string; username: string; emailId: string }[];

const realDelegates = new Map<string, unknown>();
function stub(name: string, fake: unknown): void {
    const client = prisma as unknown as Record<string, unknown>;
    if (!realDelegates.has(name)) realDelegates.set(name, client[name]);
    Object.defineProperty(client, name, { value: fake, configurable: true, writable: true });
}

const email = (id: string, over: Partial<LinkRow['email']> = {}): LinkRow['email'] => ({
    id,
    subject: `Subject ${id}`,
    fromEmail: 'ravi@customer.in',
    fromName: 'Ravi',
    toJson: JSON.stringify([{ email: 'owner@nandiniinfosys.com' }]),
    ccJson: '[]',
    moreRecipients: 0,
    sentAt: new Date('2026-12-01T05:00:00Z'),
    direction: 'in',
    snippet: 'Please send the quote',
    hasAttachments: false,
    provider: 'google',
    copies: [],
    ...over,
});

const copy = (username: string, addressed = true): CopyRow => ({ username, provider: 'google', providerMessageId: `pm-${username}`, webLink: null, addressed });

/** Applies the restricted filter the service builds: `email.copies.some.username`. */
const matches = (row: LinkRow, where: Record<string, unknown>) => {
    if (row.module !== where.module || row.recordId !== where.recordId) return false;
    const user = (where.email as { copies?: { some?: { username?: string } } } | undefined)?.copies?.some?.username;
    return !user || row.email.copies.some((c) => c.username.toLowerCase() === user.toLowerCase());
};

beforeEach(() => {
    settings = { ...EMAIL_LOGGING_DEFAULTS, enabled: true, defaultForPeople: 'on' };
    contact = { assignedTo: 'owner', createdBy: 'owner', isDeleted: false };
    links = [];
    mailboxes = new Map();
    events = [];
    audits = [];
    savedSettings = [];
    linkWhere = undefined;
    snippetsCleared = 0;
    copies = [];

    mock.method(formConfigService, 'getAllConfigs', async () => {
        const configs = configsWithDomains(['nandiniinfosys.com']);
        (configs.moduleSettings.activities as Record<string, unknown>).emailLogging = settings;
        return configs;
    });
    mock.method(formConfigService, 'updateModuleSetting', async (_module: string, _key: string, body: { value: EmailLoggingSettings }) => {
        events.push('settings');
        savedSettings.push(body.value);
        settings = body.value;
        return body.value;
    });
    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => {
        events.push(`audit:${entry.action}`);
        audits.push(entry);
    });

    stub('contact', { findUnique: async () => (contact ? { ...contact } : null) });
    stub('calendarConnection', { findFirst: async () => null });
    stub('loggedEmailLink', {
        count: async ({ where }: { where: Record<string, unknown> }) => links.filter((l) => matches(l, where)).length,
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
            linkWhere = where;
            return links.filter((l) => matches(l, where)).map((l) => ({ email: l.email }));
        },
    });
    stub('user', {
        findMany: async () => [
            { username: 'owner', fullName: 'Owner One' },
            { username: 'rep', fullName: 'Rep Two' },
            { username: 'boss', fullName: 'Boss Three' },
        ],
        findUnique: async ({ where }: { where: { username: string } }) => ({ username: where.username }),
    });
    const mailboxModel = {
        findUnique: async ({ where }: { where: { username: string } }) => {
            const row = mailboxes.get(where.username);
            return row ? { accountEmail: `${row.username}@nandiniinfosys.com`, ...row } : null;
        },
        upsert: async ({ where, create, update }: { where: { username: string }; create: MailboxState; update: Partial<MailboxState> }) => {
            events.push('mailbox:upsert');
            const row = mailboxes.get(where.username);
            mailboxes.set(where.username, row ? { ...row, ...update } : { ...create });
        },
        updateMany: async ({ where, data }: { where: Partial<MailboxState> & { cursorJson?: unknown }; data: Partial<MailboxState> }) => {
            let count = 0;
            for (const [key, row] of mailboxes) {
                if (where.username !== undefined && row.username !== where.username) continue;
                if (where.leaseId !== undefined && row.leaseId !== where.leaseId) continue;
                if (where.mode !== undefined && row.mode !== where.mode) continue;
                mailboxes.set(key, { ...row, ...data });
                count += 1;
            }
            events.push(`mailbox:updateMany:${Object.keys(data).join(',')}`);
            return { count };
        },
    };
    stub('loggedEmailMailbox', mailboxModel);
    stub('loggedEmailCopy', {
        count: async ({ where }: { where: { username: string } }) => copies.filter((c) => c.username === where.username).length,
        findMany: async ({ where }: { where: { username: string } }) => copies.filter((c) => c.username === where.username).slice(0, 500),
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
            events.push('copies:delete');
            const before = copies.length;
            copies = copies.filter((c) => !where.id.in.includes(c.id));
            return { count: before - copies.length };
        },
    });
    stub('loggedEmail', {
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.filter((id) => !copies.some((c) => c.emailId === id)).length }),
        findMany: async () => {
            const batch = snippetsCleared === 0 ? [{ id: 'e1' }, { id: 'e2' }] : [];
            return batch;
        },
        updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
            snippetsCleared += where.id.in.length;
            return { count: where.id.in.length };
        },
    });
    stub('$transaction', async (fn: (tx: unknown) => Promise<unknown>) => fn({ loggedEmailMailbox: mailboxModel }));
});

afterEach(() => {
    mock.restoreAll();
    for (const [name, real] of realDelegates) Object.defineProperty(prisma, name, { value: real, configurable: true, writable: true });
    realDelegates.clear();
});

const list = (user: AuthUser) => emailLogService.listForRecord({ module: 'contacts', recordId: 'c1' }, user);

describe('email logging: record list (GET /api/email-logs)', () => {
    it('"Open in" only on the caller’s own copy; a Bcc copy is listed only to its own employee', async () => {
        links = [{ module: 'contacts', recordId: 'c1', sentAt: new Date(), email: email('e1', { copies: [copy('owner'), copy('rep', false)] }) }];
        for (const username of ['owner', 'rep']) mailboxes.set(username, { username, mode: null, cursorJson: null });
        const asOwner = await list(owner);
        assert.equal(asOwner.items[0].openLink?.provider, 'google');
        assert.match(asOwner.items[0].openLink!.url, /^https:\/\/mail\.google\.com\/mail\/\?authuser=owner%40nandiniinfosys\.com#all\/pm-owner$/);
        assert.deepEqual(asOwner.items[0].participants.map((p) => p.username), ['owner']);

        const asRep = await list({ ...rep, role: 'Sales Manager' });
        assert.match(asRep.items[0].openLink!.url, /pm-rep$/);
        assert.deepEqual(asRep.items[0].participants.map((p) => p.name), ['Owner One', 'Rep Two']);

        const asBoss = await list(manager);
        assert.equal(asBoss.items[0].openLink, null);
        assert.deepEqual(asBoss.items[0].participants.map((p) => p.username), ['owner']);
    });

    it('restricted: others see only the emails their own mailbox holds; owner and managers see all', async () => {
        links = [
            { module: 'contacts', recordId: 'c1', sentAt: new Date(), email: email('e1', { copies: [copy('owner')] }) },
            { module: 'contacts', recordId: 'c1', sentAt: new Date(), email: email('e2', { copies: [copy('rep')] }) },
        ];
        contact = { assignedTo: 'owner', createdBy: 'rep', isDeleted: false };
        const asRep = await list(rep);
        assert.equal(asRep.seesAll, false);
        assert.deepEqual((linkWhere as { email: unknown }).email, { copies: { some: { username: 'rep' } } });
        assert.deepEqual(asRep.items.map((i) => i.id), ['e2']);
        assert.equal(asRep.total, 1);

        const asOwner = await list(owner);
        assert.equal(asOwner.seesAll, true);
        assert.equal((linkWhere as { email?: unknown }).email, undefined);
        assert.equal(asOwner.items.length, 2);
        assert.equal((await list(manager)).items.length, 2);

        settings = { ...settings, visibility: 'record' };
        assert.equal((await list(rep)).items.length, 2);
    });

    it('nothing while the company switch is off; no snippet while snippets are off', async () => {
        links = [{ module: 'contacts', recordId: 'c1', sentAt: new Date(), email: email('e1', { copies: [copy('owner')] }) }];
        settings = { ...settings, storeSnippets: false };
        assert.equal((await list(owner)).items[0].snippet, null);
        settings = { ...settings, enabled: false };
        linkWhere = undefined;
        const off = await list(owner);
        assert.equal(off.enabled, false);
        assert.deepEqual(off.items, []);
        assert.equal(linkWhere, undefined);
    });

    it('404 for a deleted record, 403 without record access', async () => {
        contact = { assignedTo: 'owner', createdBy: 'owner', isDeleted: true };
        await assert.rejects(list(owner), (err: unknown) => err instanceof HttpError && err.statusCode === 404);
        contact = null;
        await assert.rejects(list(owner), (err: unknown) => err instanceof HttpError && err.statusCode === 404);
        contact = { assignedTo: 'owner', createdBy: 'owner', isDeleted: false };
        await assert.rejects(list(rep), (err: unknown) => err instanceof HttpError && err.statusCode === 403);
    });
});

describe('email logging: admin writes', () => {
    it('person switch: on stamps loggingSince and makes the mailbox due; off clears the cursor', async () => {
        settings = { ...settings, defaultForPeople: 'off' };
        mailboxes.set('rep', { username: 'rep', mode: null, cursorJson: '{"kind":"fake","position":3}', nextRunAt: new Date(0) });
        await emailLogService.setPersonMode('rep', { mode: 'on' }, admin);
        const on = mailboxes.get('rep')!;
        assert.ok(on.loggingSince instanceof Date);
        assert.equal(on.nextRunAt, null);
        await emailLogService.setPersonMode('rep', { mode: 'off' }, admin);
        const off = mailboxes.get('rep')!;
        assert.equal(off.cursorJson, null);
        // null with the default off: still off, nothing to stamp or clear.
        await emailLogService.setPersonMode('rep', { mode: null }, admin);
        assert.equal(mailboxes.get('rep')!.loggingSince, on.loggingSince);
        assert.deepEqual(audits.map((a) => a.action), ['UPDATE', 'UPDATE', 'UPDATE']);
    });

    it('settings: stamps the switch, clears cursors when it goes off and snippets when they go off', async () => {
        settings = { ...EMAIL_LOGGING_DEFAULTS };
        mailboxes.set('rep', { username: 'rep', mode: 'on', cursorJson: '{"kind":"fake","position":3}' });
        const on = await emailLogService.saveSettings({ enabled: true }, admin);
        assert.ok(on.enabledAt);
        assert.equal(mailboxes.get('rep')!.cursorJson, '{"kind":"fake","position":3}');
        await emailLogService.saveSettings({ enabled: false, storeSnippets: false }, admin);
        assert.equal(mailboxes.get('rep')!.cursorJson, null);
        assert.equal(snippetsCleared, 2);
        await assert.rejects(emailLogService.saveSettings({ enabledAt: '2026-01-01T00:00:00.000Z' }, admin));
    });

    it('purge: takes the lease and clears the cursor first, deletes, frees the lease, then audits', async () => {
        mailboxes.set('rep', { username: 'rep', mode: 'on', cursorJson: '{"kind":"fake","position":3}', leaseId: 'run-1', leaseUntil: new Date(Date.now() + 60_000) });
        copies = [
            { id: 'k1', username: 'rep', emailId: 'e1' },
            { id: 'k2', username: 'owner', emailId: 'e1' },
        ];
        const result = await emailLogService.purgePerson('rep', admin);
        assert.deepEqual(result, { copies: 1, emails: 0 });
        assert.deepEqual(events, ['mailbox:upsert', 'copies:delete', 'mailbox:updateMany:leaseId,leaseUntil', 'audit:PURGE']);
        const row = mailboxes.get('rep')!;
        assert.equal(row.cursorJson, null);
        assert.equal(row.leaseId, null);
        assert.ok(row.purgedAt instanceof Date);
        assert.equal(row.loggedCount, 0);
    });
});
