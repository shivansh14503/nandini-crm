import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ProviderAuthError, ProviderNotFoundError } from '../calendar-sync/providers/http.js';
import { EMAIL_LOGGING_DEFAULTS, type EmailLoggingSettings } from './emailLog.settings.js';
import { cursorOf, emailLogJobId, errorBackoffMs, ingestMailbox, mailIssueNotifications, resetMailPausesForTests, type IngestDeps } from './emailLog.ingest.js';
import type { EmailLogStore, MailboxRow, NewCopy, NewEmail, NewLink, RunUpdate } from './emailLog.store.js';
import { message } from './testing/mailMessage.js';
import { createFakeMailAdapter, fakeMail } from './providers/fakeMail.js';
import type { MailProviderKey } from './providers/types.js';

/**
 * The ingestion engine on an in-memory store and the fake mail provider: matching, dedupe across mailboxes (and the
 * unique-index race), cursors, skips, and the user / app / transient failure paths.
 */

const DOMAIN = 'nandiniinfosys.com';
const NOW = new Date('2026-12-01T05:30:00Z');

interface Memory {
    users: Map<string, { active: boolean; connection: { provider: string; accountEmail: string } | null }>;
    mailboxes: Map<string, MailboxRow & { loggedCount: number; lastErrorMessage?: string | null; lastErrorAt?: Date | null }>;
    emails: (NewEmail & { id: string })[];
    copies: NewCopy[];
    links: NewLink[];
    entityEmails: Map<string, { contacts: string[]; leads: string[] }>;
    opportunities: Map<string, string[]>;
    /** Next upsertEmail behaves as if another run inserted the same Message-ID first (P2002 path). */
    raceNext: boolean;
}

let mem: Memory;

const blankMailbox = (username: string): Memory['mailboxes'] extends Map<string, infer R> ? R : never => ({
    username,
    mode: null,
    provider: null,
    accountEmail: null,
    cursorJson: null,
    status: 'idle',
    errorLevel: null,
    lastErrorCode: null,
    consecutiveFailures: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    nextRunAt: null,
    leaseId: null,
    leaseUntil: null,
    loggedCount: 0,
});

const memoryStore: EmailLogStore = {
    async loadTarget(username) {
        const user = mem.users.get(username);
        return { userActive: Boolean(user?.active), connection: user?.connection ?? null, mailbox: mem.mailboxes.get(username) ?? null };
    },
    async claimLease(username, leaseId, now, until) {
        const row = mem.mailboxes.get(username) ?? blankMailbox(username);
        if (row.leaseUntil && row.leaseUntil >= now) return false;
        mem.mailboxes.set(username, { ...row, leaseId, leaseUntil: until });
        return true;
    },
    async finishRun(username, leaseId, update: RunUpdate) {
        const row = mem.mailboxes.get(username);
        if (!row || row.leaseId !== leaseId) return;
        const { loggedDelta, ...data } = update;
        mem.mailboxes.set(username, { ...row, ...data, loggedCount: row.loggedCount + (loggedDelta ?? 0), leaseId: null, leaseUntil: null } as typeof row);
    },
    async lookupAddresses(emails) {
        return new Map([...new Set(emails)].filter((e) => mem.entityEmails.has(e)).map((e) => [e, mem.entityEmails.get(e)!]));
    },
    async opportunitiesOfContacts(ids) {
        return new Map(ids.filter((id) => mem.opportunities.has(id)).map((id) => [id, mem.opportunities.get(id)!]));
    },
    async findCopy(username, providerMessageId) {
        const copy = mem.copies.find((c) => c.username === username && c.providerMessageId === providerMessageId);
        return copy ? { emailId: copy.emailId } : null;
    },
    async upsertEmail(email) {
        const existing = email.messageIdHash ? mem.emails.find((e) => e.messageIdHash === email.messageIdHash) : undefined;
        if (existing && !mem.raceNext) return { id: existing.id, created: false };
        if (mem.raceNext) {
            // Another employee's run inserted it between our read and our insert: the store reads the winner back.
            mem.raceNext = false;
            const winner = { ...email, id: `e${mem.emails.length + 1}`, ownerUsername: 'someone-else' };
            mem.emails.push(winner);
            return { id: winner.id, created: false };
        }
        const row = { ...email, id: `e${mem.emails.length + 1}` };
        mem.emails.push(row);
        return { id: row.id, created: true };
    },
    async addCopy(copy) {
        if (mem.copies.some((c) => c.username === copy.username && c.providerMessageId === copy.providerMessageId)) return false;
        mem.copies.push(copy);
        return true;
    },
    async addLink(link) {
        if (mem.links.some((l) => l.emailId === link.emailId && l.module === link.module && l.recordId === link.recordId)) return false;
        mem.links.push(link);
        return true;
    },
    async anyMailboxOk(provider) {
        return [...mem.mailboxes.values()].some((m) => m.provider === provider && m.lastSuccessAt);
    },
};

let settings: EmailLoggingSettings;
let notified: { provider: MailProviderKey; code: string }[];
let tokens: string[];

const deps = (over: Partial<IngestDeps> = {}): IngestDeps => ({
    store: memoryStore,
    now: () => NOW,
    loadContext: async () => ({ settings, companyDomains: [DOMAIN] }),
    providerUsable: async () => true,
    token: async (provider, mailbox) => {
        tokens.push(`${provider}:${mailbox}`);
        return 'tok';
    },
    invalidateToken: () => undefined,
    adapter: () => createFakeMailAdapter(),
    notifyApp: async (provider, code) => {
        notified.push({ provider, code });
    },
    serverEnabled: () => true,
    pollMinutes: () => 15,
    ...over,
});

const person = (username: string, connected = true) =>
    mem.users.set(username, { active: true, connection: connected ? { provider: 'fake', accountEmail: `${username}@${DOMAIN}` } : null });

beforeEach(() => {
    mem = {
        users: new Map(),
        mailboxes: new Map(),
        emails: [],
        copies: [],
        links: [],
        entityEmails: new Map([
            ['ravi@customer.in', { contacts: ['c1'], leads: [] }],
            ['lead@prospect.in', { contacts: [], leads: ['l1'] }],
        ]),
        opportunities: new Map([['c1', ['o1']]]),
        raceNext: false,
    };
    settings = { ...EMAIL_LOGGING_DEFAULTS, enabled: true, defaultForPeople: 'on' };
    notified = [];
    tokens = [];
    fakeMail.reset();
    resetMailPausesForTests();
    person('asha');
    person('vikram');
});

describe('email logging ingestion', () => {
    it('logs customer mail with links, skips the rest, saves the cursor', async () => {
        fakeMail.add(
            `asha@${DOMAIN}`,
            message({ providerMessageId: 'a1' }),
            message({ providerMessageId: 'a2', internetMessageId: '<int@x>', from: { email: `boss@${DOMAIN}` }, to: [{ email: `asha@${DOMAIN}` }] }),
            message({ providerMessageId: 'a3', internetMessageId: '<other@x>', from: { email: 'stranger@other.in' } }),
            message({ providerMessageId: 'a4', internetMessageId: '<priv@x>', privateMarked: true }),
        );
        const run = await ingestMailbox('asha', deps());
        assert.equal(run.status, 'done');
        assert.equal(run.logged, 1);
        assert.deepEqual(run.skipped, { internal: 1, no_match: 1, private: 1 });
        assert.equal(mem.emails.length, 1);
        assert.equal(mem.emails[0].snippet, 'Please send the revised quote');
        assert.equal(mem.emails[0].direction, 'in');
        assert.deepEqual(mem.links.map((l) => `${l.module}:${l.recordId}`), ['contacts:c1', 'opportunities:o1']);
        assert.equal(mem.copies[0].direction, 'in');
        const box = mem.mailboxes.get('asha')!;
        assert.equal(box.status, 'ok');
        assert.equal(box.leaseId, null);
        assert.equal(box.loggedCount, 1);
        assert.deepEqual(JSON.parse(box.cursorJson!), { kind: 'fake', position: 4 });
        assert.equal(box.nextRunAt?.getTime(), NOW.getTime() + 15 * 60_000);
        assert.deepEqual(tokens, [`fake:asha@${DOMAIN}`]);
    });

    it('one email per Message-ID across mailboxes; a re-read adds nothing', async () => {
        const shared = message({ providerMessageId: 'x', cc: [{ email: `vikram@${DOMAIN}` }] });
        fakeMail.add(`asha@${DOMAIN}`, shared);
        fakeMail.add(`vikram@${DOMAIN}`, { ...shared, providerMessageId: 'y' });
        assert.equal((await ingestMailbox('asha', deps())).logged, 1);
        const second = await ingestMailbox('vikram', deps());
        assert.equal(second.logged, 0);
        assert.equal(second.copies, 1);
        assert.equal(mem.emails.length, 1);
        assert.deepEqual(mem.copies.map((c) => c.username), ['asha', 'vikram']);
        assert.equal(mem.links.length, 2);
        // The cursor is lost (crash before it was saved): the same message again is a duplicate, nothing new.
        mem.mailboxes.get('asha')!.cursorJson = null;
        const again = await ingestMailbox('asha', deps());
        assert.equal(again.logged + again.copies, 0);
        assert.equal(again.skipped.duplicate, 1);
    });

    it('the unique-index race: the loser attaches its copy to the winner’s email', async () => {
        fakeMail.add(`asha@${DOMAIN}`, message({ providerMessageId: 'r1' }));
        mem.raceNext = true;
        const run = await ingestMailbox('asha', deps());
        assert.equal(run.logged, 0);
        assert.equal(run.copies, 1);
        assert.equal(mem.copies[0].emailId, mem.emails[0].id);
        assert.equal(mem.links.length, 2);
    });

    it('snippets off: headers only; outgoing mail is out', async () => {
        settings = { ...settings, storeSnippets: false };
        fakeMail.add(`asha@${DOMAIN}`, message({ providerMessageId: 'o1', from: { email: `asha@${DOMAIN}` }, to: [{ email: 'lead@prospect.in' }], sentByMailbox: true }));
        await ingestMailbox('asha', deps());
        assert.equal(mem.emails[0].snippet, null);
        assert.equal(mem.emails[0].direction, 'out');
        assert.equal(mem.copies[0].direction, 'out');
        assert.deepEqual(mem.links.map((l) => l.module), ['leads']);
    });

    it('automation headers are read lazily, only for matched mail not sent by the customer', async () => {
        fakeMail.add(
            `asha@${DOMAIN}`,
            message({ providerMessageId: 'n1', internetMessageId: '<n1@x>', automated: null, from: { email: 'news@vendor.com' }, to: [{ email: 'ravi@customer.in' }] }),
            message({ providerMessageId: 'n2', internetMessageId: '<n2@x>', automated: null }),
        );
        fakeMail.markAutomated('n1');
        const run = await ingestMailbox('asha', deps());
        assert.equal(run.logged, 1);
        assert.equal(run.skipped.automated, 1);
        assert.equal(fakeMail.headerReads(), 1);
    });

    it('a run stopped at its limit is due again at once', async () => {
        for (let i = 0; i < 3; i += 1) fakeMail.add(`asha@${DOMAIN}`, message({ providerMessageId: `p${i}`, internetMessageId: `<p${i}@x>`, sentAt: new Date('2020-01-01') }));
        // First run: a full sync of the last 7 days (none), cursor at the end; then 205 new messages arrive.
        await ingestMailbox('asha', deps());
        for (let i = 0; i < 205; i += 1) fakeMail.add(`asha@${DOMAIN}`, message({ providerMessageId: `q${i}`, internetMessageId: `<q${i}@x>` }));
        const run = await ingestMailbox('asha', deps());
        assert.equal(run.complete, false);
        assert.equal(run.logged, 200);
        assert.equal(mem.mailboxes.get('asha')!.nextRunAt?.getTime(), NOW.getTime());
        const rest = await ingestMailbox('asha', deps());
        assert.equal(rest.logged, 5);
        assert.equal(rest.complete, true);
    });

    it('does nothing while off: company, server, person, inactive, not synced, leased', async () => {
        fakeMail.add(`asha@${DOMAIN}`, message());
        settings = { ...settings, enabled: false };
        assert.equal((await ingestMailbox('asha', deps())).status, 'off');
        settings = { ...settings, enabled: true };
        assert.equal((await ingestMailbox('asha', deps({ serverEnabled: () => false }))).status, 'off');
        settings = { ...settings, defaultForPeople: 'off' };
        assert.equal((await ingestMailbox('asha', deps())).status, 'off');
        mem.mailboxes.set('asha', { ...blankMailbox('asha'), mode: 'on' });
        mem.users.set('asha', { active: false, connection: { provider: 'fake', accountEmail: `asha@${DOMAIN}` } });
        assert.equal((await ingestMailbox('asha', deps())).status, 'off');
        person('asha', false);
        assert.equal((await ingestMailbox('asha', deps())).status, 'not_ready');
        person('asha');
        mem.mailboxes.set('asha', { ...blankMailbox('asha'), mode: 'on', leaseId: 'other', leaseUntil: new Date(NOW.getTime() + 60_000) });
        assert.equal((await ingestMailbox('asha', deps())).status, 'busy');
        assert.equal(mem.emails.length, 0);
    });

    it('a user-level failure marks the mailbox with a backoff; nobody is notified', async () => {
        fakeMail.fail(`asha@${DOMAIN}`, new ProviderNotFoundError({ provider: 'fake', operation: 'mail-profile', status: 404, code: 'notFound' }));
        const run = await ingestMailbox('asha', deps());
        assert.equal(run.status, 'error');
        const box = mem.mailboxes.get('asha')!;
        assert.equal(box.status, 'error');
        assert.equal(box.errorLevel, 'user');
        assert.equal(box.lastErrorCode, 'mail_unavailable');
        assert.equal(box.nextRunAt?.getTime(), NOW.getTime() + errorBackoffMs(1));
        assert.equal(box.leaseId, null);
        assert.deepEqual(notified, []);
    });

    it('a missing scope pauses the provider and notifies admins once per process window', async () => {
        fakeMail.fail('*', new ProviderAuthError({ provider: 'fake', operation: 'mail-history', status: 403, code: 'insufficientPermissions' }));
        const run = await ingestMailbox('asha', deps());
        assert.equal(run.failure?.code, 'mail_scope_missing');
        assert.equal(mem.mailboxes.get('asha')!.errorLevel, 'app');
        assert.deepEqual(notified, [{ provider: 'fake', code: 'mail_scope_missing' }]);
        assert.equal((await ingestMailbox('vikram', deps())).status, 'paused');
        assert.equal(notified.length, 1);
    });

    it('a 401 drops the token and retries once', async () => {
        let calls = 0;
        const adapter = createFakeMailAdapter();
        const flaky = {
            ...adapter,
            listNew: async (...args: Parameters<typeof adapter.listNew>) => {
                calls += 1;
                if (calls === 1) throw new ProviderAuthError({ provider: 'fake', operation: 'mail-history', status: 401, code: 'http_401' });
                return adapter.listNew(...args);
            },
        };
        let invalidated = 0;
        const run = await ingestMailbox('asha', deps({ adapter: () => flaky, invalidateToken: () => void (invalidated += 1) }));
        assert.equal(run.status, 'done');
        assert.equal(invalidated, 1);
        assert.equal(tokens.length, 2);
    });

    it('transient failures leave the status alone and retry later', async () => {
        const { ProviderTransientError } = await import('../calendar-sync/providers/http.js');
        fakeMail.fail(`asha@${DOMAIN}`, new ProviderTransientError({ provider: 'fake', operation: 'mail-history', status: 503, code: 'http_503', retryable: true }));
        const run = await ingestMailbox('asha', deps());
        assert.equal(run.status, 'transient');
        const box = mem.mailboxes.get('asha')!;
        assert.equal(box.status, 'idle');
        assert.equal(box.nextRunAt?.getTime(), NOW.getTime() + 5 * 60_000);
    });
});

describe('email logging helpers', () => {
    it('cursors belong to one provider and address', () => {
        const row = { provider: 'google', accountEmail: 'a@x.com', cursorJson: JSON.stringify({ kind: 'gmail', historyId: '9' }) };
        assert.deepEqual(cursorOf(row, 'google', 'a@x.com'), { kind: 'gmail', historyId: '9' });
        assert.equal(cursorOf(row, 'google', 'b@x.com'), null);
        assert.equal(cursorOf(row, 'microsoft', 'a@x.com'), null);
        assert.equal(cursorOf({ ...row, cursorJson: '{bad' }, 'google', 'a@x.com'), null);
    });

    it('backoff grows to a day; job ids carry no username and use hyphens', () => {
        assert.deepEqual([1, 2, 3, 4, 9].map(errorBackoffMs), [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000, 24 * 60 * 60_000]);
        const id = emailLogJobId('Asha.K', NOW, 15);
        assert.match(id, /^email-log-[0-9a-f]{12}-\d+$/);
        assert.ok(!id.toLowerCase().includes('asha'));
        assert.equal(emailLogJobId('asha.k', NOW, 15), id);
        assert.match(emailLogJobId('asha.k', NOW, 15, true), /-m\d+$/);
    });

    it('admin notifications are deduped per provider, code and business day', () => {
        const rows = mailIssueNotifications(['Admin1'], 'google', 'mail_scope_missing', NOW);
        assert.equal(rows[0].kind, 'calendar_sync_issue');
        assert.equal(rows[0].dedupeKey, 'email_logging_issue:google:mail_scope_missing:2026-12-01:admin1');
        assert.match(rows[0].title, /Email logging stopped/);
    });
});
