import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseServiceAccountKey } from '../calendar-sync/providers/googleServiceAccount.js';
import { resetProviderPauses } from '../calendar-sync/providers/http.js';
import { fakeFetch, route, type Answer, type RecordedCall } from '../calendar-sync/testing/fakeFetch.js';
import { serviceAccountKeyJson } from '../calendar-sync/testing/serviceAccountKey.js';
import { GOOGLE_CALENDAR_API, GOOGLE_DWD_SCOPES, GOOGLE_KEY_CHECK_SCOPE, GOOGLE_TOKEN_URL, GRAPH_API } from './integration.constants.js';
import { combineSteps, notAvailable, notConfigured, testGoogle, testMessage, TEST_MESSAGE_MAX, testMicrosoft } from './integration.test-connection.js';

/** Test connection (addendum §4.3): the app step, then the optional test-as-user step, against documented answer shapes. */

const now = new Date('2026-11-26T06:00:00.000Z');
const key = parseServiceAccountKey(serviceAccountKeyJson());
const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const MS_TOKEN = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const creds = { clientId: 'msid', clientSecret: 'ms-secret-value', tenantId: TENANT };
const asha = { username: 'asha', email: 'Asha@NandiniInfosys.com' };

const claimsOf = (call: RecordedCall) => JSON.parse(Buffer.from(call.form!.assertion.split('.')[1], 'base64url').toString()) as { sub?: string; scope: string };
const appToken = (roles?: string[]) => `h.${Buffer.from(JSON.stringify(roles ? { roles } : { aud: 'graph' })).toString('base64url')}.s`;

describe('Google', () => {
    it('key check only: one token call as the service account itself (no sub) for calendar.events.owned', async () => {
        const { fetchImpl, calls } = fakeFetch([route(GOOGLE_TOKEN_URL, () => ({ status: 200, body: { access_token: 'ya29.sa', expires_in: 3600 } }))]);
        const result = await testGoogle(key, null, fetchImpl, now);
        assert.deepEqual(result, { ok: true, code: 'key_ok', message: 'Google accepted the service account key.', steps: [{ step: 'app', ok: true, code: 'key_ok', message: 'Google accepted the service account key.' }] });
        assert.equal(calls.length, 1);
        assert.equal(claimsOf(calls[0]).sub, undefined);
        assert.equal(claimsOf(calls[0]).scope, GOOGLE_KEY_CHECK_SCOPE);
    });

    it('as a user: mints with sub = their email and both scopes, then reads their primary calendar', async () => {
        resetProviderPauses();
        const { fetchImpl, calls } = fakeFetch([
            route(GOOGLE_TOKEN_URL, () => ({ status: 200, body: { access_token: 'ya29.x', expires_in: 3600 } })),
            route(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, () => ({ status: 200, body: { items: [] } })),
        ]);
        const result = await testGoogle(key, asha, fetchImpl, now);
        assert.equal(result.ok, true);
        assert.equal(result.code, 'delegation_ok');
        assert.match(result.message, /asha@nandiniinfosys\.com/);
        assert.deepEqual(result.steps.map((s) => s.code), ['key_ok', 'delegation_ok']);
        assert.equal(claimsOf(calls[1]).sub, 'asha@nandiniinfosys.com');
        assert.equal(claimsOf(calls[1]).scope, GOOGLE_DWD_SCOPES.join(' '));
        assert.equal(calls[2].headers.authorization, 'Bearer ya29.x');
    });

    it('delegation missing → user step fails with the admin sentence; the key step still passed', async () => {
        const { fetchImpl } = fakeFetch([
            route(GOOGLE_TOKEN_URL, (call): Answer =>
                claimsOf(call).sub ? { status: 401, body: { error: 'unauthorized_client', error_description: 'Client is unauthorized to retrieve access tokens.' } } : { status: 200, body: { access_token: 'sa', expires_in: 3600 } },
            ),
        ]);
        const result = await testGoogle(key, asha, fetchImpl, now);
        assert.equal(result.ok, false);
        assert.equal(result.code, 'delegation_missing');
        assert.match(result.message, /Domain-wide delegation isn't set up/);
        assert.deepEqual(result.steps.map((s) => [s.step, s.ok]), [['app', true], ['user', false]]);
    });

    it('a deleted key fails the app step and skips the user step', async () => {
        const { fetchImpl, calls } = fakeFetch([route(GOOGLE_TOKEN_URL, () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' } }))]);
        const result = await testGoogle(key, asha, fetchImpl, now);
        assert.equal(result.code, 'key_invalid');
        assert.equal(result.steps.length, 1);
        assert.equal(calls.length, 1);
    });

    it('calendar off for the person (403 on the probe) → calendar_unavailable; no company email → no_email', async () => {
        resetProviderPauses();
        const { fetchImpl } = fakeFetch([
            route(GOOGLE_TOKEN_URL, () => ({ status: 200, body: { access_token: 'x', expires_in: 3600 } })),
            route(GOOGLE_CALENDAR_API, () => ({ status: 403, body: { error: { code: 403, message: 'Calendar disabled', errors: [{ reason: 'forbidden' }] } } })),
        ]);
        assert.equal((await testGoogle(key, asha, fetchImpl, now)).code, 'calendar_unavailable');
        const none = await testGoogle(key, { username: 'ravi', email: null }, fetchImpl, now);
        assert.equal(none.code, 'no_email');
        assert.match(none.message, /^ravi has no company email/);
    });
});

describe('Microsoft', () => {
    it('reports the Entra grants of the app token, and warns when Calendars.ReadWrite is not among them', async () => {
        const granted = fakeFetch([route(MS_TOKEN, () => ({ status: 200, body: { access_token: appToken(['Calendars.ReadWrite']), expires_in: 3600 } }))]);
        const ok = await testMicrosoft(creds, null, granted.fetchImpl, now);
        assert.equal(ok.code, 'credentials_ok');
        assert.equal(ok.message, 'Microsoft accepted the client ID, secret and tenant. (Entra grants: Calendars.ReadWrite)');
        assert.deepEqual(granted.calls[0].form?.grant_type, 'client_credentials');

        const other = fakeFetch([route(MS_TOKEN, () => ({ status: 200, body: { access_token: appToken(['User.Read.All']), expires_in: 3600 } }))]);
        assert.match((await testMicrosoft(creds, null, other.fetchImpl, now)).message, /Calendars\.ReadWrite is not among them\. \(Entra grants: User\.Read\.All\)/);

        const rbac = fakeFetch([route(MS_TOKEN, () => ({ status: 200, body: { access_token: appToken(), expires_in: 3600 } }))]);
        assert.match((await testMicrosoft(creds, null, rbac.fetchImpl, now)).message, /Entra grants: none \(expected if you scoped the app with RBAC for Applications\)/);
    });

    it('a wrong secret fails the app step; the secret never appears in the result', async () => {
        const { fetchImpl } = fakeFetch([route(MS_TOKEN, () => ({ status: 401, body: { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' } }))]);
        const result = await testMicrosoft(creds, asha, fetchImpl, now);
        assert.equal(result.code, 'invalid_client');
        assert.equal(result.steps.length, 1);
        assert.ok(!JSON.stringify(result).includes('ms-secret-value'));
    });

    it('as a user: reads /users/{mailbox}/events; out of scope → the Test-ServicePrincipalAuthorization hint', async () => {
        resetProviderPauses();
        const ok = fakeFetch([route(MS_TOKEN, () => ({ status: 200, body: { access_token: appToken(['Calendars.ReadWrite']), expires_in: 3600 } })), route(GRAPH_API, () => ({ status: 200, body: { value: [] } }))]);
        const passed = await testMicrosoft(creds, asha, ok.fetchImpl, now);
        assert.equal(passed.code, 'mailbox_ok');
        assert.ok(ok.calls[1].url.startsWith(`${GRAPH_API}/users/asha%40nandiniinfosys.com/events`));

        const denied = fakeFetch([
            route(MS_TOKEN, () => ({ status: 200, body: { access_token: appToken(), expires_in: 3600 } })),
            route(GRAPH_API, () => ({ status: 403, body: { error: { code: 'ErrorAccessDenied', message: 'Access is denied. Check credentials and try again.' } } })),
        ]);
        const failed = await testMicrosoft(creds, asha, denied.fetchImpl, now);
        assert.equal(failed.code, 'mailbox_out_of_scope');
        assert.match(failed.message, /Test-ServicePrincipalAuthorization/);
        assert.ok(failed.message.length <= TEST_MESSAGE_MAX);
    });
});

describe('helpers', () => {
    it('testMessage keeps the sentence and clips the detail within 300', () => {
        assert.equal(testMessage('Fixed.'), 'Fixed.');
        assert.equal(testMessage('Fixed.', '  a \n b '), 'Fixed. (a b)');
        const long = testMessage('Fixed.', 'x'.repeat(500));
        assert.equal(long.length, TEST_MESSAGE_MAX);
        assert.ok(long.endsWith('…)'));
    });

    it('combineSteps: the first failing step leads; notAvailable / notConfigured are single failed app steps', () => {
        const steps = [
            { step: 'app' as const, ok: true, code: 'key_ok', message: 'a' },
            { step: 'user' as const, ok: false, code: 'user_not_found', message: 'b' },
        ];
        assert.deepEqual(combineSteps(steps), { ok: false, code: 'user_not_found', message: 'b', steps });
        assert.equal(notAvailable('zoom').code, 'not_available');
        assert.match(notAvailable('zoom').message, /Phase 3/);
        assert.deepEqual(notConfigured('Upload a key first.').steps, [{ step: 'app', ok: false, code: 'not_configured', message: 'Upload a key first.' }]);
    });
});
