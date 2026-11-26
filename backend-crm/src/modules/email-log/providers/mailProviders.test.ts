import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ProviderAuthError, ProviderBadRequestError, ProviderRateLimitedError, resetProviderPauses } from '../../calendar-sync/providers/http.js';
import { TokenError } from '../../calendar-sync/syncErrors.js';
import { fakeFetch, route } from '../../calendar-sync/testing/fakeFetch.js';
import { GRAPH_API } from '../../integrations/integration.constants.js';
import { classifyMailError, mailAdminMessage } from '../emailLog.errors.js';
import { createGmailAdapter, gmailFullSyncQuery, GMAIL_API } from './gmail.js';
import { createGraphMailAdapter, graphMailDeltaUrl } from './graphMail.js';

/**
 * Mail adapters on replayed fetch (answers hand-written from the documented Gmail API v1 / Graph v1.0 shapes), and the
 * failure classification of email logging.
 */

const ctx = { accessToken: 'at-1', mailbox: 'asha@nandiniinfosys.com' };
const since = new Date('2026-11-24T00:00:00Z');
const opts = { since, limit: 200 };

const gmailMessage = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    threadId: `t-${id}`,
    labelIds: ['INBOX'],
    snippet: 'Hello &amp; thanks',
    internalDate: String(Date.parse('2026-11-30T10:00:00Z')),
    payload: {
        mimeType: 'multipart/alternative',
        headers: [
            { name: 'From', value: 'Ravi Kumar <ravi@customer.in>' },
            { name: 'To', value: 'asha@nandiniinfosys.com' },
            { name: 'Subject', value: 'PO' },
            { name: 'Message-ID', value: `<${id}@customer.in>` },
        ],
    },
    ...over,
});

beforeEach(() => resetProviderPauses());

describe('Gmail adapter', () => {
    it('first run: profile history id, bounded search, metadata of each message', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${GMAIL_API}/profile`, () => ({ status: 200, body: { emailAddress: ctx.mailbox, historyId: '900' } })),
            route(`${GMAIL_API}/messages?`, () => ({ status: 200, body: { messages: [{ id: 'a' }, { id: 'b' }] } })),
            route(`${GMAIL_API}/messages/a`, () => ({ status: 200, body: gmailMessage('a') })),
            route(`${GMAIL_API}/messages/b`, () => ({ status: 404, body: { error: { code: 404, message: 'Not Found', errors: [{ reason: 'notFound' }] } } })),
        ]);
        const page = await createGmailAdapter(fetchImpl).listNew(ctx, null, opts);
        assert.deepEqual(page.cursor, { kind: 'gmail', historyId: '900' });
        assert.equal(page.resynced, true);
        assert.equal(page.messages.length, 1);
        const [m] = page.messages;
        assert.equal(m.internetMessageId, '<a@customer.in>');
        assert.deepEqual(m.from, { email: 'ravi@customer.in', name: 'Ravi Kumar' });
        assert.equal(m.automated, false);
        const list = calls.find((c) => c.url.startsWith(`${GMAIL_API}/messages?`))!;
        assert.equal(new URL(list.url).searchParams.get('q'), gmailFullSyncQuery(since));
        const get = calls.find((c) => c.url.startsWith(`${GMAIL_API}/messages/a`))!;
        assert.equal(new URL(get.url).searchParams.get('format'), 'metadata');
        assert.ok(new URL(get.url).searchParams.getAll('metadataHeaders').includes('List-Unsubscribe'));
        assert.equal(get.headers.authorization, 'Bearer at-1');
    });

    it('later runs: history since the cursor; drafts and spam skipped by label; private user label read', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${GMAIL_API}/history?`, () => ({
                status: 200,
                body: {
                    historyId: '1000',
                    history: [
                        { id: '901', messagesAdded: [{ message: { id: 'c', labelIds: ['INBOX', 'Label_7'] } }, { message: { id: 'd', labelIds: ['DRAFT'] } }] },
                        { id: '902', messagesAdded: [{ message: { id: 'e', labelIds: ['SPAM'] } }, { message: { id: 'f', labelIds: ['SENT'] } }] },
                    ],
                },
            })),
            route(`${GMAIL_API}/messages/c`, () => ({ status: 200, body: gmailMessage('c', { labelIds: ['INBOX', 'Label_7'] }) })),
            route(`${GMAIL_API}/messages/f`, () => ({
                status: 200,
                body: gmailMessage('f', {
                    labelIds: ['SENT'],
                    payload: { mimeType: 'multipart/mixed', headers: [{ name: 'From', value: ctx.mailbox }, { name: 'To', value: 'ravi@customer.in' }, { name: 'List-Unsubscribe', value: '<x>' }] },
                }),
            })),
            route(`${GMAIL_API}/labels`, () => ({ status: 200, body: { labels: [{ id: 'Label_7', name: 'Private', type: 'user' }, { id: 'INBOX', name: 'INBOX', type: 'system' }] } })),
        ]);
        const page = await createGmailAdapter(fetchImpl).listNew(ctx, { kind: 'gmail', historyId: '900' }, opts);
        assert.deepEqual(page.cursor, { kind: 'gmail', historyId: '1000' });
        assert.equal(page.complete, true);
        assert.deepEqual(page.messages.map((m) => m.providerMessageId), ['c', 'f']);
        assert.equal(page.messages[0].privateMarked, true);
        assert.equal(page.messages[1].sentByMailbox, true);
        assert.equal(page.messages[1].hasAttachments, true);
        assert.equal(page.messages[1].automated, true);
        assert.equal(new URL(calls[0].url).searchParams.get('startHistoryId'), '900');
        assert.ok(!calls.some((c) => c.url.includes('/messages/d') || c.url.includes('/messages/e')));
    });

    it('stops at the limit and keeps the last handled history record as the cursor', async () => {
        const { fetchImpl } = fakeFetch([
            route(`${GMAIL_API}/history?`, () => ({
                status: 200,
                body: { historyId: '2000', nextPageToken: 'p2', history: [{ id: '901', messagesAdded: [{ message: { id: 'c' } }] }, { id: '902', messagesAdded: [{ message: { id: 'f' } }] }] },
            })),
            route(`${GMAIL_API}/messages/`, (call) => ({ status: 200, body: gmailMessage(call.url.split('/messages/')[1].split('?')[0]) })),
        ]);
        const page = await createGmailAdapter(fetchImpl).listNew(ctx, { kind: 'gmail', historyId: '900' }, { since, limit: 1 });
        assert.equal(page.complete, false);
        assert.deepEqual(page.cursor, { kind: 'gmail', historyId: '901' });
        assert.equal(page.messages.length, 1);
    });

    it('a 404 on history (cursor too old) falls back to the bounded full sync', async () => {
        const { fetchImpl } = fakeFetch([
            route(`${GMAIL_API}/history?`, () => ({ status: 404, body: { error: { code: 404, message: 'Requested entity was not found.', errors: [{ reason: 'notFound' }] } } })),
            route(`${GMAIL_API}/profile`, () => ({ status: 200, body: { historyId: '5000' } })),
            route(`${GMAIL_API}/messages?`, () => ({ status: 200, body: {} })),
        ]);
        const page = await createGmailAdapter(fetchImpl).listNew(ctx, { kind: 'gmail', historyId: '1' }, opts);
        assert.equal(page.resynced, true);
        assert.deepEqual(page.cursor, { kind: 'gmail', historyId: '5000' });
    });

    it('builds the Gmail link for the employee', () => {
        assert.equal(createGmailAdapter().webLinkOf(ctx.mailbox, { providerMessageId: 'abc', webLink: null }), 'https://mail.google.com/mail/?authuser=asha%40nandiniinfosys.com#all/abc');
    });
});

describe('Graph mail adapter', () => {
    const graphMsg = (id: string, over: Record<string, unknown> = {}) => ({
        id,
        conversationId: 'conv',
        internetMessageId: `<${id}@outlook>`,
        subject: 'Hello',
        from: { emailAddress: { address: 'Ravi@Customer.in', name: 'Ravi' } },
        toRecipients: [{ emailAddress: { address: 'asha@nandiniinfosys.com', name: 'Asha' } }],
        ccRecipients: [],
        sentDateTime: '2026-11-30T10:00:00Z',
        bodyPreview: 'preview',
        hasAttachments: true,
        isDraft: false,
        sensitivity: 'normal',
        categories: [],
        webLink: 'https://outlook.office365.com/owa/?ItemID=x',
        ...over,
    });
    const base = `${GRAPH_API}/users/${encodeURIComponent(ctx.mailbox)}`;

    it('first run reads Inbox and Sent Items delta (bounded filter) and keeps both delta links', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${base}/mailFolders('inbox')/messages/delta`, () => ({ status: 200, body: { value: [graphMsg('i1'), { id: 'gone', '@removed': { reason: 'deleted' } }], '@odata.deltaLink': `${GRAPH_API}/delta-inbox` } })),
            route(`${base}/mailFolders('sentitems')/messages/delta`, () => ({ status: 200, body: { value: [graphMsg('s1', { sensitivity: 'private' })], '@odata.deltaLink': `${GRAPH_API}/delta-sent` } })),
        ]);
        const page = await createGraphMailAdapter(fetchImpl).listNew(ctx, null, opts);
        assert.deepEqual(page.cursor, { kind: 'graph', inbox: `${GRAPH_API}/delta-inbox`, sent: `${GRAPH_API}/delta-sent` });
        assert.equal(page.resynced, true);
        assert.deepEqual(page.messages.map((m) => [m.providerMessageId, m.sentByMailbox, m.privateMarked]), [
            ['i1', false, false],
            ['s1', true, true],
        ]);
        assert.equal(page.messages[0].from?.email, 'ravi@customer.in');
        assert.equal(page.messages[0].automated, null);
        const first = new URL(calls[0].url);
        assert.equal(first.searchParams.get('$filter'), `receivedDateTime ge ${since.toISOString()}`);
        assert.ok(!first.searchParams.get('$select')!.split(',').includes('body'));
        assert.match(calls[0].headers.prefer, /ImmutableId/);
    });

    it('an expired delta link restarts that folder (bounded); a foreign link is refused', async () => {
        const { fetchImpl } = fakeFetch([
            route(`${GRAPH_API}/old-inbox`, () => ({ status: 410, body: { error: { code: 'syncStateNotFound', message: 'expired' } } })),
            route(`${base}/mailFolders('inbox')/messages/delta`, () => ({ status: 200, body: { value: [], '@odata.deltaLink': `${GRAPH_API}/new-inbox` } })),
            route(`${base}/mailFolders('sentitems')/messages/delta`, () => ({ status: 200, body: { value: [], '@odata.deltaLink': `${GRAPH_API}/new-sent` } })),
        ]);
        const page = await createGraphMailAdapter(fetchImpl).listNew(ctx, { kind: 'graph', inbox: `${GRAPH_API}/old-inbox`, sent: 'https://evil.example.com/steal' }, opts);
        assert.deepEqual(page.cursor, { kind: 'graph', inbox: `${GRAPH_API}/new-inbox`, sent: `${GRAPH_API}/new-sent` });
        assert.equal(page.resynced, true);
    });

    it('reads automation headers lazily', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${base}/messages/m1`, () => ({ status: 200, body: { internetMessageHeaders: [{ name: 'Auto-Submitted', value: 'auto-generated' }] } })),
        ]);
        assert.equal(await createGraphMailAdapter(fetchImpl).automatedOf(ctx, 'm1'), true);
        assert.match(calls[0].url, /internetMessageHeaders/);
    });

    it('the first-page URL selects headers only', () => {
        const url = graphMailDeltaUrl(ctx.mailbox, "mailFolders('inbox')", since);
        assert.ok(url.startsWith(`${base}/mailFolders('inbox')/messages/delta?`));
        assert.ok(new URL(url).searchParams.get('$select')!.includes('bodyPreview'));
    });
});

describe('mail failure classification', () => {
    const tokenError = (code: string, level: 'user' | 'app' | 'transient') => new TokenError('google', { level, code: code as never, providerText: 'unauthorized_client: Client is unauthorized' });

    it('Google: a token without the Gmail scope is the provider’s problem, not the person’s', () => {
        assert.deepEqual(classifyMailError('google', tokenError('delegation_missing', 'app')), { level: 'app', code: 'mail_scope_missing', providerText: 'unauthorized_client: Client is unauthorized' });
        assert.equal(classifyMailError('google', tokenError('user_not_found', 'user'))?.code, 'user_not_found');
        assert.equal(classifyMailError('google', tokenError('key_invalid', 'app'))?.code, 'key_invalid');
        assert.equal(classifyMailError('google', new ProviderAuthError({ provider: 'google', operation: 'mail-history', status: 403, code: 'insufficientPermissions' }))?.code, 'mail_scope_missing');
        assert.equal(
            classifyMailError('google', new ProviderBadRequestError({ provider: 'google', operation: 'mail-profile', status: 400, code: 'failedPrecondition', providerMessage: 'Mail service not enabled' }))?.code,
            'mail_unavailable',
        );
    });

    it('Microsoft: a 403 is the missing permission until a mailbox worked, then one person out of scope', () => {
        const denied = new ProviderBadRequestError({ provider: 'microsoft', operation: 'mail-delta', status: 403, code: 'ErrorAccessDenied' });
        assert.equal(classifyMailError('microsoft', denied)?.code, 'mail_permission_missing');
        assert.equal(classifyMailError('microsoft', denied, { anyMailboxOk: true })?.code, 'mailbox_out_of_scope');
        assert.equal(classifyMailError('microsoft', new ProviderBadRequestError({ provider: 'microsoft', operation: 'mail-delta', status: 404, code: 'MailboxNotEnabledForRESTAPI' }))?.code, 'no_mailbox');
    });

    it('rate limits are transient; unknown errors are not classified', () => {
        assert.equal(classifyMailError('google', new ProviderRateLimitedError({ provider: 'google', operation: 'x', status: 429, code: 'rateLimitExceeded', retryAfterMs: 5000 }))?.level, 'transient');
        assert.equal(classifyMailError('google', new Error('database down')), null);
    });

    it('admin messages stay within 300 characters', () => {
        assert.ok(mailAdminMessage('mail_scope_missing', 'x'.repeat(500)).length <= 300);
    });
});
