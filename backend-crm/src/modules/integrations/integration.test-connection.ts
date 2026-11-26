import { GOOGLE_TOKEN_URL, microsoftAuthorityUrl, type IntegrationProviderKey } from './integration.constants.js';

/**
 * "Test connection" on Admin › API Integrations: checks a provider's stored client id + secret without a user
 * (Calendar Phase 2 spec §6.4). Nothing here is logged; the message never contains the secret or a token, only a
 * fixed sentence plus the provider's own `error` / `error_description`, trimmed to 300 characters in all
 * (`IntegrationProvider.lastTestMessage`). The probes' readings of provider answers are documented, not yet seen
 * live (spec §21.2 #8): the provider's text is always shown so an admin can tell.
 */

export type TestCode =
    | 'credentials_ok'
    | 'invalid_client'
    | 'redirect_uri_mismatch'
    | 'secret_expired'
    | 'app_not_in_tenant'
    | 'tenant_not_found'
    | 'not_configured'
    | 'not_available'
    | 'network'
    | 'provider_error';

export interface TestResult {
    ok: boolean;
    code: TestCode;
    message: string;
}

export interface ProbeCredentials {
    clientId: string;
    clientSecret: string;
    /** Google: the redirect URI the CRM registers (checked by Google against the client's list). */
    redirectUri: string | null;
    /** Microsoft: directory (tenant) id or domain. */
    tenantId?: string | null;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
    status: number;
    text(): Promise<string>;
}>;

export const TEST_TIMEOUT_MS = 15_000;
export const TEST_MESSAGE_MAX = 300;
/** A code no user was ever given: Google answers invalid_grant once the client itself is accepted. */
export const GOOGLE_TEST_CODE = 'crm-connection-test';

const clip = (text: string, max = TEST_MESSAGE_MAX) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The fixed sentence, then the provider's own words in brackets, within 300 characters. */
export function testMessage(sentence: string, providerText?: string): string {
    const detail = (providerText ?? '').replace(/\s+/g, ' ').trim();
    if (!detail) return clip(sentence);
    const room = TEST_MESSAGE_MAX - sentence.length - 3;
    return room > 20 ? `${sentence} (${clip(detail, room)})` : clip(sentence);
}

interface OAuthErrorBody {
    error?: unknown;
    error_description?: unknown;
    error_codes?: unknown;
    access_token?: unknown;
}

function parseBody(text: string): OAuthErrorBody {
    try {
        const value = JSON.parse(text) as unknown;
        return value && typeof value === 'object' ? (value as OAuthErrorBody) : {};
    } catch {
        return {};
    }
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');
/** The provider's words: `error: error_description`, never the raw body (it could echo our values). */
const providerWords = (body: OAuthErrorBody) => [str(body.error), str(body.error_description)].filter(Boolean).join(': ');

async function post(fetchImpl: FetchLike, url: string, form: Record<string, string>): Promise<{ status: number; body: OAuthErrorBody } | { network: true }> {
    try {
        const res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams(form).toString(),
            signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        });
        return { status: res.status, body: parseBody(await res.text()) };
    } catch {
        return { network: true };
    }
}

/** Google: exchange a dummy code. `invalid_grant` = the client id and secret were accepted (only the code is wrong). */
export async function probeGoogle(creds: ProbeCredentials, fetchImpl: FetchLike): Promise<TestResult> {
    const answer = await post(fetchImpl, GOOGLE_TOKEN_URL, {
        grant_type: 'authorization_code',
        code: GOOGLE_TEST_CODE,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: creds.redirectUri ?? '',
    });
    if ('network' in answer) return { ok: false, code: 'network', message: "The server can't reach Google (network or firewall). Try again in a minute." };
    const { status, body } = answer;
    const error = str(body.error);
    const words = providerWords(body);
    if (error === 'invalid_grant' || (status === 200 && body.access_token)) {
        return { ok: true, code: 'credentials_ok', message: testMessage('Google accepted the client ID and secret.', words) };
    }
    if (error === 'invalid_client' || error === 'unauthorized_client') {
        return { ok: false, code: 'invalid_client', message: testMessage('Client ID or secret is wrong.', words) };
    }
    if (error === 'redirect_uri_mismatch') {
        return { ok: false, code: 'redirect_uri_mismatch', message: testMessage(`Add this redirect URI in Google Cloud: ${creds.redirectUri ?? '(set PUBLIC_API_URL)'}`, words) };
    }
    return { ok: false, code: 'provider_error', message: testMessage(`Google answered with an error (HTTP ${status}).`, words) };
}

/** AADSTS codes the Microsoft probe recognises (in `error_codes` or the description text). */
const AADSTS_READINGS: [number, TestCode, string][] = [
    [7000215, 'invalid_client', 'Client secret is wrong (copy the secret Value, not its ID).'],
    [7000222, 'secret_expired', 'The client secret has expired: create a new one in Entra and paste it here.'],
    [700016, 'app_not_in_tenant', 'This client ID is not an app in that tenant: check the Application (client) ID and Tenant ID.'],
    [90002, 'tenant_not_found', 'Tenant not found: check the Directory (tenant) ID.'],
];

/**
 * Microsoft: a client-credentials token for Graph's `.default` scope. The app has no application permissions, so the
 * token can read nothing, but getting one proves id + secret + tenant. Admin consent for the delegated calendar
 * permissions can't be tested this way (the first employee's Connect does).
 */
export async function probeMicrosoft(creds: ProbeCredentials, fetchImpl: FetchLike): Promise<TestResult> {
    if (!creds.tenantId) return { ok: false, code: 'not_configured', message: 'Enter the Tenant ID and save first.' };
    const answer = await post(fetchImpl, `${microsoftAuthorityUrl(creds.tenantId)}/token`, {
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
    });
    if ('network' in answer) return { ok: false, code: 'network', message: "The server can't reach Microsoft (network or firewall). Try again in a minute." };
    const { status, body } = answer;
    if (status === 200 && body.access_token) return { ok: true, code: 'credentials_ok', message: 'Microsoft accepted the client ID, secret and tenant.' };
    const codes = new Set<number>(Array.isArray(body.error_codes) ? body.error_codes.filter((c): c is number => typeof c === 'number') : []);
    const description = str(body.error_description);
    for (const match of description.matchAll(/AADSTS(\d+)/g)) codes.add(Number(match[1]));
    // Only the first line of Entra's description (the rest is trace / correlation ids).
    const words = [str(body.error), description.split(/\r?\n/)[0]].filter(Boolean).join(': ');
    for (const [aadsts, code, sentence] of AADSTS_READINGS) {
        if (codes.has(aadsts)) return { ok: false, code, message: testMessage(sentence, words) };
    }
    if (str(body.error) === 'invalid_client') return { ok: false, code: 'invalid_client', message: testMessage('Client ID or secret is wrong.', words) };
    return { ok: false, code: 'provider_error', message: testMessage(`Microsoft answered with an error (HTTP ${status}).`, words) };
}

/** The probe of a provider. Zoom's check arrives with video meetings (Calendar Phase 3, P3-2). */
export async function probeProvider(provider: IntegrationProviderKey, creds: ProbeCredentials, fetchImpl: FetchLike): Promise<TestResult> {
    if (provider === 'google') return probeGoogle(creds, fetchImpl);
    if (provider === 'microsoft') return probeMicrosoft(creds, fetchImpl);
    return { ok: false, code: 'not_available', message: 'The Zoom check arrives with video meetings (Phase 3). The credentials are stored.' };
}
