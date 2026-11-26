import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isAppOrigin } from '../../config/origins.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import { secretBox } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { redirectUriFor, type IntegrationProviderKey } from '../integrations/integration.constants.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { isCompanyEmail, normalizeUserEmail, userEmailService } from '../users/userEmail.service.js';
import {
    ACCOUNT_EMAIL_MAX_FOR_USER,
    CALENDAR_CONNECTIONS_PAGE,
    CALENDAR_PROVIDER_LABELS,
    LIVE_CONNECTION_STATUSES,
    OAUTH_COOKIE_PATH,
    OAUTH_COOKIE_TTL_MS,
    type CalendarProvider,
    type CallbackReason,
} from './connection.constants.js';
import { disconnectInTransaction, revokeQuietly, type RevokeTask } from './connection.service.js';
import { sealTokenColumns } from './connectionTokens.js';
import { ProviderError } from './providers/http.js';
import { IdentityError } from './providers/idToken.js';
import { googlePkceEnabled } from './providers/google.js';
import { getAdapter, loadConnectCredentials } from './providers/registry.js';
import type { AccountIdentity, ProviderCredentials, TokenSet } from './providers/types.js';

/**
 * Connect a calendar (Calendar Phase 2 spec §3.3, D6 / D7): `startConnect` (POST /api/calendar-connections/:provider/start)
 * and `completeConnect` (GET /api/calendar-connections/oauth/:provider/callback).
 *
 * Start: authorization code + PKCE S256 + `state` + OIDC `nonce`; the transient values live only in the sealed,
 * httpOnly, 10-minute cookie `crm_oauth` (path /api/calendar-connections/oauth, SameSite=Lax: the callback is a
 * top-level GET), whose AAD names the provider and the CRM user, so it can't be replayed for someone else or another
 * provider. It also carries the CRM origin that started the flow (accepted only when `isAppOrigin()`), so the callback
 * returns there; anything else goes to APP_PUBLIC_URL, which is never changed for testing.
 *
 * Callback: checks the CRM session itself (the route isn't behind `authenticate`, which answers JSON), the cookie,
 * `state` (constant time), exchanges the code, checks the id_token (providers/*), the account policy (Google `hd` in
 * the company domains), the granted scopes, the email rule, then saves the connection in one audited transaction.
 * Every exit is a 302 to `<origin>/connected-calendars?calendar=connected|error&reason=<fixed code>&provider=<key>`
 * (no provider text is reflected). Tokens and codes are never logged or returned to the browser.
 */

// ── Cookie ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface OAuthCookie {
    /** state */
    s: string;
    /** PKCE verifier */
    v: string;
    /** nonce */
    n: string;
    /** CRM user id */
    u: number;
    /** provider */
    p: CalendarProvider;
    /** CRM origin to return to */
    o: string;
    /** expiry (epoch ms) */
    exp: number;
}

export const oauthCookieAad = (provider: string, userId: number) => `oauth:${provider}:${userId}`;

export function sealOAuthCookie(cookie: OAuthCookie): string {
    return secretBox.seal(JSON.stringify(cookie), oauthCookieAad(cookie.p, cookie.u));
}

/** The cookie for this provider and session user, or null when missing, expired, tampered or someone else's. */
export function openOAuthCookie(value: unknown, provider: string, userId: number, now: Date = new Date()): OAuthCookie | null {
    if (typeof value !== 'string' || !value || !secretBox.ready()) return null;
    try {
        const cookie = JSON.parse(secretBox.open(value, oauthCookieAad(provider, userId))) as Partial<OAuthCookie>;
        if (cookie.p !== provider || cookie.u !== userId) return null;
        if (typeof cookie.exp !== 'number' || cookie.exp <= now.getTime()) return null;
        if (typeof cookie.s !== 'string' || typeof cookie.v !== 'string' || typeof cookie.n !== 'string' || typeof cookie.o !== 'string') return null;
        return cookie as OAuthCookie;
    } catch {
        return null;
    }
}

export function oauthCookieOptions(): CookieOptions {
    return { httpOnly: true, secure: ENV.IS_PRODUCTION, sameSite: 'lax', path: OAUTH_COOKIE_PATH, maxAge: OAUTH_COOKIE_TTL_MS };
}

/** Options to clear it (same path / flags, no maxAge). */
export function oauthCookieClearOptions(): CookieOptions {
    return { httpOnly: true, secure: ENV.IS_PRODUCTION, sameSite: 'lax', path: OAUTH_COOKIE_PATH };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────────────────────────────────────

const b64url = (buf: Buffer) => buf.toString('base64url');

export function pkcePair(): { verifier: string; challenge: string } {
    const verifier = b64url(randomBytes(32));
    return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

export function constantTimeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
}

const appPublicUrl = () => ENV.MAIL.APP_PUBLIC_URL;

/** The origin a flow returns to: the browser's Origin when it is the CRM itself, else APP_PUBLIC_URL. */
export function returnOriginFor(origin: string | null | undefined): string {
    return origin && isAppOrigin(origin) ? origin.replace(/\/+$/, '') : appPublicUrl();
}

export type CallbackOutcome = { ok: true; provider: CalendarProvider } | { ok: false; reason: CallbackReason; provider?: string };

/** `<origin>/connected-calendars?calendar=…` with fixed values only. */
export function callbackLocation(origin: string, outcome: CallbackOutcome): string {
    const params = new URLSearchParams(outcome.ok ? { calendar: 'connected', provider: outcome.provider } : { calendar: 'error', reason: outcome.reason });
    if (!outcome.ok && outcome.provider) params.set('provider', outcome.provider);
    return `${origin}${CALENDAR_CONNECTIONS_PAGE}?${params.toString()}`;
}

/** Where a callback without a CRM session goes: sign in, then back to the page. */
export const loginLocation = () => `${appPublicUrl()}/login?next=${encodeURIComponent(CALENDAR_CONNECTIONS_PAGE)}`;

/**
 * Company rules on the signed-in account beyond the id_token checks. Google: the Workspace domain (`hd`) must be one
 * of the company domains. Microsoft: the tenant was checked in the adapter. Pure.
 */
export function checkAccountPolicy(provider: CalendarProvider, identity: AccountIdentity, companyDomains: readonly string[]): CallbackReason | null {
    if (provider === 'google') {
        const hd = (identity.tenantId ?? '').toLowerCase();
        if (!hd || !companyDomains.some((d) => d.toLowerCase() === hd)) return 'domain_not_allowed';
    }
    return null;
}

const redirectUri = (provider: CalendarProvider) => redirectUriFor(provider as IntegrationProviderKey, ENV.INTEGRATIONS.PUBLIC_API_URL);

const notReady = (reason: 'key_missing' | 'public_url_missing') =>
    new HttpError(
        reason === 'key_missing'
            ? 'Calendar connections are not set up on the server yet (INTEGRATIONS_ENCRYPTION_KEY). Ask your admin.'
            : 'Calendar connections are not set up on the server yet (PUBLIC_API_URL). Ask your admin.',
        StatusCodes.SERVICE_UNAVAILABLE,
        { code: 'INTEGRATIONS_NOT_READY' },
    );

// ── Start ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface StartResult {
    authUrl: string;
    /** Sealed `crm_oauth` cookie value. */
    cookie: string;
}

/**
 * Refusals: key or (production) PUBLIC_API_URL missing → 503 INTEGRATIONS_NOT_READY; provider off / not configured
 * → 409 PROVIDER_DISABLED; another calendar provider live → 409 CALENDAR_ALREADY_CONNECTED; a group (shared) or
 * inactive login → 403 FORBIDDEN. Re-connecting the same provider is allowed (re-authorize or switch account).
 */
export async function startConnect(user: AuthUser, provider: CalendarProvider, origin: string | null | undefined, now: Date = new Date()): Promise<StartResult> {
    if (!secretBox.ready()) throw notReady('key_missing');
    const redirect = redirectUri(provider);
    if (!redirect) throw notReady('public_url_missing');

    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { username: true, email: true, isActive: true, isGroupUser: true } });
    if (!account || !account.isActive) throw HttpError.forbidden('Your account is not active.');
    if (account.isGroupUser) throw HttpError.forbidden("Shared logins can't connect a calendar. Sign in with your own account.");

    const app = await loadConnectCredentials(provider);
    if (!app.enabled || !app.configured || !app.creds) {
        throw new HttpError(`${CALENDAR_PROVIDER_LABELS[provider]} isn't switched on yet. Ask your admin (Admin › API Integrations).`, StatusCodes.CONFLICT, {
            code: 'PROVIDER_DISABLED',
        });
    }

    const email = normalizeUserEmail(account.email);
    if (provider === 'fake' && !email) {
        throw HttpError.badRequest('The test calendar signs in with your company email. Ask an admin to set it first.');
    }

    const other = await prisma.calendarConnection.findFirst({
        where: { username: account.username, kind: 'calendar', status: { in: [...LIVE_CONNECTION_STATUSES] }, provider: { not: provider } },
        select: { provider: true },
    });
    if (other) {
        const label = CALENDAR_PROVIDER_LABELS[other.provider as CalendarProvider] ?? other.provider;
        throw new HttpError(`Disconnect ${label} first: one calendar per person.`, StatusCodes.CONFLICT, { code: 'CALENDAR_ALREADY_CONNECTED' });
    }

    const settings = await loadCalendarSettings();
    const state = b64url(randomBytes(32));
    const nonce = b64url(randomBytes(16));
    const { verifier, challenge } = pkcePair();
    const pkce = provider !== 'google' || googlePkceEnabled(app.creds);
    const cookie = sealOAuthCookie({ s: state, v: pkce ? verifier : '', n: nonce, u: user.id, p: provider, o: returnOriginFor(origin), exp: now.getTime() + OAUTH_COOKIE_TTL_MS });
    const authUrl = getAdapter(provider).authorizeUrl({
        creds: app.creds,
        redirectUri: redirect,
        state,
        nonce,
        ...(pkce ? { codeChallenge: challenge } : {}),
        ...(email ? { loginHint: email } : {}),
        ...(settings.companyDomains[0] ? { domainHint: settings.companyDomains[0] } : {}),
    });
    logger.info({ provider, user: user.username }, 'Calendar connect started');
    return { authUrl, cookie };
}

// ── Callback ──────────────────────────────────────────────────────────────────────────────────────────────────

/** A refusal decided inside the connect transaction (thrown so everything it wrote rolls back). */
class ConnectRefusal extends Error {
    readonly reason: CallbackReason;
    constructor(reason: CallbackReason) {
        super(`Connect refused: ${reason}`);
        this.reason = reason;
    }
}

export interface CallbackInput {
    provider: string;
    query: Record<string, unknown>;
    cookie: unknown;
    /** The verified CRM session (null when the request has none or it was revoked). */
    session: { id: number; username: string } | null;
    now?: Date;
}

const queryText = (query: Record<string, unknown>, key: string): string => {
    const value = query[key];
    return typeof value === 'string' ? value : '';
};

/** Reasons where revoking the new grant is right: it is not live for anyone (see `revokeUnlessInUse`). */
const REVOKE_ON: ReadonlySet<CallbackReason> = new Set(['scope_denied', 'email_mismatch', 'email_too_long', 'domain_not_allowed', 'invalid', 'provider_error', 'already_connected', 'server_error']);

/**
 * Ends a grant we won't keep (Google, fake; Microsoft has no per-app revoke so the tokens are simply dropped). Never
 * when the same provider account is live for someone in the CRM: a Google revoke ends every token of that grant,
 * which would cut off a colleague who connected that account.
 */
async function revokeUnlessInUse(provider: CalendarProvider, creds: ProviderCredentials, tokens: TokenSet, accountId: string | null): Promise<void> {
    const adapter = getAdapter(provider);
    if (!adapter.canRevoke) return;
    if (accountId) {
        const live = await prisma.calendarConnection.findFirst({ where: { provider, accountId, status: { in: [...LIVE_CONNECTION_STATUSES] } }, select: { id: true } });
        if (live) return;
    }
    await revokeQuietly({ provider, creds, token: tokens.refreshToken ?? tokens.accessToken, connectionId: null });
}

interface SaveInput {
    session: { id: number; username: string };
    provider: CalendarProvider;
    identity: AccountIdentity;
    tokens: TokenSet;
    grantedScopes: string;
    clientVersion: number;
    companyDomains: readonly string[];
    now: Date;
}

interface SaveResult {
    connectionId: string;
    displaced: RevokeTask | null;
    emailFilled: boolean;
}

/**
 * The connect transaction (spec §3.3 step 6–7). Locks the user and the provider account, then:
 * - the account is live for another CRM user → `account_in_use`;
 * - the user has another provider live → `already_connected` (start refuses it too; this covers a race);
 * - email: the CRM email must equal the account's; an empty CRM email is filled from the verified account when it is
 *   a company address nobody else holds (the fake provider never fills it);
 * - same provider, another account live → that row is disconnected (`switched_account`) and revoked after commit;
 * - the newest row of this user + provider + account (any status) is re-activated with the new tokens, else a row is
 *   created (its id generated here so the token AAD can name it);
 * - audited `CalendarConnection CONNECT` with the user as actor.
 */
async function saveConnection(tx: TransactionClient, input: SaveInput): Promise<SaveResult> {
    const { session, provider, identity, now } = input;
    await acquireLocks(tx, [`calendar-connection:user:${session.username.toLowerCase()}`, `calendar-connection:account:${provider}:${identity.accountId}`]);

    const user = await tx.user.findUnique({ where: { id: session.id }, select: { id: true, username: true, email: true, isActive: true, isGroupUser: true } });
    if (!user || !user.isActive || user.isGroupUser || user.username !== session.username) throw new ConnectRefusal('invalid');

    const live = await tx.calendarConnection.findMany({
        where: { status: { in: [...LIVE_CONNECTION_STATUSES] }, OR: [{ username: user.username, kind: 'calendar' }, { provider, accountId: identity.accountId }] },
    });
    if (live.some((row) => row.provider === provider && row.accountId === identity.accountId && row.username !== user.username)) throw new ConnectRefusal('account_in_use');
    if (live.some((row) => row.username === user.username && row.kind === 'calendar' && row.provider !== provider)) throw new ConnectRefusal('already_connected');

    let emailFilled = false;
    const crmEmail = normalizeUserEmail(user.email);
    if (crmEmail) {
        if (crmEmail !== identity.email) throw new ConnectRefusal('email_mismatch');
    } else {
        if (provider === 'fake') throw new ConnectRefusal('email_mismatch');
        if (identity.email.length > ACCOUNT_EMAIL_MAX_FOR_USER) throw new ConnectRefusal('email_too_long');
        if (!isCompanyEmail(identity.email, input.companyDomains)) throw new ConnectRefusal('domain_not_allowed');
        const claimed = await userEmailService.claimEmptyEmail(tx, { userId: user.id, email: identity.email, companyDomains: input.companyDomains, actorUsername: user.username });
        if (claimed === 'taken') throw new ConnectRefusal('account_in_use');
        if (claimed === 'not_company') throw new ConnectRefusal('domain_not_allowed');
        if (claimed === 'not_empty') throw new ConnectRefusal('email_mismatch');
        emailFilled = true;
    }

    let displaced: RevokeTask | null = null;
    const switched = live.find((row) => row.username === user.username && row.provider === provider && row.accountId !== identity.accountId);
    if (switched) displaced = await disconnectInTransaction(tx, switched, { actor: user.username, by: 'user', reason: 'switched_account', now });

    const existing = await tx.calendarConnection.findFirst({
        where: { username: user.username, provider, accountId: identity.accountId },
        orderBy: { updatedAt: 'desc' },
    });
    const id = existing?.id ?? randomUUID();
    const fields = {
        accountEmail: identity.email,
        tenantId: identity.tenantId ?? null,
        status: 'active',
        statusReason: null,
        grantedScopes: input.grantedScopes,
        clientVersion: input.clientVersion,
        ...sealTokenColumns(id, input.tokens),
        syncCursor: null,
        fullSyncAt: null,
        consecutiveFailures: 0,
        lastErrorAt: null,
        lastErrorCode: null,
        leaseId: null,
        leaseUntil: null,
        connectedAt: now,
        disconnectedAt: null,
        disconnectedBy: null,
    };
    if (existing) {
        await tx.calendarConnection.update({ where: { id }, data: { ...fields, tokenVersion: existing.tokenVersion + 1 } });
    } else {
        await tx.calendarConnection.create({ data: { id, username: user.username, provider, kind: 'calendar', accountId: identity.accountId, ...fields } });
    }
    await auditService.record(tx, {
        entityType: 'CalendarConnection',
        entityId: id,
        action: 'CONNECT',
        changedBy: user.username,
        changes: {
            provider,
            accountEmail: identity.email,
            by: user.username,
            ...(existing ? { reconnected: true } : {}),
            ...(emailFilled ? { emailFilled: true } : {}),
            ...(switched ? { replaced: switched.accountEmail } : {}),
        },
    });
    return { connectionId: id, displaced, emailFilled };
}

/** Handles the provider's redirect; returns the Location of the 302 (the route also clears the cookie). */
export async function completeConnect(input: CallbackInput): Promise<string> {
    const now = input.now ?? new Date();
    const providerKey = input.provider;
    if (!input.session) return loginLocation();
    const provider = (['google', 'microsoft', 'fake'] as const).find((p) => p === providerKey);
    if (!provider) return callbackLocation(appPublicUrl(), { ok: false, reason: 'invalid' });

    const cookie = openOAuthCookie(input.cookie, provider, input.session.id, now);
    if (!cookie) {
        logger.warn({ provider, reason: 'expired' }, 'Calendar connect callback refused');
        return callbackLocation(appPublicUrl(), { ok: false, reason: 'expired', provider });
    }
    const origin = returnOriginFor(cookie.o);
    const fail = (reason: CallbackReason, detail?: Record<string, unknown>) => {
        logger.warn({ provider, reason, ...detail }, 'Calendar connect callback refused');
        return callbackLocation(origin, { ok: false, reason, provider });
    };

    const state = queryText(input.query, 'state');
    if (!state || !constantTimeEqual(state, cookie.s)) return fail('invalid', { check: 'state' });
    const providerError = queryText(input.query, 'error');
    if (providerError) return fail(providerError === 'access_denied' ? 'denied' : 'provider_error', { check: 'provider_error_param' });
    const code = queryText(input.query, 'code');
    if (!code) return fail('invalid', { check: 'code_missing' });

    const redirect = redirectUri(provider);
    const app = await loadConnectCredentials(provider);
    if (!secretBox.ready() || !redirect || !app.enabled || !app.creds) return fail('not_configured');
    const creds = app.creds;
    const adapter = getAdapter(provider);

    let tokens: TokenSet;
    try {
        tokens = await adapter.exchangeCode({ creds, code, codeVerifier: cookie.v || undefined, redirectUri: redirect });
    } catch (err) {
        return fail('provider_error', { check: 'token', code: err instanceof ProviderError ? err.code : 'error' });
    }

    let identity: AccountIdentity;
    try {
        identity = await adapter.identity(tokens, creds, cookie.n, now);
    } catch (err) {
        const reason: CallbackReason = err instanceof IdentityError ? err.reason : 'provider_error';
        await revokeUnlessInUse(provider, creds, tokens, null);
        return fail(reason, { check: err instanceof IdentityError ? err.check : 'identity', code: err instanceof ProviderError ? err.code : undefined });
    }

    const refuse = async (reason: CallbackReason, detail?: Record<string, unknown>) => {
        if (REVOKE_ON.has(reason)) await revokeUnlessInUse(provider, creds, tokens, identity.accountId);
        return fail(reason, detail);
    };

    if (!tokens.refreshToken) return refuse('provider_error', { check: 'no_refresh_token' });
    const settings = await loadCalendarSettings();
    const policy = checkAccountPolicy(provider, identity, settings.companyDomains);
    if (policy) return refuse(policy, { check: 'account_policy' });
    const missing = adapter.missingScopes(tokens, creds);
    if (missing.length > 0) return refuse('scope_denied', { check: 'scopes', missing: missing.length });

    const save: SaveInput = {
        session: input.session,
        provider,
        identity,
        tokens,
        grantedScopes: (tokens.scope ?? adapter.requestedScopes(creds).join(' ')).slice(0, 1000),
        clientVersion: app.clientVersion,
        companyDomains: settings.companyDomains,
        now,
    };
    let saved: SaveResult;
    try {
        saved = await runInTransaction((tx) => saveConnection(tx, save));
    } catch (first) {
        if (first instanceof ConnectRefusal) return refuse(first.reason, { check: 'save' });
        if (!isUniqueViolation(first)) {
            logger.error({ provider, err: (first as Error).message }, 'Calendar connect could not be saved');
            return refuse('server_error');
        }
        // A unique index raced us (spec D45: never caught inside the transaction): retry once from the start.
        try {
            saved = await runInTransaction((tx) => saveConnection(tx, save));
        } catch (second) {
            if (second instanceof ConnectRefusal) return refuse(second.reason, { check: 'save_retry' });
            logger.error({ provider, err: (second as Error).message }, 'Calendar connect could not be saved');
            return refuse('server_error');
        }
    }

    if (saved.displaced) await revokeQuietly(saved.displaced);
    logger.info({ provider, connectionId: saved.connectionId, emailFilled: saved.emailFilled }, 'Calendar connected');
    // P2-3 enqueues the `connect` job here (first pull + backfill); until then a connection only stores the grant.
    return callbackLocation(origin, { ok: true, provider });
}
