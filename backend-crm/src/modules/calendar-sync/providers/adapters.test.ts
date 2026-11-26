import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL } from '../../integrations/integration.constants.js';
import { fakeFetch, route } from '../testing/fakeFetch.js';
import { createGoogleAdapter } from './google.js';
import { ProviderAuthError, ProviderClientError, ProviderTransientError } from './http.js';
import { createMicrosoftAdapter } from './microsoft.js';
import type { ProviderCredentials } from './types.js';

/** Refresh and revoke request shapes of the Google / Microsoft adapters (the connect flow is in oauth.test.ts). */

const now = new Date('2026-11-26T06:00:00.000Z');
const googleCreds: ProviderCredentials = { clientId: 'gid', clientSecret: 'gsecret', settings: { scopeProfile: 'narrow', pkce: true } };
const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const msCreds: ProviderCredentials = { clientId: 'msid', clientSecret: 'mssecret', settings: { tenantId: TENANT } };

describe('Google adapter', () => {
    it('refresh: refresh_token grant with the client credentials; no new refresh token keeps the stored one (none returned)', async () => {
        const { fetchImpl, calls } = fakeFetch([route(GOOGLE_TOKEN_URL, () => ({ status: 200, body: { access_token: 'ya29.new', expires_in: 3599, token_type: 'Bearer' } }), 'POST')]);
        const tokens = await createGoogleAdapter({ fetchImpl, now: () => now }).refresh({ creds: googleCreds, refreshToken: '1//rt' });
        assert.deepEqual(calls[0].form, { grant_type: 'refresh_token', refresh_token: '1//rt', client_id: 'gid', client_secret: 'gsecret' });
        assert.equal(tokens.accessToken, 'ya29.new');
        assert.equal(tokens.refreshToken, undefined);
        assert.equal(tokens.expiresAt.getTime(), now.getTime() + 3599 * 1000);
    });

    it('refresh: invalid_grant → ProviderAuthError; invalid_client → ProviderClientError', async () => {
        const grant = fakeFetch([route(GOOGLE_TOKEN_URL, () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }))]);
        await assert.rejects(createGoogleAdapter({ fetchImpl: grant.fetchImpl }).refresh({ creds: googleCreds, refreshToken: 'x' }), ProviderAuthError);
        const client = fakeFetch([route(GOOGLE_TOKEN_URL, () => ({ status: 401, body: { error: 'invalid_client' } }))]);
        await assert.rejects(createGoogleAdapter({ fetchImpl: client.fetchImpl }).refresh({ creds: googleCreds, refreshToken: 'x' }), ProviderClientError);
    });

    it('revoke: posts the token once; an already-revoked token (400 invalid_token) counts as done; a 5xx is reported', async () => {
        const ok = fakeFetch([route(GOOGLE_REVOKE_URL, () => ({ status: 200, body: {} }), 'POST')]);
        await createGoogleAdapter({ fetchImpl: ok.fetchImpl }).revoke({ creds: googleCreds, token: '1//rt' });
        assert.deepEqual(ok.calls[0].form, { token: '1//rt' });

        const gone = fakeFetch([route(GOOGLE_REVOKE_URL, () => ({ status: 400, body: { error: 'invalid_token', error_description: 'Token expired or revoked' } }))]);
        await createGoogleAdapter({ fetchImpl: gone.fetchImpl }).revoke({ creds: googleCreds, token: '1//rt' });

        const down = fakeFetch([route(GOOGLE_REVOKE_URL, () => ({ status: 503 }))]);
        await assert.rejects(createGoogleAdapter({ fetchImpl: down.fetchImpl }).revoke({ creds: googleCreds, token: '1//rt' }), ProviderTransientError);
        assert.equal(down.calls.length, 1, 'one attempt only (disconnect does not wait on retries)');
        assert.equal(createGoogleAdapter().canRevoke, true);
    });
});

describe('Microsoft adapter', () => {
    const tokenUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;

    it('refresh: tenant token endpoint, scopes re-sent, and the rotated refresh token is returned', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(tokenUrl, () => ({ status: 200, body: { access_token: 'eyJ.new', refresh_token: 'rt-2', expires_in: 4000, scope: 'Calendars.ReadWrite User.Read', token_type: 'Bearer' } }), 'POST'),
        ]);
        const tokens = await createMicrosoftAdapter({ fetchImpl, now: () => now }).refresh({ creds: msCreds, refreshToken: 'rt-1' });
        const form = calls[0].form!;
        assert.equal(calls[0].url, tokenUrl);
        assert.equal(form.grant_type, 'refresh_token');
        assert.equal(form.refresh_token, 'rt-1');
        assert.equal(form.client_id, 'msid');
        assert.match(form.scope, /offline_access/);
        assert.match(form.scope, /Calendars\.ReadWrite/);
        assert.equal(tokens.refreshToken, 'rt-2');
    });

    it('refresh: AADSTS700082 (refresh token expired) → ProviderAuthError', async () => {
        const { fetchImpl } = fakeFetch([route(tokenUrl, () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'AADSTS700082: The refresh token has expired due to inactivity.' } }))]);
        await assert.rejects(createMicrosoftAdapter({ fetchImpl }).refresh({ creds: msCreds, refreshToken: 'rt' }), (err: unknown) => err instanceof ProviderAuthError && err.code === 'AADSTS700082');
    });

    it('revoke is a no-op (no per-app revoke for delegated tokens) and canRevoke is false', async () => {
        const { fetchImpl, calls } = fakeFetch([]);
        const adapter = createMicrosoftAdapter({ fetchImpl });
        await adapter.revoke({ creds: msCreds, token: 'rt' });
        assert.equal(calls.length, 0);
        assert.equal(adapter.canRevoke, false);
    });
});
