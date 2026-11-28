import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TokenError } from '../calendar-sync/syncErrors.js';
import { GMAIL_SEND_URL, gmailSendError, MailSendError, sendViaGmail } from './gmail.sender.js';

const message = { from: { email: 'crm@nandiniinfosys.com', name: 'Nandini CRM' }, to: 'asha@nandiniinfosys.com', subject: 'Hi ₹', html: '<p>Hello</p>', text: 'Hello' };

describe('sendViaGmail', () => {
    it('posts the base64url MIME message with a token minted for the sender', async () => {
        const calls: { url: string; init?: RequestInit }[] = [];
        let subject = '';
        const result = await sendViaGmail(message, {
            getToken: async (sender) => {
                subject = sender;
                return 'tok';
            },
            fetchImpl: async (url, init) => {
                calls.push({ url, init });
                return new Response(JSON.stringify({ id: 'gm-1', threadId: 't' }), { status: 200 });
            },
        });
        assert.equal(subject, 'crm@nandiniinfosys.com');
        assert.deepEqual(result, { messageId: 'gm-1' });
        assert.equal(calls[0].url, GMAIL_SEND_URL);
        assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer tok');
        const raw = Buffer.from(JSON.parse(String(calls[0].init?.body)).raw, 'base64url').toString();
        assert.match(raw, /^From: Nandini CRM <crm@nandiniinfosys\.com>/m);
        assert.match(raw, /^To: asha@nandiniinfosys\.com/m);
        assert.match(raw, /^Subject: =\?UTF-8\?/m);
        assert.match(raw, /multipart\/alternative/);
    });

    it('turns a missing delegation into an admin sentence naming the gmail.send scope, not retried', async () => {
        await assert.rejects(
            sendViaGmail(message, { clientId: '1234', getToken: async () => Promise.reject(new TokenError('google', { level: 'app', code: 'delegation_missing' })) }),
            (err: unknown) => err instanceof MailSendError && !err.retryable && /gmail\.send/.test(err.message) && /1234/.test(err.message),
        );
    });

    it('retries network failures and rate limits, not refused recipients', async () => {
        await assert.rejects(
            sendViaGmail(message, { getToken: async () => 'tok', fetchImpl: async () => Promise.reject(new Error('ECONNRESET')) }),
            (err: unknown) => err instanceof MailSendError && err.retryable && err.code === 'network',
        );
        assert.equal(gmailSendError(429, {}, 'x').retryable, true);
        assert.equal(gmailSendError(503, {}, 'x').retryable, true);
        assert.equal(gmailSendError(400, { error: { message: 'Invalid To header' } }, 'x').retryable, false);
        assert.equal(gmailSendError(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }, 'x').code, 'scope_missing');
    });
});
