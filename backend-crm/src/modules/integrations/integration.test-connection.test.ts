import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_TEST_CODE, probeGoogle, probeMicrosoft, probeProvider, testMessage, TEST_MESSAGE_MAX, type FetchLike } from './integration.test-connection.js';

/** Token-endpoint answers in their documented shapes (not recorded from the live providers). */
function fakeFetch(status: number, body: unknown, calls: { url: string; body: string; headers: Record<string, string> }[] = []): FetchLike {
    return async (url, init) => {
        calls.push({ url, body: init.body, headers: init.headers });
        return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
    };
}
const failingFetch: FetchLike = async () => {
    throw new TypeError('fetch failed');
};

const google = { clientId: 'abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-secret', redirectUri: 'http://localhost:8008/api/calendar-connections/oauth/google/callback' };
const microsoft = { clientId: 'app-id', clientSecret: 'ms-secret-value', redirectUri: null, tenantId: 'nandini.onmicrosoft.com' };

describe('Google probe', () => {
    it('sends a dummy-code exchange with the redirect URI and reads invalid_grant as accepted', async () => {
        const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
        const result = await probeGoogle(google, fakeFetch(400, { error: 'invalid_grant', error_description: 'Malformed auth code.' }, calls));
        assert.equal(result.ok, true);
        assert.equal(result.code, 'credentials_ok');
        assert.match(result.message, /Malformed auth code/);
        assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
        const form = new URLSearchParams(calls[0].body);
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(form.get('code'), GOOGLE_TEST_CODE);
        assert.equal(form.get('redirect_uri'), google.redirectUri);
    });
    it('reads invalid_client / unauthorized_client as a wrong id or secret', async () => {
        for (const error of ['invalid_client', 'unauthorized_client']) {
            const result = await probeGoogle(google, fakeFetch(401, { error, error_description: 'The OAuth client was not found.' }));
            assert.equal(result.ok, false);
            assert.equal(result.code, 'invalid_client');
            assert.match(result.message, /^Client ID or secret is wrong\. \(.*not found/);
        }
    });
    it('names the redirect URI to add on redirect_uri_mismatch', async () => {
        const result = await probeGoogle(google, fakeFetch(400, { error: 'redirect_uri_mismatch' }));
        assert.equal(result.code, 'redirect_uri_mismatch');
        assert.ok(result.message.includes(google.redirectUri));
    });
    it('reports the network, and any other answer with the provider text', async () => {
        assert.equal((await probeGoogle(google, failingFetch)).code, 'network');
        const other = await probeGoogle(google, fakeFetch(500, '<html>oops</html>'));
        assert.equal(other.code, 'provider_error');
        assert.match(other.message, /HTTP 500/);
    });
    it('never echoes the secret', async () => {
        const result = await probeGoogle(google, fakeFetch(401, { error: 'invalid_client' }));
        assert.ok(!result.message.includes(google.clientSecret));
    });
});

describe('Microsoft probe', () => {
    it('asks for a client-credentials token at the tenant and reads a token as accepted (never returning it)', async () => {
        const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
        const result = await probeMicrosoft(microsoft, fakeFetch(200, { token_type: 'Bearer', access_token: 'eyJ0eXAi.secret' }, calls));
        assert.equal(result.ok, true);
        assert.ok(!result.message.includes('eyJ0eXAi'));
        assert.equal(calls[0].url, 'https://login.microsoftonline.com/nandini.onmicrosoft.com/oauth2/v2.0/token');
        const form = new URLSearchParams(calls[0].body);
        assert.equal(form.get('grant_type'), 'client_credentials');
        assert.equal(form.get('scope'), 'https://graph.microsoft.com/.default');
    });
    it('maps the AADSTS codes', async () => {
        const cases: [number, string][] = [
            [7000215, 'invalid_client'],
            [7000222, 'secret_expired'],
            [700016, 'app_not_in_tenant'],
            [90002, 'tenant_not_found'],
        ];
        for (const [aadsts, code] of cases) {
            const body = { error: 'invalid_client', error_description: `AADSTS${aadsts}: something.\r\nTrace ID: 1\r\nCorrelation ID: 2`, error_codes: [aadsts] };
            const result = await probeMicrosoft(microsoft, fakeFetch(401, body));
            assert.equal(result.code, code, String(aadsts));
            assert.ok(!result.message.includes('Trace ID'));
        }
        const fromText = await probeMicrosoft(microsoft, fakeFetch(400, { error: 'invalid_request', error_description: 'AADSTS90002: Tenant not found.' }));
        assert.equal(fromText.code, 'tenant_not_found');
    });
    it('needs a tenant and handles the network', async () => {
        assert.equal((await probeMicrosoft({ ...microsoft, tenantId: null }, failingFetch)).code, 'not_configured');
        assert.equal((await probeMicrosoft(microsoft, failingFetch)).code, 'network');
    });
});

describe('probeProvider / testMessage', () => {
    it('has no Zoom probe before Phase 3', async () => {
        const result = await probeProvider('zoom', google, failingFetch);
        assert.equal(result.code, 'not_available');
    });
    it('keeps messages within 300 characters, provider text in brackets', () => {
        assert.equal(testMessage('Fine.'), 'Fine.');
        assert.equal(testMessage('Fine.', '  a\n b '), 'Fine. (a b)');
        const long = testMessage('Client ID or secret is wrong.', 'x'.repeat(1000));
        assert.ok(long.length <= TEST_MESSAGE_MAX);
        assert.ok(long.endsWith('…)'));
    });
});
