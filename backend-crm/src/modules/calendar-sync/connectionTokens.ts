import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { keyIdOf, secretBox, SecretBoxError } from '../../services/secretBox.js';
import { notify } from '../notifications/notification.producer.js';
import type { CalendarProvider, ConnectionStatusReason } from './connection.constants.js';
import { reconnectNotification } from './connection.notifications.js';
import { ProviderAuthError } from './providers/http.js';
import { getAdapter, loadConnectCredentials } from './providers/registry.js';
import type { ProviderCredentials, TokenSet } from './providers/types.js';

/**
 * An employee's OAuth tokens (spec §3.3 "Tokens", D9). Both tokens are AES-256-GCM sealed in CalendarConnection with
 * AAD `CalendarConnection:<id>:accessToken|refreshToken`, so a value copied to another row or column never opens.
 * Nothing here logs or returns a token; callers get the access token only inside `withAccessToken`'s callback.
 *
 * - `withAccessToken(id, fn)`: gates (connection active, its user active (D43), provider on and configured, same company
 *   app version, key present, time-limited grant not over), refreshes first when the access token expires within
 *   5 minutes, calls `fn(token)`, and on a provider 401 refreshes once and retries.
 * - Refresh is compare-and-set on `tokenVersion` (works across the API and worker processes without Redis): a lost race
 *   re-reads and uses the winner's token. Microsoft (and the fake) rotate refresh tokens: the new one always replaces
 *   the stored one; Google usually sends none, so the stored one is kept.
 * - `invalid_grant` / `interaction_required` / AADSTS700082 / AADSTS50173 (ProviderAuthError): if someone else
 *   refreshed meanwhile, their token is used; otherwise the connection becomes `reauth_required` and the user gets a
 *   `calendar_reconnect` notification. `invalid_client` (ProviderClientError: an admin changed the secret) is a
 *   provider problem: the connection is not marked and the error goes back to the caller.
 */

export type ConnectionRow = Prisma.CalendarConnectionGetPayload<object>;

/** Refresh when the access token expires within this window. */
export const ACCESS_REFRESH_LEEWAY_MS = 5 * 60 * 1000;

export const tokenAad = (connectionId: string, field: 'accessToken' | 'refreshToken') => `CalendarConnection:${connectionId}:${field}`;

export type UnavailableReason =
    | 'not_found'
    | 'not_active'
    | 'user_inactive'
    | 'provider_disabled'
    | 'key_missing'
    | 'key_error'
    | 'client_changed'
    | 'grant_expired'
    | 'reauth_required';

/** The connection can't be used now (the job / request skips it; the reason is a fixed code, safe to log). */
export class ConnectionUnavailableError extends Error {
    readonly reason: UnavailableReason;

    constructor(reason: UnavailableReason) {
        super(`Calendar connection unavailable: ${reason}`);
        this.name = 'ConnectionUnavailableError';
        this.reason = reason;
        Object.setPrototypeOf(this, ConnectionUnavailableError.prototype);
    }
}

/**
 * Sealed token columns for a token response. A response without a refresh token keeps the stored one (and its key id
 * stays the row's `keyId` until it is re-sealed, so the admin page and the re-encrypt script still count it).
 */
export function sealTokenColumns(
    connectionId: string,
    tokens: TokenSet,
    previous: { refreshTokenEnc: string | null; refreshTokenExpiresAt: Date | null } = { refreshTokenEnc: null, refreshTokenExpiresAt: null },
): Pick<ConnectionRow, 'accessTokenEnc' | 'accessTokenExpiresAt' | 'refreshTokenEnc' | 'refreshTokenExpiresAt' | 'keyId'> {
    const activeKid = secretBox.activeKid();
    const refreshTokenEnc = tokens.refreshToken ? secretBox.seal(tokens.refreshToken, tokenAad(connectionId, 'refreshToken')) : previous.refreshTokenEnc;
    let keyId = activeKid;
    if (!tokens.refreshToken && previous.refreshTokenEnc) {
        try {
            keyId = keyIdOf(previous.refreshTokenEnc);
        } catch {
            keyId = activeKid;
        }
    }
    return {
        accessTokenEnc: secretBox.seal(tokens.accessToken, tokenAad(connectionId, 'accessToken')),
        accessTokenExpiresAt: tokens.expiresAt,
        refreshTokenEnc,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? previous.refreshTokenExpiresAt,
        keyId,
    };
}

/** Opens one sealed token of a row; null when the column is empty. Throws SecretBoxError when it can't be opened. */
export function openToken(row: Pick<ConnectionRow, 'id' | 'accessTokenEnc' | 'refreshTokenEnc'>, field: 'accessToken' | 'refreshToken'): string | null {
    const sealed = field === 'accessToken' ? row.accessTokenEnc : row.refreshTokenEnc;
    return sealed ? secretBox.open(sealed, tokenAad(row.id, field)) : null;
}

const notifyQuietly = async (input: Parameters<typeof reconnectNotification>, connectionId: string) => {
    try {
        await notify([reconnectNotification(...input)]);
    } catch (err) {
        logger.warn({ connectionId, err: (err as Error).message }, 'Could not write the calendar_reconnect notification');
    }
};

/**
 * `active` → `reauth_required` (conditional, so only one process notifies) and a `calendar_reconnect` notification.
 * Links stay dirty and push after the reconnect (P2-3).
 */
export async function markReauthRequired(row: Pick<ConnectionRow, 'id' | 'username' | 'provider'>, reason: Extract<ConnectionStatusReason, 'invalid_grant' | 'client_changed' | 'grant_expired'>, now: Date = new Date()): Promise<boolean> {
    const { count } = await prisma.calendarConnection.updateMany({
        where: { id: row.id, status: 'active' },
        data: { status: 'reauth_required', statusReason: reason, lastErrorAt: now, lastErrorCode: reason },
    });
    if (count === 0) return false;
    logger.info({ connectionId: row.id, provider: row.provider, reason }, 'Calendar connection needs a reconnect');
    await notifyQuietly([row, reason, now], row.id);
    return true;
}

/** Tokens that can't be opened with the current key: `error` / `key_error` (an admin sees it; the user reconnects). */
async function markKeyError(row: Pick<ConnectionRow, 'id'>, now: Date): Promise<void> {
    await prisma.calendarConnection.updateMany({
        where: { id: row.id, status: 'active' },
        data: { status: 'error', statusReason: 'key_error', lastErrorAt: now, lastErrorCode: 'key_error' },
    });
    logger.warn({ connectionId: row.id }, 'Calendar connection tokens cannot be opened with the current key');
}

const openOrMark = async (row: ConnectionRow, field: 'accessToken' | 'refreshToken', now: Date): Promise<string | null> => {
    try {
        return openToken(row, field);
    } catch (err) {
        if (err instanceof SecretBoxError) {
            await markKeyError(row, now);
            throw new ConnectionUnavailableError('key_error');
        }
        throw err;
    }
};

export interface UsableConnection {
    row: ConnectionRow;
    creds: ProviderCredentials;
}

/** The gates every use of a connection passes (D43: the user must still be active). */
export async function usableConnection(connectionId: string, now: Date = new Date()): Promise<UsableConnection> {
    if (!secretBox.ready()) throw new ConnectionUnavailableError('key_missing');
    const row = await prisma.calendarConnection.findUnique({ where: { id: connectionId } });
    if (!row) throw new ConnectionUnavailableError('not_found');
    if (row.status !== 'active') throw new ConnectionUnavailableError(row.status === 'reauth_required' ? 'reauth_required' : 'not_active');
    const user = await prisma.user.findUnique({ where: { username: row.username }, select: { isActive: true, isGroupUser: true } });
    if (!user || !user.isActive || user.isGroupUser) throw new ConnectionUnavailableError('user_inactive');
    const app = await loadConnectCredentials(row.provider as CalendarProvider);
    if (!app.enabled || !app.configured || !app.creds) throw new ConnectionUnavailableError('provider_disabled');
    if (row.clientVersion !== app.clientVersion) {
        await markReauthRequired(row, 'client_changed', now);
        throw new ConnectionUnavailableError('client_changed');
    }
    if (row.refreshTokenExpiresAt && row.refreshTokenExpiresAt.getTime() <= now.getTime()) {
        await markReauthRequired(row, 'grant_expired', now);
        throw new ConnectionUnavailableError('grant_expired');
    }
    return { row, creds: app.creds };
}

/**
 * A fresh access token for a connection: refresh grant + compare-and-set on tokenVersion. Returns the token and the
 * row as stored afterwards. Throws ConnectionUnavailableError('reauth_required') when the grant is gone.
 */
export async function refreshAccessToken(row: ConnectionRow, creds: ProviderCredentials, now: Date = new Date()): Promise<{ accessToken: string; row: ConnectionRow }> {
    const refreshToken = await openOrMark(row, 'refreshToken', now);
    if (!refreshToken) {
        await markReauthRequired(row, 'invalid_grant', now);
        throw new ConnectionUnavailableError('reauth_required');
    }
    let tokens: TokenSet;
    try {
        tokens = await getAdapter(row.provider as CalendarProvider).refresh({ creds, refreshToken });
    } catch (err) {
        if (!(err instanceof ProviderAuthError)) throw err;
        // Someone else may have refreshed (and, with rotation, invalidated the token we sent): use theirs.
        const fresh = await prisma.calendarConnection.findUnique({ where: { id: row.id } });
        if (fresh && fresh.status === 'active' && fresh.tokenVersion !== row.tokenVersion) {
            const theirs = await openOrMark(fresh, 'accessToken', now);
            if (theirs) return { accessToken: theirs, row: fresh };
        }
        await markReauthRequired(row, 'invalid_grant', now);
        throw new ConnectionUnavailableError('reauth_required');
    }

    const data = { ...sealTokenColumns(row.id, tokens, row), tokenVersion: row.tokenVersion + 1 };
    const { count } = await prisma.calendarConnection.updateMany({ where: { id: row.id, tokenVersion: row.tokenVersion, status: 'active' }, data });
    if (count === 1) return { accessToken: tokens.accessToken, row: { ...row, ...data } };

    // Lost the race (or the row was disconnected meanwhile): the stored winner is the truth.
    const fresh = await prisma.calendarConnection.findUnique({ where: { id: row.id } });
    if (!fresh || fresh.status !== 'active') throw new ConnectionUnavailableError('not_active');
    const theirs = await openOrMark(fresh, 'accessToken', now);
    if (!theirs) throw new ConnectionUnavailableError('reauth_required');
    return { accessToken: theirs, row: fresh };
}

export interface AccessContext {
    row: ConnectionRow;
    creds: ProviderCredentials;
}

/**
 * Runs `fn` with a valid access token of the connection (see the file header). `now` is read once per call (tests
 * pass a clock).
 */
export async function withAccessToken<T>(connectionId: string, fn: (accessToken: string, ctx: AccessContext) => Promise<T>, clock: () => Date = () => new Date()): Promise<T> {
    const now = clock();
    const { row, creds } = await usableConnection(connectionId, now);
    let current = row;
    let accessToken = await openOrMark(row, 'accessToken', now);
    if (!accessToken || !row.accessTokenExpiresAt || row.accessTokenExpiresAt.getTime() - now.getTime() <= ACCESS_REFRESH_LEEWAY_MS) {
        ({ accessToken, row: current } = await refreshAccessToken(row, creds, now));
    }
    try {
        return await fn(accessToken, { row: current, creds });
    } catch (err) {
        if (!(err instanceof ProviderAuthError) || err.status !== 401) throw err;
        // The provider no longer accepts this access token (revoked early, clock skew): one refresh, one retry.
        const refreshed = await refreshAccessToken(current, creds, clock());
        return fn(refreshed.accessToken, { row: refreshed.row, creds });
    }
}
