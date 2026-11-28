import nodemailer from 'nodemailer';
import type { FetchImpl } from '../calendar-sync/providers/types.js';
import { TokenError } from '../calendar-sync/syncErrors.js';
import { GMAIL_SEND_SCOPE } from './email.settings.js';

/**
 * Sends one message through the Gmail API as the configured sender mailbox (docs/system-design.md › Email):
 *   1. an access token for `sub = sender` with scope gmail.send only, minted from the Google Workspace service account
 *      key of Admin › API Integrations by the shared token source (domain-wide delegation; cached in memory, never
 *      stored);
 *   2. the MIME message built by nodemailer's stream transport (UTF-8 subject, multipart text + HTML);
 *   3. POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send { raw: base64url(MIME) }.
 * Errors become MailSendError with a sentence an admin can act on and whether a later retry may help. Tokens,
 * addresses and bodies are never logged here.
 */

export const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SEND_TIMEOUT_MS = 20_000;

export class MailSendError extends Error {
    readonly code: string;
    /** A later attempt may succeed (network, rate limit, 5xx); false = it won't until something is fixed. */
    readonly retryable: boolean;

    constructor(code: string, message: string, retryable: boolean) {
        super(message);
        this.name = 'MailSendError';
        this.code = code;
        this.retryable = retryable;
    }
}

export interface OutgoingMessage {
    from: { email: string; name: string | null };
    to: string;
    replyTo?: string | null;
    subject: string;
    html: string;
    text: string;
}

const builder = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });

/** The RFC 5322 message (and its Message-ID). */
export async function buildMime(message: OutgoingMessage): Promise<{ raw: Buffer; messageId: string | null }> {
    const info = await builder.sendMail({
        from: message.from.name ? { name: message.from.name, address: message.from.email } : message.from.email,
        to: message.to,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
    });
    const raw = Buffer.isBuffer(info.message) ? info.message : Buffer.from(String(info.message));
    return { raw, messageId: typeof info.messageId === 'string' ? info.messageId : null };
}

/** What an admin reads for a token failure while sending as `sender`. */
export function gmailTokenErrorMessage(err: TokenError, sender: string, clientId: string | null): MailSendError {
    const entry = `Admin console › Security › Access and data control › API controls › Domain-wide delegation${clientId ? `, client ID ${clientId}` : ''}`;
    switch (err.code) {
        case 'delegation_missing':
        case 'delegation_wrong_id':
        case 'scopes_not_authorised':
        case 'admin_policy':
            return new MailSendError(
                err.code,
                `Google did not let the service account send as ${sender}. Add ${GMAIL_SEND_SCOPE} to its entry in ${entry} (it can take up to 24 hours to apply).`,
                false,
            );
        case 'user_not_found':
        case 'user_unavailable':
            return new MailSendError(err.code, `Google has no active mailbox for the sender address ${sender}. Check the address, or that the mailbox has a Workspace licence.`, false);
        case 'key_invalid':
            return new MailSendError(err.code, 'Google rejected the service account key (deleted, disabled or wrong). Upload a new key on Admin › API Integrations.', false);
        case 'clock_skew':
            return new MailSendError(err.code, 'The server clock is off, so Google refused the sign-in. Fix the time on the server.', true);
        case 'not_configured':
            return new MailSendError(err.code, 'No Google Workspace service account key is uploaded yet (Admin › API Integrations).', false);
        case 'rate_limited':
            return new MailSendError(err.code, 'Google asked the CRM to slow down. The email is retried automatically.', true);
        case 'provider_unavailable':
        case 'network':
            return new MailSendError(err.code, 'Google is not reachable right now. The email is retried automatically.', true);
        default:
            return new MailSendError(err.code, `Google refused the sign-in for ${sender} (${err.code}).`, false);
    }
}

interface GmailErrorBody {
    error?: { code?: number; message?: string; status?: string; errors?: { reason?: string; message?: string }[] };
}

/** The Gmail API's answer to a failed send as an admin-readable error. */
export function gmailSendError(status: number, body: unknown, sender: string): MailSendError {
    const err = (body && typeof body === 'object' ? (body as GmailErrorBody).error : undefined) ?? {};
    const reason = err.errors?.[0]?.reason ?? err.status ?? String(status);
    const words = (err.message ?? err.errors?.[0]?.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (status === 0) return new MailSendError('network', 'The server could not reach the Gmail API (network or firewall). The email is retried automatically.', true);
    if (status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
        return new MailSendError('rate_limited', 'Gmail is limiting how fast the CRM sends. The email is retried automatically.', true);
    }
    if (reason === 'dailyLimitExceeded' || /daily.*limit/i.test(words)) {
        return new MailSendError('daily_limit', `The mailbox ${sender} reached Google's daily sending limit. The email is retried later.`, true);
    }
    if (status >= 500) return new MailSendError('provider_unavailable', 'The Gmail API is not answering right now. The email is retried automatically.', true);
    if (status === 401) return new MailSendError('unauthorized', 'Google did not accept the access token. The email is retried automatically.', true);
    if (status === 403 && (reason === 'insufficientPermissions' || /scope/i.test(words))) {
        return new MailSendError('scope_missing', `The service account may not send mail: add ${GMAIL_SEND_SCOPE} to its domain-wide delegation entry.`, false);
    }
    if (status === 403 && /gmail.*(disabled|not enabled|has not been used)/i.test(words)) {
        return new MailSendError('api_disabled', 'The Gmail API is not enabled in the service account’s Google Cloud project. Enable it, then try again.', false);
    }
    if (status === 400 && /recipient|address/i.test(words)) return new MailSendError('bad_recipient', `Gmail refused the recipient address${words ? `: ${words}` : '.'}`, false);
    return new MailSendError(reason, `Gmail refused the email (${status}${words ? `: ${words}` : ''}).`, status === 403 ? false : status >= 400 && status < 500 ? false : true);
}

export interface GmailSendDeps {
    fetchImpl?: FetchImpl;
    /** Mints the token (default: the shared calendar token source, which caches per subject + scopes). */
    getToken?: (sender: string) => Promise<string>;
    clientId?: string | null;
}

async function defaultToken(sender: string): Promise<string> {
    // Imported lazily: the token source pulls in the calendar provider registry.
    const { tokenSource } = await import('../calendar-sync/tokenSource.js');
    const grant = await tokenSource.getAccessToken('google', sender, [GMAIL_SEND_SCOPE]);
    return grant.accessToken;
}

/** Only an access token for the sender: proves delegation + scope without sending anything (Check connection). */
export async function checkGmailAccess(sender: string, deps: GmailSendDeps = {}): Promise<void> {
    try {
        await (deps.getToken ?? defaultToken)(sender);
    } catch (err) {
        if (err instanceof TokenError) throw gmailTokenErrorMessage(err, sender, deps.clientId ?? null);
        throw new MailSendError('token_failed', 'Could not get an access token from Google. Try again in a minute.', true);
    }
}

export async function sendViaGmail(message: OutgoingMessage, deps: GmailSendDeps = {}): Promise<{ messageId: string | null }> {
    const sender = message.from.email;
    let token: string;
    try {
        token = await (deps.getToken ?? defaultToken)(sender);
    } catch (err) {
        if (err instanceof TokenError) throw gmailTokenErrorMessage(err, sender, deps.clientId ?? null);
        throw new MailSendError('token_failed', 'Could not get an access token from Google. The email is retried automatically.', true);
    }
    const { raw } = await buildMime(message);
    const fetchImpl: FetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
    let status = 0;
    let body: unknown = null;
    try {
        const res = await fetchImpl(GMAIL_SEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ raw: raw.toString('base64url') }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
            redirect: 'manual',
        });
        status = res.status;
        const text = await res.text().catch(() => '');
        try {
            body = text ? (JSON.parse(text) as unknown) : null;
        } catch {
            body = null;
        }
    } catch {
        status = 0;
    }
    if (status >= 200 && status < 300) {
        const id = body && typeof body === 'object' && typeof (body as { id?: unknown }).id === 'string' ? (body as { id: string }).id : null;
        return { messageId: id };
    }
    if (status === 401) {
        // A grant revoked early: drop it so the retry mints a new one.
        const { tokenSource } = await import('../calendar-sync/tokenSource.js').catch(() => ({ tokenSource: null }));
        tokenSource?.invalidate('google', sender);
    }
    throw gmailSendError(status, body, sender);
}
