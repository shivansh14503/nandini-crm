import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { z } from 'zod';
import { fakeFetch, route } from '../testing/fakeFetch.js';
import {
    backoffDelay,
    classifyFailure,
    CursorExpiredError,
    errorBitsOf,
    parseRetryAfter,
    ProviderAuthError,
    ProviderBadRequestError,
    ProviderClientError,
    ProviderConflictError,
    ProviderError,
    providerFetch,
    ProviderNotFoundError,
    providerPausedUntil,
    ProviderPreconditionError,
    ProviderRateLimitedError,
    ProviderTransientError,
    resetProviderPauses,
} from './http.js';

/** providerFetch (spec §7.3): retries, Retry-After, the per-process pause, error classes, and what messages carry. */

const URL_WITH_SECRET = 'https://graph.example.test/me/events/delta?$deltatoken=SECRET-CURSOR';
const ctx = { provider: 'google', operation: 'events' };
const instant = async () => {};

afterEach(() => resetProviderPauses());

describe('pure helpers', () => {
    it('parseRetryAfter reads delta seconds and HTTP dates', () => {
        const now = Date.parse('2026-11-26T06:00:00Z');
        assert.equal(parseRetryAfter('3', now), 3000);
        assert.equal(parseRetryAfter('1.5', now), 1500);
        assert.equal(parseRetryAfter('Thu, 26 Nov 2026 06:00:10 GMT', now), 10_000);
        assert.equal(parseRetryAfter('Thu, 26 Nov 2026 05:00:00 GMT', now), 0, 'a past date waits nothing');
        assert.equal(parseRetryAfter('', now), null);
        assert.equal(parseRetryAfter(null, now), null);
        assert.equal(parseRetryAfter('soon', now), null);
    });

    it('backoffDelay is full jitter, doubling, capped at 30 s', () => {
        assert.equal(backoffDelay(1, () => 0.999), 999);
        assert.equal(backoffDelay(2, () => 0.5), 1000);
        assert.equal(backoffDelay(3, () => 0.5), 2000);
        assert.equal(backoffDelay(20, () => 0.5), 15_000);
        assert.equal(backoffDelay(4, () => 0), 0);
    });

    it('errorBitsOf reads OAuth, AADSTS, Google and Graph error bodies', () => {
        assert.deepEqual(errorBitsOf({ error: 'invalid_grant', error_description: 'Bad Request' }), { code: 'invalid_grant', message: 'Bad Request' });
        assert.equal(errorBitsOf({ error: 'invalid_grant', error_description: 'AADSTS700082: The refresh token has expired' }).code, 'AADSTS700082');
        assert.equal(errorBitsOf({ error: 'invalid_grant', error_description: 'x', error_codes: [50173] }).code, 'AADSTS50173');
        assert.equal(errorBitsOf({ error: 'invalid_request', error_description: 'AADSTS90014: missing' }).code, 'invalid_request', 'unlisted AADSTS keeps the OAuth error');
        assert.deepEqual(errorBitsOf({ error: { code: 403, message: 'Rate', errors: [{ reason: 'rateLimitExceeded' }] } }), { code: 'rateLimitExceeded', message: 'Rate' });
        assert.deepEqual(errorBitsOf({ error: { code: 'ErrorItemNotFound', message: 'gone' } }), { code: 'ErrorItemNotFound', message: 'gone' });
        assert.deepEqual(errorBitsOf('nope'), { code: '', message: '' });
        assert.deepEqual(errorBitsOf(null), { code: '', message: '' });
    });

    it('classifyFailure maps statuses and codes to the error classes', () => {
        const of = (status: number, code = '', extra: { cursor?: boolean; retryAfterMs?: number | null } = {}) => classifyFailure(status, { code, message: '' }, { ...ctx, ...extra });
        assert.ok(of(400, 'invalid_client') instanceof ProviderClientError);
        assert.ok(of(401, 'unauthorized_client') instanceof ProviderClientError);
        assert.ok(of(400, 'invalid_grant') instanceof ProviderAuthError);
        assert.ok(of(400, 'invalid_token') instanceof ProviderAuthError);
        assert.ok(of(400, 'AADSTS700082') instanceof ProviderAuthError);
        assert.ok(of(401) instanceof ProviderAuthError);
        assert.ok(of(403, 'insufficientPermissions') instanceof ProviderAuthError);
        assert.ok(of(410, '', { cursor: true }) instanceof CursorExpiredError);
        assert.ok(of(400, 'syncStateNotFound', { cursor: true }) instanceof CursorExpiredError);
        assert.ok(of(410) instanceof ProviderNotFoundError, 'a 410 outside a list call is a deleted item');
        assert.ok(of(404) instanceof ProviderNotFoundError);
        assert.ok(of(409) instanceof ProviderConflictError);
        assert.ok(of(412) instanceof ProviderPreconditionError);
        assert.ok(of(429) instanceof ProviderRateLimitedError);
        assert.ok(of(403, 'userRateLimitExceeded') instanceof ProviderRateLimitedError);
        assert.ok(of(503, '', { retryAfterMs: 5000 }) instanceof ProviderRateLimitedError);
        assert.ok(of(503) instanceof ProviderTransientError);
        assert.ok(of(500) instanceof ProviderTransientError);
        const bad = classifyFailure(400, { code: 'invalidArgument', message: 'Bad attendee' }, ctx);
        assert.ok(bad instanceof ProviderBadRequestError);
        assert.equal(bad.providerMessage, 'Bad attendee');
        assert.equal(of(418).code, 'http_418');
    });
});

describe('providerFetch', () => {
    it('sends a form body with its content type and parses the answer with the schema', async () => {
        const { fetchImpl, calls } = fakeFetch([route('https://oauth.test/token', () => ({ status: 200, body: { access_token: 'a', extra: 1 } }), 'POST')]);
        const res = await providerFetch(
            { method: 'POST', url: 'https://oauth.test/token', body: new URLSearchParams({ grant_type: 'refresh_token' }), provider: 'google', operation: 'refresh' },
            { fetchImpl, schema: z.object({ access_token: z.string() }) },
        );
        assert.deepEqual(res.json, { access_token: 'a' });
        assert.deepEqual(calls[0].form, { grant_type: 'refresh_token' });
        assert.equal(calls[0].headers.accept, 'application/json');
    });

    it('an answer that fails the schema → bad_response (the zod issues are not passed on)', async () => {
        const { fetchImpl } = fakeFetch([route('https://api.test/', () => ({ status: 200, body: { id: 42 } }))]);
        await assert.rejects(
            providerFetch({ method: 'GET', url: 'https://api.test/x', provider: 'google', operation: 'get' }, { fetchImpl, schema: z.object({ id: z.string() }) }),
            (err: unknown) => err instanceof ProviderTransientError && err.code === 'bad_response' && err.message === 'google get failed: 200 bad_response',
        );
    });

    it('retries 429 / 5xx in place (Retry-After first, else backoff) and succeeds', async () => {
        const answers = [
            { status: 429, headers: { 'retry-after': '2' } },
            { status: 503 },
            { status: 200, body: { ok: true } },
        ];
        const { fetchImpl, calls } = fakeFetch([route('https://api.test/', () => answers.shift()!)]);
        const waits: number[] = [];
        const res = await providerFetch({ method: 'GET', url: 'https://api.test/x', provider: 'google', operation: 'get' }, { fetchImpl, sleep: async (ms) => void waits.push(ms), random: () => 0.5 });
        assert.equal(res.status, 200);
        assert.equal(calls.length, 3);
        assert.deepEqual(waits, [2000, 1000]);
    });

    it('gives up after the attempts with the last failure', async () => {
        const { fetchImpl, calls } = fakeFetch([route('https://api.test/', () => ({ status: 502 }))]);
        await assert.rejects(
            providerFetch({ method: 'GET', url: 'https://api.test/x', provider: 'google', operation: 'get' }, { fetchImpl, sleep: instant, attempts: 3 }),
            (err: unknown) => err instanceof ProviderTransientError && err.status === 502,
        );
        assert.equal(calls.length, 3);
    });

    it('a Retry-After over 30 s is thrown at once; one of a minute or more pauses the provider in this process', async () => {
        const { fetchImpl, calls } = fakeFetch([route('https://api.test/', () => ({ status: 429, headers: { 'retry-after': '120' } }))]);
        const t = Date.parse('2026-11-26T06:00:00Z');
        await assert.rejects(
            providerFetch({ method: 'GET', url: 'https://api.test/x', provider: 'microsoft', operation: 'delta' }, { fetchImpl, sleep: instant, now: () => t }),
            (err: unknown) => err instanceof ProviderRateLimitedError && err.retryAfterMs === 120_000,
        );
        assert.equal(calls.length, 1);
        assert.equal(providerPausedUntil('microsoft'), t + 120_000);
        // While paused, nothing is sent to that provider; others are not affected.
        await assert.rejects(
            providerFetch({ method: 'GET', url: 'https://api.test/x', provider: 'microsoft', operation: 'delta' }, { fetchImpl, now: () => t + 1000 }),
            (err: unknown) => err instanceof ProviderRateLimitedError && err.code === 'paused',
        );
        assert.equal(calls.length, 1);
        assert.equal(providerPausedUntil('google'), null);
    });

    it('does not retry an auth failure', async () => {
        const { fetchImpl, calls } = fakeFetch([route('https://oauth.test/', () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }))]);
        await assert.rejects(
            providerFetch({ method: 'POST', url: 'https://oauth.test/token', body: new URLSearchParams(), provider: 'google', operation: 'refresh' }, { fetchImpl, sleep: instant }),
            ProviderAuthError,
        );
        assert.equal(calls.length, 1);
    });

    it('network errors and timeouts are retried, then reported as network / timeout', async () => {
        const network = fakeFetch([route('https://api.test/', () => new TypeError('fetch failed'))]);
        await assert.rejects(
            providerFetch({ method: 'GET', url: 'https://api.test/x', provider: 'google', operation: 'get' }, { fetchImpl: network.fetchImpl, sleep: instant, attempts: 2 }),
            (err: unknown) => err instanceof ProviderTransientError && err.code === 'network' && err.status === 0,
        );
        assert.equal(network.calls.length, 2);

        const slow = fakeFetch([route('https://api.test/', () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))]);
        await assert.rejects(
            providerFetch({ method: 'GET', url: 'https://api.test/x', provider: 'google', operation: 'get' }, { fetchImpl: slow.fetchImpl, sleep: instant, attempts: 1 }),
            (err: unknown) => err instanceof ProviderTransientError && err.code === 'timeout',
        );
    });

    it('error messages carry provider, operation, status and code only: never the URL, a body or a header', async () => {
        const { fetchImpl } = fakeFetch([
            route('https://graph.example.test/', () => ({ status: 400, body: { error: { code: 'ErrorInvalidRequest', message: 'Customer Acme Corp secret-token-123' } } })),
        ]);
        await assert.rejects(
            providerFetch(
                { method: 'POST', url: URL_WITH_SECRET, headers: { Authorization: 'Bearer AT-SECRET' }, body: JSON.stringify({ subject: 'Acme Corp' }), provider: 'microsoft', operation: 'delta' },
                { fetchImpl, sleep: instant },
            ),
            (err: unknown) => {
                assert.ok(err instanceof ProviderError);
                assert.equal(err.message, 'microsoft delta failed: 400 ErrorInvalidRequest');
                const everything = JSON.stringify({ message: err.message, stack: err.stack, own: { ...err } });
                for (const secret of ['SECRET-CURSOR', 'AT-SECRET', 'deltatoken']) assert.ok(!everything.includes(secret), secret);
                return true;
            },
        );
    });
});
