import { ProviderAuthError, ProviderBadRequestError, ProviderError, ProviderNotFoundError, ProviderRateLimitedError, ProviderTransientError } from '../calendar-sync/providers/http.js';
import { PROVIDER_TEXT_MAX, TokenError } from '../calendar-sync/syncErrors.js';
import { MAIL_APP_ERROR_CODES, MAIL_ERROR_MESSAGES, type MailAppErrorCode, type MailErrorCode, type MailUserErrorCode } from './emailLog.constants.js';
import type { MailProviderKey } from './providers/types.js';

/**
 * Failures of a mailbox run, classified like calendar sync (addendum AC8) but kept apart from it (design note EL3): a
 * missing mail scope pauses email logging and never marks the calendar connection or the provider's calendar health.
 *   - user: one person's mailbox (the row goes to `error`, backoff 15 min → 24 h);
 *   - app: the whole provider's mail access (scope / permission missing, bad credentials): every mailbox of the provider
 *     pauses 5 min in this process, the Email logging card shows a provider problem, admins are notified;
 *   - transient: 429, 5xx, network (the next run retries; nothing marked).
 * Pure.
 */

export type MailFailure =
    | { level: 'user'; code: MailUserErrorCode; providerText?: string }
    | { level: 'app'; code: MailAppErrorCode; providerText?: string }
    | { level: 'transient'; code: 'rate_limited' | 'provider_unavailable' | 'network'; retryAfterMs?: number | null };

const clip = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, PROVIDER_TEXT_MAX);

const GRAPH_NO_MAILBOX = new Set(['MailboxNotEnabledForRESTAPI', 'MailboxNotSupportedForRESTAPI', 'ResourceNotFound', 'ErrorItemNotFound', 'Request_ResourceNotFound', 'ErrorInvalidUser']);
const GOOGLE_SCOPE_CODES = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'PERMISSION_DENIED', 'forbidden']);

const isAppCode = (code: string): code is MailAppErrorCode => (MAIL_APP_ERROR_CODES as readonly string[]).includes(code);

/**
 * `anyMailboxOk`: some mailbox of this provider has logged successfully before (Graph: a 403 then means this one person
 * is outside the app's RBAC scope, not a missing permission).
 */
export function classifyMailError(provider: MailProviderKey, err: unknown, options: { anyMailboxOk?: boolean } = {}): MailFailure | null {
    if (err instanceof TokenError) {
        const providerText = err.providerText ? clip(err.providerText) : undefined;
        if (err.level === 'transient') return { level: 'transient', code: err.code === 'rate_limited' ? 'rate_limited' : err.code === 'network' ? 'network' : 'provider_unavailable' };
        if (err.level === 'user') {
            const code: MailUserErrorCode = err.code === 'user_not_found' ? 'user_not_found' : err.code === 'no_mailbox' ? 'no_mailbox' : 'user_unavailable';
            return { level: 'user', code, providerText };
        }
        // Google: the delegation entry lacks the Gmail scope (the calendar scopes work, or this token wouldn't fail alone).
        if (err.code === 'delegation_missing' || err.code === 'scopes_not_authorised') return { level: 'app', code: 'mail_scope_missing', providerText };
        if (err.code === 'no_application_permission') return { level: 'app', code: 'mail_permission_missing', providerText };
        return { level: 'app', code: isAppCode(err.code) ? err.code : 'provider_error', providerText };
    }
    if (!(err instanceof ProviderError)) return null;
    if (err instanceof ProviderRateLimitedError) return { level: 'transient', code: 'rate_limited', retryAfterMs: err.retryAfterMs };
    if (err instanceof ProviderTransientError) return { level: 'transient', code: err.status === 0 && err.code === 'network' ? 'network' : 'provider_unavailable' };
    const providerText = err instanceof ProviderBadRequestError && err.providerMessage ? clip(err.providerMessage) : clip(`${err.status} ${err.code}`);

    if (provider === 'microsoft') {
        if (err.status === 403 || err.code === 'ErrorAccessDenied' || err.code === 'Authorization_RequestDenied') {
            return options.anyMailboxOk ? { level: 'user', code: 'mailbox_out_of_scope', providerText } : { level: 'app', code: 'mail_permission_missing', providerText };
        }
        if (GRAPH_NO_MAILBOX.has(err.code) || err.status === 404) return { level: 'user', code: 'no_mailbox', providerText };
        return { level: 'app', code: 'provider_error', providerText };
    }
    // Google (and the fake, which speaks Google's shapes).
    if (err.status === 403 && (err instanceof ProviderAuthError || GOOGLE_SCOPE_CODES.has(err.code))) return { level: 'app', code: 'mail_scope_missing', providerText };
    if (err.status === 400 && /failedPrecondition|FAILED_PRECONDITION/.test(err.code)) return { level: 'user', code: 'mail_unavailable', providerText };
    if (err.status === 403) return { level: 'user', code: 'mail_unavailable', providerText };
    if (err instanceof ProviderNotFoundError) return { level: 'user', code: 'mail_unavailable', providerText };
    return { level: 'app', code: 'provider_error', providerText };
}

/** Admin sentence plus the provider's words, within 300 characters. */
export function mailAdminMessage(code: MailErrorCode, providerText?: string): string {
    const sentence = MAIL_ERROR_MESSAGES[code] ?? MAIL_ERROR_MESSAGES.provider_error;
    const detail = providerText ? clip(providerText) : '';
    if (!detail) return sentence.slice(0, PROVIDER_TEXT_MAX);
    const room = PROVIDER_TEXT_MAX - sentence.length - 3;
    return room > 20 ? `${sentence} (${detail.slice(0, room)})` : sentence.slice(0, PROVIDER_TEXT_MAX);
}
