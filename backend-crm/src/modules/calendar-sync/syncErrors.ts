import type { AppErrorCode, TransientErrorCode, UserErrorCode } from './connection.constants.js';
import { ProviderAuthError, ProviderBadRequestError, ProviderError, ProviderRateLimitedError, ProviderTransientError } from './providers/http.js';
import type { SyncProvider } from './providers/types.js';

/**
 * Error classification for admin-managed calendar sync (addendum AC8, §2.3). Pure. Every failure is one of:
 *   - user-level: one person (their row goes to `error`, retries back off 15 min → 24 h; shown on the People table);
 *   - app-level: the whole provider (provider health goes to `error`, admins are notified; shown on the provider card);
 *   - transient: 429, 5xx, network, timeout (retried with backoff, nothing marked).
 * The admin sentences are fixed; the provider's own words (≤ 300) are kept separately for admins only and are never
 * logged at info level.
 */

export type TokenErrorLevel = 'user' | 'app' | 'transient';
export type TokenErrorCode = UserErrorCode | AppErrorCode | TransientErrorCode;

export interface SyncFailure {
    level: TokenErrorLevel;
    code: TokenErrorCode;
    /** The provider's own error text, trimmed to 300 (admin display only). */
    providerText?: string;
}

/** A token could not be minted. The message holds the provider and a fixed code only (no email, no body). */
export class TokenError extends Error {
    readonly provider: SyncProvider;
    readonly level: TokenErrorLevel;
    readonly code: TokenErrorCode;
    readonly providerText?: string;

    constructor(provider: SyncProvider, failure: SyncFailure) {
        super(`${provider} token failed: ${failure.code}`);
        this.name = 'TokenError';
        this.provider = provider;
        this.level = failure.level;
        this.code = failure.code;
        if (failure.providerText) this.providerText = failure.providerText.slice(0, PROVIDER_TEXT_MAX);
        Object.setPrototypeOf(this, TokenError.prototype);
    }
}

export const PROVIDER_TEXT_MAX = 300;

const clip = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, PROVIDER_TEXT_MAX);

/** The sentence an admin sees for each code (People row, provider card, notification). */
export const ADMIN_ERROR_MESSAGES: Readonly<Record<TokenErrorCode, string>> = {
    // user-level
    user_not_found: 'Google has no account for this email.',
    user_unavailable: 'Google refused this person (suspended or not in the Workspace).',
    calendar_unavailable: 'This person has no Google Calendar (Calendar may be off for their organisational unit).',
    mailbox_out_of_scope:
        "The Microsoft app can't reach this mailbox. Add the person to the app's scope (RBAC for Applications) or grant Calendars.ReadWrite.",
    no_mailbox: 'No Exchange Online mailbox for this email (no licence, or on-premises).',
    // app-level
    delegation_missing:
        "Domain-wide delegation isn't set up for this client ID (Admin console › Security › Access and data control › API controls). It can take up to 24 h after you add it.",
    delegation_wrong_id: "Delegation was added with the service account's email or a group. Use the numeric Client ID.",
    scopes_not_authorised: 'The Admin console entry is missing one of the two calendar scopes.',
    admin_policy: 'A Workspace policy blocks these scopes.',
    key_invalid: 'Google rejected the service account key (deleted, disabled or wrong). Upload a new key.',
    clock_skew: 'The server clock is off. Fix the time on the server.',
    invalid_client: 'Client secret is wrong (copy the secret Value, not its ID).',
    secret_expired: 'The client secret has expired: create a new one in Entra and paste it here.',
    app_not_in_tenant: 'This client ID is not an app in that tenant: check the Application (client) ID and Tenant ID.',
    tenant_not_found: 'Tenant not found: check the Directory (tenant) ID.',
    no_application_permission:
        "The Microsoft app has no calendar permission: grant Calendars.ReadWrite (application) with admin consent, or add an RBAC for Applications role assignment.",
    not_configured: 'The provider is not set up: save its credentials first.',
    provider_error: 'The provider answered with an unexpected error.',
    // transient
    rate_limited: 'The provider asked the CRM to slow down. It retries automatically.',
    provider_unavailable: 'The provider is not answering right now. The CRM retries automatically.',
    network: "The server can't reach the provider (network or firewall). The CRM retries automatically.",
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** `error: error_description` (first line only), never the raw body (it could echo our values). */
export function providerWordsOf(body: unknown): string {
    if (!body || typeof body !== 'object') return '';
    const record = body as Record<string, unknown>;
    return clip([str(record.error), str(record.error_description).split(/\r?\n/)[0]].filter(Boolean).join(': '));
}

/** Transient answers shared by both token endpoints (status 0 = network / timeout). */
function transientOf(status: number, timedOut = false): SyncFailure | null {
    if (status === 0) return { level: 'transient', code: timedOut ? 'provider_unavailable' : 'network' };
    if (status === 429) return { level: 'transient', code: 'rate_limited' };
    if (status >= 500) return { level: 'transient', code: 'provider_unavailable' };
    return null;
}

/**
 * Google's token endpoint answer for a JWT-bearer grant (documented error table of "Using OAuth 2.0 for Server to
 * Server Applications"). Pure.
 */
export function classifyGoogleTokenError(status: number, body: unknown, options: { timedOut?: boolean } = {}): SyncFailure {
    const transient = transientOf(status, options.timedOut);
    if (transient) return transient;
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const error = str(record.error);
    const description = str(record.error_description);
    const providerText = providerWordsOf(body);
    const app = (code: AppErrorCode): SyncFailure => ({ level: 'app', code, providerText });
    const user = (code: UserErrorCode): SyncFailure => ({ level: 'user', code, providerText });

    if (error === 'unauthorized_client') {
        return /using this method/i.test(description) ? app('delegation_wrong_id') : app('delegation_missing');
    }
    if (error === 'access_denied') return app('scopes_not_authorised');
    if (error === 'admin_policy_enforced') return app('admin_policy');
    if (error === 'invalid_client' || error === 'disabled_client' || error === 'deleted_client') return app('key_invalid');
    if (error === 'invalid_grant') {
        if (/jwt signature/i.test(description)) return app('key_invalid');
        if (/timeframe|iat|exp/i.test(description) && /jwt/i.test(description)) return app('clock_skew');
        if (/invalid email or user id|not a valid email/i.test(description)) return user('user_not_found');
        // Unknown invalid_grant text (a suspended user is expected here, F2): user-level, provider text shown.
        return user('user_unavailable');
    }
    return app('provider_error');
}

/** AADSTS readings shared with P2-1's probe (in `error_codes` or the description text). */
const AADSTS_CODES: [number, AppErrorCode][] = [
    [7000215, 'invalid_client'],
    [7000222, 'secret_expired'],
    [700016, 'app_not_in_tenant'],
    [90002, 'tenant_not_found'],
];

/** Microsoft's v2 token endpoint answer for a client-credentials grant. Every failure is app-level. Pure. */
export function classifyMicrosoftTokenError(status: number, body: unknown, options: { timedOut?: boolean } = {}): SyncFailure {
    const transient = transientOf(status, options.timedOut);
    if (transient) return transient;
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const codes = new Set<number>(Array.isArray(record.error_codes) ? record.error_codes.filter((c): c is number => typeof c === 'number') : []);
    for (const match of str(record.error_description).matchAll(/AADSTS(\d+)/g)) codes.add(Number(match[1]));
    const providerText = providerWordsOf(body);
    for (const [aadsts, code] of AADSTS_CODES) if (codes.has(aadsts)) return { level: 'app', code, providerText };
    if (str(record.error) === 'invalid_client' || str(record.error) === 'unauthorized_client') return { level: 'app', code: 'invalid_client', providerText };
    return { level: 'app', code: 'provider_error', providerText };
}

const GRAPH_NO_MAILBOX = new Set(['MailboxNotEnabledForRESTAPI', 'MailboxNotSupportedForRESTAPI', 'ResourceNotFound', 'ErrorItemNotFound', 'Request_ResourceNotFound', 'ErrorInvalidUser']);

/**
 * A calendar API failure (`providerFetch` error) seen while using one person's calendar. `probe` = the call was the
 * per-row health check on the user's own calendar (`probeCalendar`): there a 403 / 404 means the person can't be
 * reached at all. Returns null for errors that say nothing about the person or the app (a 404 on one event, a 412):
 * the caller handles those itself. Pure.
 */
export function classifyApiError(provider: SyncProvider, err: unknown, options: { probe?: boolean } = {}): SyncFailure | null {
    if (err instanceof TokenError) return { level: err.level, code: err.code, ...(err.providerText ? { providerText: err.providerText } : {}) };
    if (!(err instanceof ProviderError)) return null;
    if (err instanceof ProviderRateLimitedError) return { level: 'transient', code: 'rate_limited' };
    if (err instanceof ProviderTransientError) return { level: 'transient', code: err.status === 0 && err.code === 'network' ? 'network' : 'provider_unavailable' };
    const providerText = err instanceof ProviderBadRequestError && err.providerMessage ? clip(err.providerMessage) : clip(`${err.status} ${err.code}`);
    if (provider === 'microsoft') {
        // F5: matched on the Graph code whatever the status.
        if (err.code === 'ErrorAccessDenied') return { level: 'user', code: 'mailbox_out_of_scope', providerText };
        if (GRAPH_NO_MAILBOX.has(err.code) && (options.probe || err.code.startsWith('Mailbox'))) return { level: 'user', code: 'no_mailbox', providerText };
        if (options.probe && err.status === 404) return { level: 'user', code: 'no_mailbox', providerText };
        return null;
    }
    // Google (and the fake): 403 insufficientPermissions on an event call (not the probe, see below) = the domain-wide
    // delegation entry lacks the scope the push writes with (P2-3b): the whole app, not one person.
    if (!options.probe && err instanceof ProviderAuthError && err.status === 403 && err.code === 'insufficientPermissions') {
        return { level: 'app', code: 'scopes_not_authorised', providerText };
    }
    // Google (and the fake, which speaks Google's shapes): F11, any 403 / 404 on the user's own primary calendar.
    if (options.probe && (err.status === 403 || err.status === 404)) return { level: 'user', code: 'calendar_unavailable', providerText };
    return null;
}

/** Admin sentence plus the provider's words in brackets, within 300 characters. */
export function adminMessageOf(failure: Pick<SyncFailure, 'code' | 'providerText'>): string {
    const sentence = ADMIN_ERROR_MESSAGES[failure.code] ?? ADMIN_ERROR_MESSAGES.provider_error;
    const detail = failure.providerText ? clip(failure.providerText) : '';
    if (!detail) return sentence.slice(0, PROVIDER_TEXT_MAX);
    const room = PROVIDER_TEXT_MAX - sentence.length - 3;
    return room > 20 ? `${sentence} (${detail.slice(0, room)})` : sentence.slice(0, PROVIDER_TEXT_MAX);
}
