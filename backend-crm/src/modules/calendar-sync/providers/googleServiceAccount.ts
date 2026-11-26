import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { GOOGLE_TOKEN_URL } from '../../integrations/integration.constants.js';
import { classifyGoogleTokenError, TokenError } from '../syncErrors.js';
import type { AccessGrant, FetchImpl } from './types.js';

/**
 * Google Workspace: a service account with domain-wide delegation (addendum AC1). The CRM signs a JWT with the service
 * account's private key (RS256, node:crypto, no SDK: spec D1) and exchanges it at Google's token endpoint for an access
 * token that acts as one employee (`sub` = their company email). Pure apart from `fetch`.
 *
 *   header  { alg: 'RS256', typ: 'JWT', kid: private_key_id }
 *   claims  { iss: client_email, sub?: employee email, scope: space-separated, aud: GOOGLE_TOKEN_URL,
 *             iat: now − 30 s, exp: iat + 3,000 s }    (Google rejects exp more than 1 h after iat)
 *   POST    GOOGLE_TOKEN_URL  grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer & assertion=<jwt>
 *
 * The key file's own `token_uri` is ignored: the token URL is a constant, so an uploaded file can't point the server
 * elsewhere. Neither the key, the assertion nor the token is ever logged.
 */

export const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
/** Back-dating of `iat` and the assertion's lifetime: absorbs clock skew ("Invalid JWT timeframe"). */
export const JWT_BACKDATE_SECONDS = 30;
export const JWT_LIFETIME_SECONDS = 3000;
export const TOKEN_CALL_TIMEOUT_MS = 15_000;
/** Largest key file accepted (a real one is ~2.3 KB). */
export const SERVICE_ACCOUNT_KEY_MAX_BYTES = 10 * 1024;

export interface ServiceAccountKey {
    clientEmail: string;
    /** Numeric OAuth 2 client id: what the admin authorises in the Admin console. */
    clientId: string;
    privateKeyId: string;
    projectId: string | null;
    privateKey: KeyObject;
}

/** Why an uploaded key file is refused (fixed sentences; never echoes the file). */
export class ServiceAccountKeyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ServiceAccountKeyError';
        Object.setPrototypeOf(this, ServiceAccountKeyError.prototype);
    }
}

const CLIENT_EMAIL = /^[^@\s]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
const CLIENT_ID = /^\d{10,30}$/;
const PRIVATE_KEY_ID = /^[0-9a-f]{20,64}$/;

/**
 * Reads and checks a service account key file (the JSON Google downloads). Throws ServiceAccountKeyError with a fixed
 * sentence. Pure apart from `crypto.createPrivateKey`.
 */
export function parseServiceAccountKey(text: string): ServiceAccountKey {
    if (typeof text !== 'string' || !text.trim()) throw new ServiceAccountKeyError('Upload or paste the service account key (.json).');
    if (Buffer.byteLength(text, 'utf8') > SERVICE_ACCOUNT_KEY_MAX_BYTES) throw new ServiceAccountKeyError('That file is too large to be a service account key.');
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        throw new ServiceAccountKeyError('That is not a JSON key file. Download a JSON key for the service account and upload it.');
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new ServiceAccountKeyError('That is not a service account key file.');
    const key = json as Record<string, unknown>;
    if (key.type !== 'service_account') throw new ServiceAccountKeyError('That is not a service account key file (type must be "service_account").');
    const clientEmail = typeof key.client_email === 'string' ? key.client_email.trim().toLowerCase() : '';
    if (!CLIENT_EMAIL.test(clientEmail)) throw new ServiceAccountKeyError('The key file has no valid client_email (…@<project>.iam.gserviceaccount.com).');
    const clientId = typeof key.client_id === 'string' ? key.client_id.trim() : '';
    if (!CLIENT_ID.test(clientId)) throw new ServiceAccountKeyError('The key file has no valid numeric client_id.');
    const privateKeyId = typeof key.private_key_id === 'string' ? key.private_key_id.trim().toLowerCase() : '';
    if (!PRIVATE_KEY_ID.test(privateKeyId)) throw new ServiceAccountKeyError('The key file has no valid private_key_id.');
    const pem = typeof key.private_key === 'string' ? key.private_key : '';
    if (!pem.trimStart().startsWith('-----BEGIN PRIVATE KEY-----')) throw new ServiceAccountKeyError('The key file has no private key.');
    let privateKey: KeyObject;
    try {
        privateKey = createPrivateKey({ key: pem, format: 'pem' });
    } catch {
        throw new ServiceAccountKeyError("The key file's private key can't be read.");
    }
    if (privateKey.asymmetricKeyType !== 'rsa') throw new ServiceAccountKeyError("The key file's private key is not an RSA key.");
    const projectId = typeof key.project_id === 'string' && key.project_id.trim() ? key.project_id.trim().slice(0, 100) : null;
    return { clientEmail, clientId, privateKeyId, projectId, privateKey };
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export interface AssertionClaims {
    iss: string;
    sub?: string;
    scope: string;
    aud: string;
    iat: number;
    exp: number;
}

/** The signed JWT-bearer assertion (RS256 over `base64url(header).base64url(claims)`). Pure. */
export function buildAssertion(key: Pick<ServiceAccountKey, 'clientEmail' | 'privateKeyId' | 'privateKey'>, subject: string | null, scopes: readonly string[], now: Date): string {
    const iat = Math.floor(now.getTime() / 1000) - JWT_BACKDATE_SECONDS;
    const claims: AssertionClaims = {
        iss: key.clientEmail,
        ...(subject ? { sub: subject } : {}),
        scope: scopes.join(' '),
        aud: GOOGLE_TOKEN_URL,
        iat,
        exp: iat + JWT_LIFETIME_SECONDS,
    };
    const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.privateKeyId }))}.${b64url(JSON.stringify(claims))}`;
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), key.privateKey);
    return `${signingInput}.${b64url(signature)}`;
}

/** One POST to a token endpoint without retries (the token source decides): status 0 = network / timeout. */
export async function postTokenForm(
    fetchImpl: FetchImpl,
    url: string,
    form: Record<string, string>,
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
    try {
        const res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams(form).toString(),
            signal: AbortSignal.timeout(TOKEN_CALL_TIMEOUT_MS),
            redirect: 'manual',
        });
        const text = await res.text().catch(() => '');
        let body: unknown = null;
        try {
            body = text ? (JSON.parse(text) as unknown) : null;
        } catch {
            body = null;
        }
        return { status: res.status, body, timedOut: false };
    } catch (err) {
        const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        return { status: 0, body: null, timedOut };
    }
}

/** `{ access_token, expires_in }` of a 200 answer, or null when the answer can't be read. */
export function readGrant(body: unknown, now: Date): AccessGrant | null {
    if (!body || typeof body !== 'object') return null;
    const record = body as Record<string, unknown>;
    if (typeof record.access_token !== 'string' || !record.access_token) return null;
    const expiresIn = Number(record.expires_in);
    const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
    return { accessToken: record.access_token, expiresAt: new Date(now.getTime() + seconds * 1000) };
}

/**
 * Mints an access token as `subject` (null = the service account itself, used by the app-level test step). Throws
 * TokenError (classified per addendum §2.3).
 */
export async function mintGoogleToken(
    key: ServiceAccountKey,
    subject: string | null,
    scopes: readonly string[],
    fetchImpl: FetchImpl,
    now: Date = new Date(),
): Promise<AccessGrant> {
    const assertion = buildAssertion(key, subject, scopes, now);
    const answer = await postTokenForm(fetchImpl, GOOGLE_TOKEN_URL, { grant_type: JWT_BEARER_GRANT, assertion });
    if (answer.status === 200) {
        const grant = readGrant(answer.body, now);
        if (grant) return grant;
        throw new TokenError('google', { level: 'transient', code: 'provider_unavailable' });
    }
    throw new TokenError('google', classifyGoogleTokenError(answer.status, answer.body, { timedOut: answer.timedOut }));
}
