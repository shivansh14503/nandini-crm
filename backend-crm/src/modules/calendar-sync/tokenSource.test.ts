import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_TOKEN_URL } from '../integrations/integration.constants.js';
import { parseServiceAccountKey } from './providers/googleServiceAccount.js';
import type { ProviderAccess } from './providers/registry.js';
import type { SyncProvider } from './providers/types.js';
import { TokenError } from './syncErrors.js';
import { fakeFetch, route, type Answer, type RecordedCall } from './testing/fakeFetch.js';
import { serviceAccountKeyJson } from './testing/serviceAccountKey.js';
import { APP_NEGATIVE_TTL_MS, createTokenSource, REUSE_LEEWAY_MS, USER_NEGATIVE_TTL_MS } from './tokenSource.js';

/** The in-memory token cache (addendum §2.1): reuse, single flight, versioned keys, negative caching, invalidation. */

const key = parseServiceAccountKey(serviceAccountKeyJson());
const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const MS_TOKEN = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;

function harness(answer: (call: RecordedCall) => Answer | Promise<Answer> = () => ({ status: 200, body: { access_token: `tok-${Math.random()}`, expires_in: 3600 } })) {
    let t = new Date('2026-11-26T06:00:00.000Z').getTime();
    const version = { google: 1, microsoft: 1 };
    const { fetchImpl, calls } = fakeFetch([route(GOOGLE_TOKEN_URL, answer), route(MS_TOKEN, answer)]);
    const loadAccess = async (provider: SyncProvider): Promise<ProviderAccess> => {
        const base = { provider, enabled: true, configured: true, domains: [], healthStatus: 'unknown' as const, healthCode: null };
        if (provider === 'google') return { ...base, credentialsVersion: version.google, creds: { kind: 'google', key } };
        if (provider === 'microsoft') return { ...base, credentialsVersion: version.microsoft, creds: { kind: 'microsoft', clientId: 'id', clientSecret: 'secret', tenantId: TENANT } };
        return { ...base, credentialsVersion: 1, creds: { kind: 'fake' } };
    };
    const source = createTokenSource({ fetchImpl, now: () => new Date(t), loadAccess });
    const subjects = () => calls.map((c) => (c.form?.assertion ? (JSON.parse(Buffer.from(c.form.assertion.split('.')[1], 'base64url').toString()) as { sub?: string }).sub : '*'));
    return {
        source,
        calls,
        subjects,
        version,
        advance: (ms: number) => {
            t += ms;
        },
    };
}

describe('tokenSource', () => {
    it('reuses a grant until 5 minutes before it expires, then mints again', async () => {
        const h = harness();
        const a = await h.source.getAccessToken('google', 'Asha@NandiniInfosys.com');
        const b = await h.source.getAccessToken('google', 'asha@nandiniinfosys.com');
        assert.equal(a.accessToken, b.accessToken);
        assert.equal(h.calls.length, 1);
        assert.deepEqual(h.subjects(), ['asha@nandiniinfosys.com']);
        h.advance(3600_000 - REUSE_LEEWAY_MS + 1);
        const c = await h.source.getAccessToken('google', 'asha@nandiniinfosys.com');
        assert.notEqual(c.accessToken, a.accessToken);
        assert.equal(h.calls.length, 2);
    });

    it('keys by subject and scopes for Google; Microsoft shares one tenant token across mailboxes', async () => {
        const h = harness();
        await h.source.getAccessToken('google', 'asha@nandiniinfosys.com');
        await h.source.getAccessToken('google', 'ravi@nandiniinfosys.com');
        await h.source.getAccessToken('google', 'asha@nandiniinfosys.com', ['https://www.googleapis.com/auth/calendar.events.owned']);
        assert.equal(h.calls.length, 3);
        const m1 = await h.source.getAccessToken('microsoft', 'asha@nandiniinfosys.com');
        const m2 = await h.source.getAccessToken('microsoft', 'ravi@nandiniinfosys.com');
        assert.equal(m1.accessToken, m2.accessToken);
        assert.equal(h.calls.filter((c) => c.url === MS_TOKEN).length, 1);
    });

    it('concurrent misses share one token call (single flight)', async () => {
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const h = harness(async () => {
            await gate;
            return { status: 200, body: { access_token: 'shared', expires_in: 3600 } };
        });
        const all = Promise.all([1, 2, 3].map(() => h.source.getAccessToken('google', 'asha@nandiniinfosys.com')));
        release();
        assert.deepEqual((await all).map((g) => g.accessToken), ['shared', 'shared', 'shared']);
        assert.equal(h.calls.length, 1);
    });

    it('a new credentials version never reuses old grants', async () => {
        const h = harness();
        const a = await h.source.getAccessToken('google', 'asha@nandiniinfosys.com');
        h.version.google = 2;
        const b = await h.source.getAccessToken('google', 'asha@nandiniinfosys.com');
        assert.notEqual(a.accessToken, b.accessToken);
        assert.equal(h.calls.length, 2);
    });

    it('a user-level error is remembered 10 minutes for that subject only', async () => {
        const h = harness((call) => {
            const sub = (JSON.parse(Buffer.from(call.form!.assertion.split('.')[1], 'base64url').toString()) as { sub: string }).sub;
            return sub.startsWith('gone') ? { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid email or User ID' } } : { status: 200, body: { access_token: 'ok', expires_in: 3600 } };
        });
        const isUserNotFound = (err: unknown) => err instanceof TokenError && err.code === 'user_not_found';
        await assert.rejects(h.source.getAccessToken('google', 'gone@nandiniinfosys.com'), isUserNotFound);
        await assert.rejects(h.source.getAccessToken('google', 'gone@nandiniinfosys.com'), isUserNotFound);
        assert.equal(h.calls.length, 1, 'second failure served from the negative cache');
        await h.source.getAccessToken('google', 'asha@nandiniinfosys.com');
        h.advance(USER_NEGATIVE_TTL_MS + 1);
        await assert.rejects(h.source.getAccessToken('google', 'gone@nandiniinfosys.com'), isUserNotFound);
        assert.equal(h.calls.length, 3);
    });

    it('an app-level error blocks the provider 5 minutes (appBlocked) until invalidated or expired; transient errors are not cached', async () => {
        let mode: 'app' | 'transient' | 'ok' = 'app';
        const h = harness(() =>
            mode === 'app' ? { status: 401, body: { error: 'unauthorized_client' } } : mode === 'transient' ? { status: 503 } : { status: 200, body: { access_token: 'ok', expires_in: 3600 } },
        );
        await assert.rejects(h.source.getAccessToken('google', 'asha@nandiniinfosys.com'), (err: unknown) => err instanceof TokenError && err.code === 'delegation_missing');
        await assert.rejects(h.source.getAccessToken('google', 'ravi@nandiniinfosys.com'), (err: unknown) => err instanceof TokenError && err.level === 'app');
        assert.equal(h.calls.length, 1);
        assert.equal(h.source.appBlocked('google', 1)?.code, 'delegation_missing');
        assert.equal(h.source.appBlocked('google', 2), null, 'other credentials are not blocked');
        h.advance(APP_NEGATIVE_TTL_MS + 1);
        assert.equal(h.source.appBlocked('google', 1), null);

        mode = 'transient';
        await assert.rejects(h.source.getAccessToken('google', 'asha@nandiniinfosys.com'), (err: unknown) => err instanceof TokenError && err.level === 'transient');
        await assert.rejects(h.source.getAccessToken('google', 'asha@nandiniinfosys.com'));
        assert.equal(h.calls.length, 3);

        mode = 'app';
        await assert.rejects(h.source.getAccessToken('google', 'asha@nandiniinfosys.com'));
        h.source.invalidate('google');
        mode = 'ok';
        assert.equal((await h.source.getAccessToken('google', 'asha@nandiniinfosys.com')).accessToken, 'ok');
    });

    it('invalidate(provider, email) drops that subject; invalidate(provider) drops the whole provider', async () => {
        const h = harness();
        await h.source.getAccessToken('google', 'asha@nandiniinfosys.com');
        await h.source.getAccessToken('google', 'ravi@nandiniinfosys.com');
        await h.source.getAccessToken('microsoft', 'asha@nandiniinfosys.com');
        h.source.invalidate('google', 'ASHA@nandiniinfosys.com');
        await h.source.getAccessToken('google', 'asha@nandiniinfosys.com');
        await h.source.getAccessToken('google', 'ravi@nandiniinfosys.com');
        assert.equal(h.calls.length, 4);
        h.source.invalidate('microsoft');
        await h.source.getAccessToken('microsoft', 'ravi@nandiniinfosys.com');
        assert.equal(h.calls.length, 5);
    });

    it('not configured → app-level not_configured, no call', async () => {
        const source = createTokenSource({
            fetchImpl: async () => {
                throw new Error('no call expected');
            },
            loadAccess: async (provider) => ({ provider, enabled: true, configured: false, credentialsVersion: 1, domains: [], healthStatus: 'unknown', healthCode: null, creds: null }),
        });
        await assert.rejects(source.getAccessToken('google', 'asha@nandiniinfosys.com'), (err: unknown) => err instanceof TokenError && err.code === 'not_configured');
    });
});
