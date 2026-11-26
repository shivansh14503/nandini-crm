import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, it } from 'node:test';
import { GOOGLE_DWD_SCOPES, GOOGLE_TOKEN_URL, GRAPH_API, GRAPH_DEFAULT_SCOPE } from '../../integrations/integration.constants.js';
import { TokenError } from '../syncErrors.js';
import { fakeFetch, route } from '../testing/fakeFetch.js';
import { serviceAccountKeyJson, TEST_CLIENT_EMAIL, TEST_CLIENT_ID, TEST_PRIVATE_KEY_ID, testKeyPair } from '../testing/serviceAccountKey.js';
import { createGoogleAdapter } from './google.js';
import {
    buildAssertion,
    JWT_BACKDATE_SECONDS,
    JWT_BEARER_GRANT,
    JWT_LIFETIME_SECONDS,
    mintGoogleToken,
    parseServiceAccountKey,
    SERVICE_ACCOUNT_KEY_MAX_BYTES,
    ServiceAccountKeyError,
} from './googleServiceAccount.js';
import { ProviderAuthError, ProviderNotFoundError } from './http.js';
import { createMicrosoftAdapter } from './microsoft.js';
import { appTokenRoles, mintGraphToken } from './microsoftAppToken.js';

/** Google service-account JWTs (signed and verified with a locally generated RSA key), the Microsoft app token, probes. */

const now = new Date('2026-11-26T06:00:00.000Z');
const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

describe('parseServiceAccountKey', () => {
    it('reads a key file: lower-cased email, numeric client id, key id, project; ignores token_uri', () => {
        const key = parseServiceAccountKey(serviceAccountKeyJson({ client_email: TEST_CLIENT_EMAIL.toUpperCase() }));
        assert.equal(key.clientEmail, TEST_CLIENT_EMAIL);
        assert.equal(key.clientId, TEST_CLIENT_ID);
        assert.equal(key.privateKeyId, TEST_PRIVATE_KEY_ID);
        assert.equal(key.projectId, 'nandini-crm');
        assert.equal(key.privateKey.asymmetricKeyType, 'rsa');
        assert.ok(!('tokenUri' in key));
    });

    it('refuses anything that is not a service account key, with fixed sentences that never echo the file', () => {
        const cases: [string, RegExp][] = [
            ['', /Upload or paste/],
            ['not json', /not a JSON key file/],
            ['[]', /not a service account key file/],
            [serviceAccountKeyJson({ type: 'authorized_user' }), /type must be "service_account"/],
            [serviceAccountKeyJson({ client_email: 'someone@gmail.com' }), /client_email/],
            [serviceAccountKeyJson({ client_id: 'abc' }), /client_id/],
            [serviceAccountKeyJson({ private_key_id: undefined }), /private_key_id/],
            [serviceAccountKeyJson({ private_key: 'secret-looking-text' }), /no private key/],
            [serviceAccountKeyJson({ private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n' }), /can't be read/],
            [JSON.stringify({ padding: 'x'.repeat(SERVICE_ACCOUNT_KEY_MAX_BYTES) }), /too large/],
        ];
        for (const [text, message] of cases) {
            assert.throws(
                () => parseServiceAccountKey(text),
                (err: unknown) => err instanceof ServiceAccountKeyError && message.test(err.message) && !err.message.includes('secret-looking-text'),
                text.slice(0, 40),
            );
        }
        const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        assert.throws(() => parseServiceAccountKey(serviceAccountKeyJson({ private_key: ec })), /not an RSA key/);
    });
});

describe('Google JWT-bearer assertion', () => {
    const key = parseServiceAccountKey(serviceAccountKeyJson());

    it('header and claims follow Google’s server-to-server spec; the RS256 signature verifies with the public key', () => {
        const jwt = buildAssertion(key, 'asha@nandiniinfosys.com', GOOGLE_DWD_SCOPES, now);
        const [header, claims, signature] = jwt.split('.');
        assert.deepEqual(decode(header), { alg: 'RS256', typ: 'JWT', kid: TEST_PRIVATE_KEY_ID });
        const iat = Math.floor(now.getTime() / 1000) - JWT_BACKDATE_SECONDS;
        assert.deepEqual(decode(claims), {
            iss: TEST_CLIENT_EMAIL,
            sub: 'asha@nandiniinfosys.com',
            scope: GOOGLE_DWD_SCOPES.join(' '),
            aud: GOOGLE_TOKEN_URL,
            iat,
            exp: iat + JWT_LIFETIME_SECONDS,
        });
        assert.ok(JWT_LIFETIME_SECONDS + JWT_BACKDATE_SECONDS <= 3600, 'Google refuses exp more than an hour after iat');
        assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), testKeyPair().publicKey, Buffer.from(signature, 'base64url')));
        // A changed claim no longer verifies.
        const forged = Buffer.from(JSON.stringify({ ...decode(claims), sub: 'ceo@nandiniinfosys.com' })).toString('base64url');
        assert.ok(!verify('RSA-SHA256', Buffer.from(`${header}.${forged}`), testKeyPair().publicKey, Buffer.from(signature, 'base64url')));
    });

    it('no subject (the key check): no sub claim', () => {
        const claims = decode(buildAssertion(key, null, ['https://www.googleapis.com/auth/calendar.events.owned'], now).split('.')[1]);
        assert.equal('sub' in claims, false);
        assert.equal(claims.scope, 'https://www.googleapis.com/auth/calendar.events.owned');
    });

    it('mint: one form POST to the constant token URL (never the file’s token_uri); expiry from expires_in', async () => {
        const { fetchImpl, calls } = fakeFetch([route(GOOGLE_TOKEN_URL, () => ({ status: 200, body: { access_token: 'ya29.x', expires_in: 3599, token_type: 'Bearer' } }), 'POST')]);
        const grant = await mintGoogleToken(key, 'asha@nandiniinfosys.com', GOOGLE_DWD_SCOPES, fetchImpl, now);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, GOOGLE_TOKEN_URL);
        assert.equal(calls[0].form?.grant_type, JWT_BEARER_GRANT);
        assert.equal(decode(calls[0].form!.assertion.split('.')[1]).sub, 'asha@nandiniinfosys.com');
        assert.deepEqual(Object.keys(calls[0].form!).sort(), ['assertion', 'grant_type']);
        assert.equal(grant.accessToken, 'ya29.x');
        assert.equal(grant.expiresAt.getTime(), now.getTime() + 3599 * 1000);
    });

    it('mint failures become TokenError with a level and a code, and the message carries neither email nor body', async () => {
        const answer = (status: number, body: unknown) => fakeFetch([route(GOOGLE_TOKEN_URL, () => ({ status, body }))]).fetchImpl;
        const cases: [number, unknown, string, string][] = [
            [401, { error: 'unauthorized_client', error_description: 'Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.' }, 'app', 'delegation_wrong_id'],
            [401, { error: 'unauthorized_client', error_description: 'Client is unauthorized.' }, 'app', 'delegation_missing'],
            [400, { error: 'invalid_grant', error_description: 'Invalid email or User ID' }, 'user', 'user_not_found'],
            [400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, 'app', 'key_invalid'],
            [503, null, 'transient', 'provider_unavailable'],
        ];
        for (const [status, body, level, code] of cases) {
            await assert.rejects(mintGoogleToken(key, 'asha@nandiniinfosys.com', GOOGLE_DWD_SCOPES, answer(status, body), now), (err: unknown) => {
                assert.ok(err instanceof TokenError);
                assert.equal(err.level, level);
                assert.equal(err.code, code);
                assert.ok(!err.message.includes('asha'));
                return true;
            });
        }
        const network = fakeFetch([route(GOOGLE_TOKEN_URL, () => new TypeError('fetch failed'))]).fetchImpl;
        await assert.rejects(mintGoogleToken(key, null, GOOGLE_DWD_SCOPES, network, now), (err: unknown) => err instanceof TokenError && err.code === 'network');
        // A 200 without a token can't be used: transient.
        await assert.rejects(mintGoogleToken(key, null, GOOGLE_DWD_SCOPES, answer(200, { token_type: 'Bearer' }), now), (err: unknown) => err instanceof TokenError && err.level === 'transient');
    });
});

describe('Microsoft app token', () => {
    const creds = { clientId: 'msid', clientSecret: 'mssecret', tenantId: TENANT };
    const tokenUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;

    it('client-credentials grant for graph .default at the tenant endpoint', async () => {
        const { fetchImpl, calls } = fakeFetch([route(tokenUrl, () => ({ status: 200, body: { access_token: 'eyJ.x.y', expires_in: 3599, token_type: 'Bearer' } }), 'POST')]);
        const grant = await mintGraphToken(creds, fetchImpl, now);
        assert.deepEqual(calls[0].form, { client_id: 'msid', client_secret: 'mssecret', scope: GRAPH_DEFAULT_SCOPE, grant_type: 'client_credentials' });
        assert.equal(grant.expiresAt.getTime(), now.getTime() + 3599 * 1000);
    });

    it('AADSTS answers are app-level codes; the secret never appears in the error', async () => {
        const cases: [unknown, string][] = [
            [{ error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.', error_codes: [7000215] }, 'invalid_client'],
            [{ error: 'invalid_client', error_description: 'AADSTS7000222: The provided client secret keys are expired.' }, 'secret_expired'],
            [{ error: 'unauthorized_client', error_description: 'AADSTS700016: Application not found in the directory.' }, 'app_not_in_tenant'],
            [{ error: 'invalid_request', error_description: 'AADSTS90002: Tenant not found.' }, 'tenant_not_found'],
        ];
        for (const [body, code] of cases) {
            const { fetchImpl } = fakeFetch([route(tokenUrl, () => ({ status: 400, body }))]);
            await assert.rejects(mintGraphToken(creds, fetchImpl, now), (err: unknown) => err instanceof TokenError && err.level === 'app' && err.code === code && !err.message.includes('mssecret'));
        }
    });

    it('appTokenRoles reads the roles claim; empty when absent or unreadable', () => {
        const token = (claims: unknown) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
        assert.deepEqual(appTokenRoles(token({ roles: ['Calendars.ReadWrite', 7] })), ['Calendars.ReadWrite']);
        assert.deepEqual(appTokenRoles(token({ aud: 'x' })), []);
        assert.deepEqual(appTokenRoles('opaque'), []);
        assert.deepEqual(appTokenRoles('a.!!!.b'), []);
    });
});

describe('probeCalendar', () => {
    const ctx = { accessToken: 'tok', calendarId: 'primary', accountEmail: 'asha@nandiniinfosys.com', mailbox: 'asha@nandiniinfosys.com' };

    it('Google: one event of the impersonated user’s primary calendar, bearer token', async () => {
        const { fetchImpl, calls } = fakeFetch([route('https://www.googleapis.com/calendar/v3/calendars/primary/events?', () => ({ status: 200, body: { items: [] } }), 'GET')]);
        await createGoogleAdapter({ fetchImpl }).probeCalendar(ctx);
        const url = new URL(calls[0].url);
        assert.equal(url.searchParams.get('maxResults'), '1');
        assert.equal(url.searchParams.get('fields'), 'items(id)');
        assert.equal(calls[0].headers.authorization, 'Bearer tok');
    });

    it('Microsoft: /users/{mailbox}/events (never /me); 401 → ProviderAuthError, 404 → not found', async () => {
        const ok = fakeFetch([route(`${GRAPH_API}/users/asha%40nandiniinfosys.com/events?`, () => ({ status: 200, body: { value: [] } }), 'GET')]);
        await createMicrosoftAdapter({ fetchImpl: ok.fetchImpl }).probeCalendar({ ...ctx, calendarId: '' });
        assert.ok(ok.calls[0].url.includes('$top=1'));
        const denied = fakeFetch([route(GRAPH_API, () => ({ status: 401, body: { error: { code: 'InvalidAuthenticationToken', message: 'expired' } } }))]);
        await assert.rejects(createMicrosoftAdapter({ fetchImpl: denied.fetchImpl }).probeCalendar(ctx), ProviderAuthError);
        const missing = fakeFetch([route(GRAPH_API, () => ({ status: 404, body: { error: { code: 'ErrorInvalidUser', message: 'no such mailbox' } } }))]);
        await assert.rejects(createMicrosoftAdapter({ fetchImpl: missing.fetchImpl }).probeCalendar(ctx), ProviderNotFoundError);
    });
});
