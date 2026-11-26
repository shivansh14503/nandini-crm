import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ENV } from '../../config/env.js';
import { configureSecretBox, parseKeyRing, secretBox } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL } from '../integrations/integration.constants.js';
import { dropProviderCredentialsCache } from '../integrations/integration.service.js';
import { userEmailService } from '../users/userEmail.service.js';
import { connectionService } from './connection.service.js';
import { withAccessToken } from './connectionTokens.js';
import {
    callbackLocation,
    callbackSessionOf,
    checkAccountPolicy,
    completeConnect,
    loginLocation,
    oauthCookieAad,
    openOAuthCookie,
    returnOriginFor,
    sealOAuthCookie,
    startConnect,
    type OAuthCookie,
} from './oauth.js';
import { createFakeAdapter, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { createGoogleAdapter } from './providers/google.js';
import { createMicrosoftAdapter, GRAPH_ME_URL } from './providers/microsoft.js';
import { setAdapterForTests, setFakeProviderEnabledForTests } from './providers/registry.js';
import { blankConnection, installConnectionDouble, restoreConnectionDouble, type DoubleState, type UserRow } from './testing/connectionDouble.js';
import { fakeFetch, idToken, route, type RecordedCall } from './testing/fakeFetch.js';

/**
 * The connect flow end to end against the Prisma double: start → (provider) → callback, with the in-memory fake
 * provider and with the Google / Microsoft adapters on a replayed `fetch` (documented answer shapes, not recorded).
 */

const now = new Date('2026-11-26T06:00:00.000Z');
const nowSeconds = Math.floor(now.getTime() / 1000);
/** The fake provider's clock (it stamps access-token expiry). */
let fakeClock = now;
const APP = ENV.MAIL.APP_PUBLIC_URL;
const CRM = 'http://localhost:8007';

const asha: UserRow = { id: 1, username: 'asha', fullName: 'Asha Rao', email: 'asha@nandiniinfosys.com', isActive: true, isGroupUser: false };
const neel: UserRow = { id: 2, username: 'neel', fullName: 'Neel', email: null, isActive: true, isGroupUser: false };
const support: UserRow = { id: 3, username: 'support', fullName: 'Support Desk', email: 'support@nandiniinfosys.com', isActive: true, isGroupUser: true };
const ravi: UserRow = { id: 4, username: 'ravi', fullName: 'Ravi', email: 'ravi@nandiniinfosys.com', isActive: true, isGroupUser: false };
const users = [asha, neel, support, ravi];

const authOf = (u: UserRow): AuthUser => ({ id: u.id, username: u.username, role: 'Sales Executive' });
const sessionOf = (u: UserRow) => ({ id: u.id, username: u.username });

const GOOGLE_CLIENT = 'gid.apps.googleusercontent.com';
const MS_CLIENT = '11111111-2222-3333-4444-555555555555';
const MS_TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function providerRow(provider: 'google' | 'microsoft', over: Record<string, unknown> = {}) {
    return {
        provider,
        enabled: true,
        clientId: provider === 'google' ? GOOGLE_CLIENT : MS_CLIENT,
        secretsEnc: secretBox.seal(JSON.stringify({ clientSecret: `${provider}-secret-value` }), `IntegrationProvider:${provider}:secrets`),
        keyId: 'k1',
        secretHintsJson: null,
        settingsJson: JSON.stringify(provider === 'google' ? { scopeProfile: 'narrow', pkce: true } : { tenantId: MS_TENANT }),
        clientVersion: 3,
        lastTestAt: null,
        lastTestOk: null,
        lastTestMessage: null,
        updatedBy: 'admin',
        createdAt: now,
        updatedAt: now,
        ...over,
    };
}

const expectHttp = async (promise: Promise<unknown>, status: number, code?: string) => {
    await assert.rejects(promise, (err: unknown) => {
        assert.ok(err instanceof HttpError, `expected HttpError, got ${String(err)}`);
        assert.equal(err.statusCode, status);
        if (code) assert.equal(err.code, code);
        return true;
    });
};

const params = (location: string) => Object.fromEntries(new URL(location).searchParams);

let state: DoubleState;

beforeEach(() => {
    configureSecretBox(parseKeyRing(`k1:${randomBytes(32).toString('base64')}`));
    resetFakeProvider();
    setFakeProviderEnabledForTests(true);
    fakeClock = now;
    setAdapterForTests('fake', createFakeAdapter({ now: () => fakeClock }));
    dropProviderCredentialsCache();
});

afterEach(() => {
    restoreConnectionDouble();
    configureSecretBox(null);
    setFakeProviderEnabledForTests(null);
    setAdapterForTests('google', null);
    setAdapterForTests('microsoft', null);
    setAdapterForTests('fake', null);
});

/** start → follow the fake "consent screen" → callback. */
async function connectFake(user: UserRow, origin: string | undefined = CRM, at: Date = now) {
    const { authUrl, cookie } = await startConnect(authOf(user), 'fake', origin, at);
    const query = Object.fromEntries(new URL(authUrl).searchParams);
    const location = await completeConnect({ provider: 'fake', query, cookie, session: sessionOf(user), now: at });
    return { location, cookie, query };
}

describe('crm_oauth cookie and redirects', () => {
    beforeEach(() => {
        state = installConnectionDouble({ users });
    });

    const cookie = (over: Partial<OAuthCookie> = {}): OAuthCookie => ({ s: 'state', v: 'verifier', n: 'nonce', u: 1, p: 'google', o: CRM, exp: now.getTime() + 60_000, ...over });

    it('opens only for the same provider and CRM user, before it expires, untampered', () => {
        const sealed = sealOAuthCookie(cookie());
        assert.deepEqual(openOAuthCookie(sealed, 'google', 1, now), cookie());
        assert.equal(openOAuthCookie(sealed, 'microsoft', 1, now), null, 'another provider (AAD mismatch)');
        assert.equal(openOAuthCookie(sealed, 'google', 2, now), null, 'another user (AAD mismatch)');
        assert.equal(openOAuthCookie(sealed, 'google', 1, new Date(now.getTime() + 61_000)), null, 'expired');
        assert.equal(openOAuthCookie(`${sealed.slice(0, -2)}AA`, 'google', 1, now), null, 'tampered');
        assert.equal(openOAuthCookie(undefined, 'google', 1, now), null);
        assert.equal(oauthCookieAad('google', 1), 'oauth:google:1');
    });

    it('returns to the CRM origin that started the flow, never to another one', () => {
        assert.equal(returnOriginFor('http://localhost:8007'), 'http://localhost:8007');
        assert.equal(returnOriginFor('http://192.168.1.20:8007'), 'http://192.168.1.20:8007');
        assert.equal(returnOriginFor(ENV.CLIENT_ORIGIN), ENV.CLIENT_ORIGIN.replace(/\/+$/, ''));
        assert.equal(returnOriginFor('https://evil.example.com'), APP);
        assert.equal(returnOriginFor(undefined), APP);
        assert.equal(callbackLocation(CRM, { ok: true, provider: 'google' }), `${CRM}/connected-calendars?calendar=connected&provider=google`);
        assert.equal(callbackLocation(CRM, { ok: false, reason: 'denied', provider: 'microsoft' }), `${CRM}/connected-calendars?calendar=error&reason=denied&provider=microsoft`);
        assert.equal(loginLocation(), `${APP}/login?next=%2Fconnected-calendars`);
    });

    it('requires the Google hd claim to be a company domain', () => {
        const identity = { accountId: 's', email: 'a@nandiniinfosys.com', emailVerified: true };
        assert.equal(checkAccountPolicy('google', { ...identity, tenantId: 'nandiniinfosys.com' }, ['nandiniinfosys.com']), null);
        assert.equal(checkAccountPolicy('google', { ...identity, tenantId: 'other.com' }, ['nandiniinfosys.com']), 'domain_not_allowed');
        assert.equal(checkAccountPolicy('google', identity, ['nandiniinfosys.com']), 'domain_not_allowed');
        assert.equal(checkAccountPolicy('microsoft', identity, ['nandiniinfosys.com']), null);
    });
});

describe('start refusals', () => {
    beforeEach(() => {
        state = installConnectionDouble({ users, providers: [providerRow('google', { enabled: false })] });
    });

    it('refuses without the encryption key (503 INTEGRATIONS_NOT_READY)', async () => {
        configureSecretBox(null);
        await expectHttp(startConnect(authOf(asha), 'fake', CRM, now), 503, 'INTEGRATIONS_NOT_READY');
    });

    it('refuses a provider that is off or not set up (409 PROVIDER_DISABLED)', async () => {
        await expectHttp(startConnect(authOf(asha), 'google', CRM, now), 409, 'PROVIDER_DISABLED');
        await expectHttp(startConnect(authOf(asha), 'microsoft', CRM, now), 409, 'PROVIDER_DISABLED');
        setFakeProviderEnabledForTests(false);
        await expectHttp(startConnect(authOf(asha), 'fake', CRM, now), 409, 'PROVIDER_DISABLED');
    });

    it('refuses group (shared) logins (403) and inactive users', async () => {
        await expectHttp(startConnect(authOf(support), 'fake', CRM, now), 403);
        state.users.find((u) => u.id === asha.id)!.isActive = false;
        await expectHttp(startConnect(authOf(asha), 'fake', CRM, now), 403);
    });

    it('refuses a second calendar provider (409 CALENDAR_ALREADY_CONNECTED) but allows reconnecting the same one', async () => {
        state.connections.push(blankConnection({ id: 'g1', username: 'asha', provider: 'google', accountId: 'sub-1', accountEmail: 'asha@nandiniinfosys.com' }, now));
        await expectHttp(startConnect(authOf(asha), 'fake', CRM, now), 409, 'CALENDAR_ALREADY_CONNECTED');
        state.connections[0].status = 'disconnected';
        await startConnect(authOf(asha), 'fake', CRM, now);
    });

    it('the test provider needs an existing company email (it never writes one)', async () => {
        await expectHttp(startConnect(authOf(neel), 'fake', CRM, now), 400);
    });
});

describe('connect → callback → refresh → disconnect (fake provider)', () => {
    beforeEach(() => {
        state = installConnectionDouble({ users });
    });

    it('connects, seals the tokens, audits CONNECT and returns to the starting origin', async () => {
        const { location, cookie } = await connectFake(asha, 'http://192.168.1.20:8007');
        assert.equal(location, 'http://192.168.1.20:8007/connected-calendars?calendar=connected&provider=fake');
        assert.equal(state.connections.length, 1);
        const row = state.connections[0];
        assert.equal(row.status, 'active');
        assert.equal(row.accountEmail, 'asha@nandiniinfosys.com');
        assert.equal(row.accountId, 'fake:asha@nandiniinfosys.com');
        assert.equal(row.clientVersion, 1);
        assert.match(row.accessTokenEnc!, /^enc:v1:k1:/);
        assert.match(row.refreshTokenEnc!, /^enc:v1:k1:/);
        assert.equal(row.keyId, 'k1');
        // Nothing in the row or the audit carries a token in clear.
        const stored = JSON.stringify(row) + JSON.stringify(state.audits);
        for (const value of fakeProviderState.refreshTokens.keys()) assert.ok(!stored.includes(value));
        assert.ok(!stored.includes(cookie));
        assert.deepEqual(state.audits.map((a) => [a.entityType, a.action, a.changedBy]), [['CalendarConnection', 'CONNECT', 'asha']]);
        assert.deepEqual(state.audits[0].changes, { provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', by: 'asha' });
        // The user's email is never written by the test provider.
        assert.equal(state.users.find((u) => u.id === asha.id)!.email, 'asha@nandiniinfosys.com');
        assert.ok(state.locks.some((key) => key.startsWith('calendar-connection:user:asha')));
        // No email was written, so the user directory cache stays.
        assert.ok(!state.cacheInvalidations.some((pattern) => pattern.startsWith('cache:lookups:users')));
    });

    it('PKCE: the code only exchanges with the verifier sealed in the cookie', async () => {
        const { authUrl, cookie } = await startConnect(authOf(asha), 'fake', CRM, now);
        const query = Object.fromEntries(new URL(authUrl).searchParams);
        const grant = fakeProviderState.codes.get(query.code)!;
        const opened = openOAuthCookie(cookie, 'fake', asha.id, now)!;
        assert.equal(grant.codeChallenge, createHash('sha256').update(opened.v).digest('base64url'));
        assert.equal(grant.nonce, opened.n);
        // A second use of the same code is refused by the provider.
        await completeConnect({ provider: 'fake', query, cookie, session: sessionOf(asha), now });
        const again = await completeConnect({ provider: 'fake', query, cookie, session: sessionOf(asha), now });
        assert.equal(params(again).reason, 'provider_error');
    });

    it('refreshes before expiry with compare-and-set, stores the rotated refresh token, then disconnects and revokes', async () => {
        await connectFake(asha);
        const row = state.connections[0];
        const firstRefresh = row.refreshTokenEnc;

        // Fresh token: used as it is.
        const token1 = await withAccessToken(row.id, async (token) => token, () => now);
        assert.equal(fakeProviderState.refreshCalls, 0);
        assert.ok(fakeProviderState.accessTokens.has(token1));

        // 56 minutes later the token expires within 5 minutes: refreshed first.
        const later = new Date(now.getTime() + 56 * 60_000);
        fakeClock = later;
        const token2 = await withAccessToken(row.id, async (token) => token, () => later);
        assert.notEqual(token2, token1);
        assert.equal(fakeProviderState.refreshCalls, 1);
        assert.equal(state.connections[0].tokenVersion, 1);
        assert.notEqual(state.connections[0].refreshTokenEnc, firstRefresh, 'rotated refresh token replaced the stored one');

        await connectionService.disconnectOwn(row.id, authOf(asha));
        const after = state.connections[0];
        assert.equal(after.status, 'disconnected');
        assert.equal(after.statusReason, 'by_user');
        assert.equal(after.accessTokenEnc, null);
        assert.equal(after.refreshTokenEnc, null);
        assert.equal(after.disconnectedBy, 'asha');
        assert.equal(fakeProviderState.revoked.length, 1, 'the grant was revoked at the provider');
        assert.deepEqual(state.audits.at(-1)!.changes, { provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', by: 'asha', reason: 'by_user' });
        // Disconnecting again is a no-op; another user's id is a 404.
        await connectionService.disconnectOwn(row.id, authOf(asha));
        assert.equal(state.audits.filter((a) => a.action === 'DISCONNECT').length, 1);
        await expectHttp(connectionService.disconnectOwn(row.id, authOf(ravi)), 404);
    });

    it('a refusal after a reconnect of the same account notifies again in the same week (dedupe key per grant)', async () => {
        await connectFake(asha);
        const id = state.connections[0].id;
        const refuseRefresh = async (at: Date) => {
            fakeClock = at;
            fakeProviderState.failNextRefresh = 'invalid_grant';
            await assert.rejects(withAccessToken(id, async (token) => token, () => at));
        };
        await refuseRefresh(new Date(now.getTime() + 56 * 60_000));
        assert.equal(state.connections[0].status, 'reauth_required');
        assert.equal(state.notifications.length, 1);

        const reconnectAt = new Date(now.getTime() + 2 * 60 * 60_000);
        fakeClock = reconnectAt;
        assert.equal(params((await connectFake(asha, CRM, reconnectAt)).location).calendar, 'connected');
        assert.equal(state.connections.length, 1, 'same row');
        assert.equal(state.connections[0].id, id);
        assert.equal(state.connections[0].connectedAt.getTime(), reconnectAt.getTime());

        await refuseRefresh(new Date(reconnectAt.getTime() + 56 * 60_000));
        assert.equal(state.notifications.length, 2, 'the second refusal of the new grant is not deduped away');
        assert.deepEqual(
            state.notifications.map((n) => n.dedupeKey),
            [`calendar_reconnect:${id}:${now.getTime()}:2026-W48`, `calendar_reconnect:${id}:${reconnectAt.getTime()}:2026-W48`],
        );
    });

    it('an admin email change racing a connect waits for it, then answers 409 EMAIL_CONNECTED', async () => {
        state.holdLocks = true;
        let admin: Promise<unknown> | null = null;
        // The moment the connect holds the user's lock (before it reads the email or writes the row), the admin saves.
        state.onLocked = (keys) => {
            if (admin || !keys.includes('calendar-connection:user:asha')) return;
            admin = userEmailService
                .setEmail('asha', { email: 'asha.rao@nandiniinfosys.com' }, { companyDomains: ['nandiniinfosys.com'], actor: authOf(ravi) })
                .then(
                    () => null,
                    (err: unknown) => err,
                );
        };
        const { location } = await connectFake(asha);
        assert.equal(params(location).calendar, 'connected');
        const err = await admin!;
        assert.ok(err instanceof HttpError, 'the admin save was refused');
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'EMAIL_CONNECTED');
        assert.equal(state.users.find((u) => u.id === asha.id)!.email, 'asha@nandiniinfosys.com');
        assert.equal(state.connections[0].accountEmail, 'asha@nandiniinfosys.com');
    });

    it('a connect racing an admin email change waits for it, then refuses the old address (email_mismatch)', async () => {
        state.holdLocks = true;
        const { authUrl, cookie } = await startConnect(authOf(asha), 'fake', CRM, now);
        const query = Object.fromEntries(new URL(authUrl).searchParams);
        let connecting: Promise<string> | null = null;
        // The admin's save holds the user's lock (also taken when clearing): the callback arrives meanwhile.
        state.onLocked = (keys) => {
            if (connecting || !keys.includes('user-email:asha.rao@nandiniinfosys.com')) return;
            assert.ok(keys.includes('calendar-connection:user:asha'));
            connecting = completeConnect({ provider: 'fake', query, cookie, session: sessionOf(asha), now });
        };
        await userEmailService.setEmail('asha', { email: 'asha.rao@nandiniinfosys.com' }, { companyDomains: ['nandiniinfosys.com'], actor: authOf(ravi) });
        assert.equal(params(await connecting!).reason, 'email_mismatch');
        assert.equal(state.connections.filter((c) => c.status === 'active').length, 0);
        assert.equal(state.users.find((u) => u.id === asha.id)!.email, 'asha.rao@nandiniinfosys.com');
    });

    it('clearing the email takes the same lock, so it can not slip past a connect either', async () => {
        await userEmailService.setEmail('ravi', { email: '' }, { companyDomains: ['nandiniinfosys.com'], actor: authOf(asha) });
        assert.ok(state.locks.includes('calendar-connection:user:ravi'));
    });

    it('reconnecting the same account re-activates its row; the list shows no token', async () => {
        await connectFake(asha);
        const id = state.connections[0].id;
        await connectionService.disconnectOwn(id, authOf(asha));
        await connectFake(asha);
        assert.equal(state.connections.length, 1);
        assert.equal(state.connections[0].id, id);
        assert.equal(state.connections[0].status, 'active');
        assert.equal(state.connections[0].disconnectedAt, null);
        assert.deepEqual(state.audits.at(-1)!.changes, { provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', by: 'asha', reconnected: true });

        const own = await connectionService.listOwn(authOf(asha));
        assert.equal(own.connections.length, 1);
        assert.equal(own.email, 'asha@nandiniinfosys.com');
        assert.equal(own.syncActive, false);
        assert.ok(own.providers.some((p) => p.provider === 'fake' && p.available));
        const json = JSON.stringify(own);
        assert.ok(!/accessToken|refreshToken|enc:v1/.test(json));
    });
});

describe('callback decision table', () => {
    beforeEach(() => {
        state = installConnectionDouble({ users });
    });

    it('no CRM session → sign in, then back to the page', async () => {
        const { authUrl, cookie } = await startConnect(authOf(asha), 'fake', CRM, now);
        const query = Object.fromEntries(new URL(authUrl).searchParams);
        assert.equal(await completeConnect({ provider: 'fake', query, cookie, session: null, now }), loginLocation());
    });

    it('a session that must change its password first is treated as none (sign in → My Profile › Security)', () => {
        assert.equal(callbackSessionOf(undefined), null);
        assert.equal(callbackSessionOf({ id: 1, username: 'asha', mustChangePassword: true }), null);
        assert.deepEqual(callbackSessionOf({ id: 1, username: 'asha', mustChangePassword: false }), { id: 1, username: 'asha' });
    });

    it('missing, expired or someone else\'s cookie → expired (back to APP_PUBLIC_URL)', async () => {
        const { authUrl, cookie } = await startConnect(authOf(asha), 'fake', CRM, now);
        const query = Object.fromEntries(new URL(authUrl).searchParams);
        assert.equal(params(await completeConnect({ provider: 'fake', query, cookie: undefined, session: sessionOf(asha), now })).reason, 'expired');
        assert.equal(params(await completeConnect({ provider: 'fake', query, cookie, session: sessionOf(ravi), now })).reason, 'expired');
        const late = new Date(now.getTime() + 11 * 60_000);
        const expired = await completeConnect({ provider: 'fake', query, cookie, session: sessionOf(asha), now: late });
        assert.ok(expired.startsWith(`${APP}/connected-calendars?`));
        assert.equal(params(expired).reason, 'expired');
        // A cookie for the fake provider can't complete a Google callback (provider mix-up).
        assert.equal(params(await completeConnect({ provider: 'google', query, cookie, session: sessionOf(asha), now })).reason, 'expired');
        assert.equal(params(await completeConnect({ provider: 'yahoo', query, cookie, session: sessionOf(asha), now })).reason, 'invalid');
    });

    it('state mismatch → invalid; access_denied → denied; any other provider error → provider_error; no code → invalid', async () => {
        const { authUrl, cookie } = await startConnect(authOf(asha), 'fake', CRM, now);
        const query = Object.fromEntries(new URL(authUrl).searchParams);
        const run = (q: Record<string, string>) => completeConnect({ provider: 'fake', query: q, cookie, session: sessionOf(asha), now }).then(params);
        assert.equal((await run({ ...query, state: 'forged' })).reason, 'invalid');
        assert.equal((await run({ state: query.state, error: 'access_denied' })).reason, 'denied');
        assert.equal((await run({ state: query.state, error: 'server_error', error_description: '<script>' })).reason, 'provider_error');
        assert.equal((await run({ state: query.state })).reason, 'invalid');
        const denied = await completeConnect({ provider: 'fake', query: { state: query.state, error: 'access_denied' }, cookie, session: sessionOf(asha), now });
        assert.ok(!denied.includes('script'), 'no provider text is reflected');
        assert.equal(state.connections.length, 0);
    });

    it('provider switched off between start and callback → not_configured', async () => {
        const { authUrl, cookie } = await startConnect(authOf(asha), 'fake', CRM, now);
        setFakeProviderEnabledForTests(false);
        const location = await completeConnect({ provider: 'fake', query: Object.fromEntries(new URL(authUrl).searchParams), cookie, session: sessionOf(asha), now });
        assert.equal(params(location).reason, 'not_configured');
    });

    it('an unticked calendar box → scope_denied, and the grant is revoked', async () => {
        fakeProviderState.nextScope = 'openid email';
        const { location } = await connectFake(asha);
        assert.equal(params(location).reason, 'scope_denied');
        assert.equal(fakeProviderState.revoked.length, 1);
        assert.equal(state.connections.length, 0);
    });

    it('another account than the CRM email → email_mismatch, and that grant is revoked', async () => {
        fakeProviderState.identityEmail = 'ravi.personal@nandiniinfosys.com';
        const { location } = await connectFake(asha);
        assert.equal(params(location).reason, 'email_mismatch');
        assert.equal(fakeProviderState.revoked.length, 1);
    });

    it('an account live for another CRM user → account_in_use, and their grant is NOT revoked', async () => {
        state.connections.push(
            blankConnection({ id: 'r1', username: 'ravi', provider: 'fake', accountId: 'fake:asha@nandiniinfosys.com', accountEmail: 'asha@nandiniinfosys.com' }, now),
        );
        const { location } = await connectFake(asha);
        assert.equal(params(location).reason, 'account_in_use');
        assert.equal(fakeProviderState.revoked.length, 0);
        assert.equal(state.connections.length, 1);
        assert.equal(state.audits.length, 0, 'the refused transaction wrote nothing');
    });
});

// ── Google and Microsoft adapters on a replayed fetch ─────────────────────────────────────────────────────────

interface GoogleScenario {
    claims?: Record<string, unknown>;
    scope?: string;
    tokenExtra?: Record<string, unknown>;
}

function googleFetch(scenario: () => GoogleScenario, nonceOf: () => string) {
    return fakeFetch([
        route(
            GOOGLE_TOKEN_URL,
            (call: RecordedCall) => {
                const s = scenario();
                if (call.form?.grant_type === 'refresh_token') return { status: 200, body: { access_token: 'ya29.refreshed', expires_in: 3599, token_type: 'Bearer' } };
                return {
                    status: 200,
                    body: {
                        access_token: 'ya29.access',
                        expires_in: 3599,
                        refresh_token: '1//refresh',
                        scope: s.scope ?? 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.events.freebusy',
                        token_type: 'Bearer',
                        id_token: idToken({
                            iss: 'https://accounts.google.com',
                            aud: GOOGLE_CLIENT,
                            sub: '1098765',
                            email: 'neel@nandiniinfosys.com',
                            email_verified: true,
                            hd: 'nandiniinfosys.com',
                            nonce: nonceOf(),
                            iat: nowSeconds,
                            exp: nowSeconds + 3600,
                            ...(s.claims ?? {}),
                        }),
                        ...(s.tokenExtra ?? {}),
                    },
                };
            },
            'POST',
        ),
        route(GOOGLE_REVOKE_URL, () => ({ status: 200, body: {} }), 'POST'),
    ]);
}

describe('Google connect (replayed answers)', () => {
    let scenario: GoogleScenario = {};
    let nonce = '';
    let calls: RecordedCall[] = [];

    beforeEach(() => {
        scenario = {};
        state = installConnectionDouble({ users, providers: [providerRow('google')] });
        const fake = googleFetch(() => scenario, () => nonce);
        calls = fake.calls;
        setAdapterForTests('google', createGoogleAdapter({ fetchImpl: fake.fetchImpl, now: () => now }));
    });

    async function connectGoogle(user: UserRow) {
        const { authUrl, cookie } = await startConnect(authOf(user), 'google', CRM, now);
        const url = new URL(authUrl);
        nonce = url.searchParams.get('nonce')!;
        const location = await completeConnect({ provider: 'google', query: { state: url.searchParams.get('state')!, code: '4/0Acode', scope: 'x' }, cookie, session: sessionOf(user), now });
        return { location, url };
    }

    it('builds the authorize URL (PKCE S256, state, nonce, offline + consent, hd, login hint, narrow scopes)', async () => {
        const { url } = await connectGoogle(asha);
        const q = url.searchParams;
        assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
        assert.equal(q.get('client_id'), GOOGLE_CLIENT);
        assert.equal(q.get('redirect_uri'), `${ENV.INTEGRATIONS.PUBLIC_API_URL}/api/calendar-connections/oauth/google/callback`);
        assert.equal(q.get('response_type'), 'code');
        assert.equal(q.get('access_type'), 'offline');
        assert.equal(q.get('prompt'), 'consent');
        assert.equal(q.get('include_granted_scopes'), 'true');
        assert.equal(q.get('code_challenge_method'), 'S256');
        assert.match(q.get('code_challenge')!, /^[A-Za-z0-9_-]{43}$/);
        assert.match(q.get('state')!, /^[A-Za-z0-9_-]{43}$/);
        assert.ok(q.get('nonce'));
        assert.equal(q.get('login_hint'), 'asha@nandiniinfosys.com');
        assert.equal(q.get('hd'), 'nandiniinfosys.com');
        assert.equal(q.get('scope'), 'openid email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.events.freebusy');
        // The token exchange sent the verifier and the client secret, to the token endpoint only.
        const token = calls.find((c) => c.url === GOOGLE_TOKEN_URL)!;
        assert.equal(token.form!.grant_type, 'authorization_code');
        assert.equal(token.form!.code, '4/0Acode');
        assert.equal(token.form!.client_secret, 'google-secret-value');
        assert.equal(createHash('sha256').update(token.form!.code_verifier).digest('base64url'), q.get('code_challenge'));
    });

    it('no PKCE when an admin switched it off; broad profile asks for calendar.events', async () => {
        state.providers.set('google', providerRow('google', { settingsJson: JSON.stringify({ scopeProfile: 'broad', pkce: false }) }));
        dropProviderCredentialsCache();
        const { authUrl } = await startConnect(authOf(asha), 'google', CRM, now);
        const q = new URL(authUrl).searchParams;
        assert.equal(q.get('code_challenge'), null);
        assert.equal(q.get('scope'), 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy');
    });

    it('fills an empty CRM email from the verified company account (audited User UPDATE by the user)', async () => {
        const { location } = await connectGoogle(neel);
        assert.equal(params(location).calendar, 'connected');
        assert.equal(state.users.find((u) => u.id === neel.id)!.email, 'neel@nandiniinfosys.com');
        assert.ok(state.cacheInvalidations.includes('cache:lookups:users*'), 'the user directory cache is dropped after the commit');
        assert.deepEqual(
            state.audits.map((a) => [a.entityType, a.action, a.changedBy]),
            [
                ['User', 'UPDATE', 'neel'],
                ['CalendarConnection', 'CONNECT', 'neel'],
            ],
        );
        const row = state.connections[0];
        assert.equal(row.accountId, '1098765');
        assert.equal(row.tenantId, 'nandiniinfosys.com');
        assert.equal(row.clientVersion, 3);
        assert.equal(row.refreshTokenExpiresAt, null);
    });

    it('stores a time-limited grant end (refresh_token_expires_in) as refreshTokenExpiresAt', async () => {
        scenario = { tokenExtra: { refresh_token_expires_in: 604800 } };
        await connectGoogle(neel);
        assert.equal(state.connections[0].refreshTokenExpiresAt!.toISOString(), new Date(now.getTime() + 604800 * 1000).toISOString());
        const own = await connectionService.listOwn(authOf(neel));
        assert.equal(own.connections[0].accessEndsAt, new Date(now.getTime() + 604800 * 1000).toISOString());
    });

    it('a token without hd (consumer Gmail) → domain_not_allowed, revoked', async () => {
        scenario = { claims: { hd: undefined, email: 'neel@gmail.com' } };
        const { location } = await connectGoogle(neel);
        assert.equal(params(location).reason, 'domain_not_allowed');
        assert.ok(calls.some((c) => c.url === GOOGLE_REVOKE_URL && c.form?.token === '1//refresh'));
        assert.equal(state.connections.length, 0);
        assert.equal(state.users.find((u) => u.id === neel.id)!.email, null);
    });

    it('another Workspace domain → domain_not_allowed', async () => {
        scenario = { claims: { hd: 'partner.com', email: 'neel@partner.com' } };
        assert.equal(params((await connectGoogle(neel)).location).reason, 'domain_not_allowed');
    });

    it('id_token checks: nonce, audience, issuer, expiry, email_verified', async () => {
        for (const [claims, reason] of [
            [{ nonce: 'other' }, 'invalid'],
            [{ aud: 'someone-else' }, 'invalid'],
            [{ iss: 'https://evil.example.com' }, 'invalid'],
            [{ exp: nowSeconds - 600 }, 'invalid'],
            [{ email_verified: false }, 'domain_not_allowed'],
        ] as const) {
            scenario = { claims };
            assert.equal(params((await connectGoogle(asha)).location).reason, reason, JSON.stringify(claims));
        }
        assert.equal(state.connections.length, 0);
    });

    it('an unticked calendar box → scope_denied and the grant is revoked', async () => {
        scenario = { scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.owned' };
        const { location } = await connectGoogle(asha);
        assert.equal(params(location).reason, 'scope_denied');
        assert.ok(calls.some((c) => c.url === GOOGLE_REVOKE_URL));
    });

    it('an account address longer than Users.email allows → email_too_long', async () => {
        const long = `${'n'.repeat(110)}@nandiniinfosys.com`;
        scenario = { claims: { email: long } };
        assert.equal(params((await connectGoogle(neel)).location).reason, 'email_too_long');
        assert.equal(state.users.find((u) => u.id === neel.id)!.email, null);
    });

    it('an empty CRM email whose account address another active user holds → account_in_use', async () => {
        scenario = { claims: { email: 'ravi@nandiniinfosys.com' } };
        assert.equal(params((await connectGoogle(neel)).location).reason, 'account_in_use');
        assert.equal(state.users.find((u) => u.id === neel.id)!.email, null);
    });

    it('switching to another account of the same provider disconnects (and revokes) the old one', async () => {
        state.connections.push(
            blankConnection({ id: 'old', username: 'asha', provider: 'google', accountId: 'old-sub', accountEmail: 'asha@nandiniinfosys.com', clientVersion: 3 }, now),
        );
        scenario = { claims: { sub: 'new-sub', email: 'asha@nandiniinfosys.com' } };
        const { location } = await connectGoogle(asha);
        assert.equal(params(location).calendar, 'connected');
        const old = state.connections.find((c) => c.id === 'old')!;
        assert.equal(old.status, 'disconnected');
        assert.equal(old.statusReason, 'switched_account');
        const fresh = state.connections.find((c) => c.id !== 'old')!;
        assert.equal(fresh.status, 'active');
        assert.equal(fresh.accountId, 'new-sub');
        assert.deepEqual(state.audits.map((a) => a.action), ['DISCONNECT', 'CONNECT']);
    });

    it('a Google 400 on the code exchange → provider_error (no URL or body in the log line)', async () => {
        const failing = fakeFetch([route(GOOGLE_TOKEN_URL, () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Bad Request' } }))]);
        setAdapterForTests('google', createGoogleAdapter({ fetchImpl: failing.fetchImpl, now: () => now }));
        assert.equal(params((await connectGoogle(asha)).location).reason, 'provider_error');
    });
});

describe('Microsoft connect (replayed answers)', () => {
    let nonce = '';
    let scope: string | undefined;
    let calls: RecordedCall[] = [];
    const authority = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0`;

    beforeEach(() => {
        scope = undefined;
        state = installConnectionDouble({ users, providers: [providerRow('microsoft')] });
        const fake = fakeFetch([
            route(
                `${authority}/token`,
                () => ({
                    status: 200,
                    body: {
                        token_type: 'Bearer',
                        access_token: 'eyJ0eXAi.access',
                        expires_in: 4000,
                        ext_expires_in: 4000,
                        refresh_token: '0.AAAA.refresh',
                        ...(scope === undefined ? {} : { scope }),
                        id_token: idToken({
                            iss: `https://login.microsoftonline.com/${MS_TENANT}/v2.0`,
                            aud: MS_CLIENT,
                            tid: MS_TENANT,
                            oid: 'oid-123',
                            nonce,
                            exp: nowSeconds + 3600,
                        }),
                    },
                }),
                'POST',
            ),
            route(GRAPH_ME_URL, () => ({ status: 200, body: { mail: null, userPrincipalName: 'Asha@NandiniInfosys.com' } }), 'GET'),
        ]);
        calls = fake.calls;
        setAdapterForTests('microsoft', createMicrosoftAdapter({ fetchImpl: fake.fetchImpl, now: () => now }));
    });

    async function connectMicrosoft(user: UserRow) {
        const { authUrl, cookie } = await startConnect(authOf(user), 'microsoft', CRM, now);
        const url = new URL(authUrl);
        nonce = url.searchParams.get('nonce')!;
        const location = await completeConnect({ provider: 'microsoft', query: { state: url.searchParams.get('state')!, code: 'M.code' }, cookie, session: sessionOf(user), now });
        return { location, url };
    }

    it('uses the tenant authority, response_mode=query, PKCE, and reads the address from Graph /me (UPN fallback)', async () => {
        const { location, url } = await connectMicrosoft(asha);
        assert.equal(params(location).calendar, 'connected');
        assert.equal(`${url.origin}${url.pathname}`, `${authority}/authorize`);
        assert.equal(url.searchParams.get('response_mode'), 'query');
        assert.equal(url.searchParams.get('prompt'), 'select_account');
        assert.equal(url.searchParams.get('domain_hint'), 'nandiniinfosys.com');
        assert.equal(url.searchParams.get('scope'), 'openid email profile offline_access User.Read Calendars.ReadWrite');
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        const me = calls.find((c) => c.url === GRAPH_ME_URL)!;
        assert.equal(me.headers.authorization, 'Bearer eyJ0eXAi.access');
        const row = state.connections[0];
        assert.equal(row.accountEmail, 'asha@nandiniinfosys.com');
        assert.equal(row.accountId, 'oid-123');
        assert.equal(row.tenantId, MS_TENANT);
        // A missing `scope` field means the requested set was granted.
        assert.equal(row.grantedScopes, 'openid email profile offline_access User.Read Calendars.ReadWrite');
    });

    it('missing Calendars.ReadWrite → scope_denied; Microsoft has no revoke call, the tokens are just dropped', async () => {
        scope = 'https://graph.microsoft.com/User.Read openid profile email';
        const { location } = await connectMicrosoft(asha);
        assert.equal(params(location).reason, 'scope_denied');
        assert.equal(calls.filter((c) => !c.url.startsWith(`${authority}/token`) && c.url !== GRAPH_ME_URL).length, 0);
        assert.equal(state.connections.length, 0);
    });

    it('a token from another tenant → domain_not_allowed', async () => {
        state.providers.set('microsoft', providerRow('microsoft', { settingsJson: JSON.stringify({ tenantId: '99999999-bbbb-cccc-dddd-eeeeeeeeeeee' }) }));
        dropProviderCredentialsCache();
        const other = fakeFetch([
            route('https://login.microsoftonline.com/99999999-bbbb-cccc-dddd-eeeeeeeeeeee/oauth2/v2.0/token', () => ({
                status: 200,
                body: {
                    access_token: 'a',
                    refresh_token: 'r',
                    expires_in: 3600,
                    id_token: idToken({ iss: `https://login.microsoftonline.com/${MS_TENANT}/v2.0`, aud: MS_CLIENT, tid: MS_TENANT, oid: 'o', nonce, exp: nowSeconds + 3600 }),
                },
            })),
        ]);
        setAdapterForTests('microsoft', createMicrosoftAdapter({ fetchImpl: other.fetchImpl, now: () => now }));
        assert.equal(params((await connectMicrosoft(asha)).location).reason, 'domain_not_allowed');
    });
});
