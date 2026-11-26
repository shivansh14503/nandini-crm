import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { secretBox } from '../../services/secretBox.js';
import { dropProviderCredentialsCache } from '../integrations/integration.service.js';
import { isLiveStatus, LIVE_CONNECTION_STATUSES, nextCheckDelayMs, type CalendarProvider } from './connection.constants.js';
import { ProviderError } from './providers/http.js';
import { getAdapter, loadProviderAccess, setFakeHealth } from './providers/registry.js';
import type { CallCtx } from './providers/types.js';
import { adminMessageOf, classifyApiError, TokenError, type SyncFailure, type TokenErrorCode } from './syncErrors.js';
import { notifyAppIssue } from './syncIssue.notifications.js';
import { tokenSource } from './tokenSource.js';

/**
 * `withCalendarAccess(connectionId, fn)`: the one way to act on an employee's company calendar (addendum §2.2;
 * replaces P2-2's `withAccessToken`). Gates, in order (each failure throws ConnectionUnavailableError with a fixed
 * reason, safe to log):
 *   1. the encryption key is set (`key_missing`; not needed by the dev-only fake, which has no secrets);
 *   2. the row exists and is live: pending | ok | error (`not_found` / `not_active`);
 *   3. its user is active and not a group login, D43 (`user_inactive`; the nightly reconcile stops the row later);
 *   4. the provider is switched on (`provider_disabled`) with readable credentials (`key_error`);
 *   5. the provider is not inside its app-level negative cache (`provider_unhealthy`).
 * Then it gets a token (tokenSource.ts), calls `fn`, and:
 *   - on a provider 401: drops the cached grant (Microsoft: the whole provider), mints once more and retries once;
 *   - on success: a `pending` / `error` row becomes `ok` (conditional, so one process writes) and a provider in `error`
 *     health becomes `ok`;
 *   - on a user-level failure: the row becomes `error` (code, admin text, backoff 15 min → 1 h → 6 h → 24 h) and
 *     `ConnectionUnavailableError('user_error')` is thrown, so jobs keep their links dirty;
 *   - on an app-level failure: the row is not marked; provider health becomes `error`, admins are notified
 *     (`calendar_sync_issue`), and `ConnectionUnavailableError('provider_unhealthy')` is thrown;
 *   - transient failures are rethrown as they are (the job retries; nothing is marked).
 * With `readOnly` (busy times, P2-6: a read any signed-in user can cause), a calendar call the provider refuses marks
 * nothing: no row error, no provider health, no admin notification; `ConnectionUnavailableError('call_refused')` is
 * thrown instead. Token failures and success are handled as above (they say the same about the connection whatever
 * the call was).
 */

export type ConnectionRow = Prisma.CalendarConnectionGetPayload<object>;

export type UnavailableReason =
    | 'not_found'
    | 'not_active'
    | 'user_inactive'
    | 'provider_disabled'
    | 'key_missing'
    | 'key_error'
    | 'provider_unhealthy'
    | 'user_error'
    /** `readOnly` only: the provider refused the call; nothing was marked (`failure` says how it would classify). */
    | 'call_refused';

/** The connection can't be used now (the job / request skips it; the reason is a fixed code, safe to log). */
export class ConnectionUnavailableError extends Error {
    readonly reason: UnavailableReason;
    /** The classified failure behind `user_error` / `provider_unhealthy`. */
    readonly failure?: SyncFailure;

    constructor(reason: UnavailableReason, failure?: SyncFailure) {
        super(`Calendar connection unavailable: ${reason}${failure ? ` (${failure.code})` : ''}`);
        this.name = 'ConnectionUnavailableError';
        this.reason = reason;
        if (failure) this.failure = failure;
        Object.setPrototypeOf(this, ConnectionUnavailableError.prototype);
    }
}

export interface CalendarAccessOptions {
    clock?: () => Date;
    /** The call is the per-row health check: a 403 / 404 means the person can't be reached, and the row is stamped. */
    check?: boolean;
    /**
     * A read-only lookup (busy times): a refused calendar call (not a token failure) marks neither the row nor the
     * provider and notifies nobody; it throws `ConnectionUnavailableError('call_refused', failure)`.
     */
    readOnly?: boolean;
}

/** Called when a row reaches `ok` from `pending` or `error` while `backfilledAt` is still null. */
type ReadyListener = (row: ConnectionRow) => void | Promise<void>;
/**
 * P2-3b: the row's `enrolled` job (sync.wake.ts, imported on demand: that module sits behind this one's importers),
 * which pushes the links saved while the row was pending or in error (a job id per recovery); P2-3c adds the
 * first-sync backfill to it. Without Redis
 * nothing is queued: the worker's fallback tick pushes those links within a minute (inside 07:00–22:00).
 */
const enqueueEnrolledJob: ReadyListener = async (row) => {
    const { enqueueEnrolled } = await import('./sync.wake.js');
    await enqueueEnrolled(row.id, row.enrolledAt, new Date());
};
const readyListeners = new Set<ReadyListener>([enqueueEnrolledJob]);
export function onConnectionReady(listener: ReadyListener): () => void {
    readyListeners.add(listener);
    return () => readyListeners.delete(listener);
}

// ── Provider health (app-level) ───────────────────────────────────────────────────────────────────────────────

/** Provider health → `error` with a code; admins notified (deduped per provider + code + business day). */
export async function markProviderUnhealthy(provider: CalendarProvider, code: TokenErrorCode, now: Date = new Date()): Promise<void> {
    if (provider === 'fake') {
        setFakeHealth('error', code);
    } else {
        await prisma.integrationProvider.updateMany({ where: { provider }, data: { healthStatus: 'error', healthCode: code, healthAt: now } });
        dropProviderCredentialsCache(provider);
    }
    logger.warn({ provider, code }, 'Calendar provider unhealthy');
    await notifyAppIssue(provider, code, now);
}

/** Provider health → `ok` after a success (only when it was in error, so a healthy provider costs no write). */
export async function markProviderHealthy(provider: CalendarProvider, now: Date = new Date()): Promise<void> {
    if (provider === 'fake') {
        setFakeHealth('ok', null);
        return;
    }
    const { count } = await prisma.integrationProvider.updateMany({ where: { provider, healthStatus: 'error' }, data: { healthStatus: 'ok', healthCode: null, healthAt: now } });
    if (count > 0) {
        dropProviderCredentialsCache(provider);
        logger.info({ provider }, 'Calendar provider healthy again');
    }
}

// ── Row state ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A user-level failure on one row: `error`, code, admin text, backoff. Only while the row is still live. */
export async function markUserError(row: Pick<ConnectionRow, 'id' | 'provider' | 'consecutiveFailures'>, failure: SyncFailure, now: Date = new Date()): Promise<void> {
    const failures = row.consecutiveFailures + 1;
    await prisma.calendarConnection.updateMany({
        where: { id: row.id, status: { in: ['pending', 'ok', 'error'] } },
        data: {
            status: 'error',
            statusReason: failure.code,
            lastErrorAt: now,
            lastErrorCode: failure.code,
            lastErrorMessage: adminMessageOf(failure),
            lastCheckedAt: now,
            consecutiveFailures: failures,
            nextCheckAt: new Date(now.getTime() + nextCheckDelayMs(failures)),
        },
    });
    logger.info({ connectionId: row.id, provider: row.provider, code: failure.code }, 'Calendar sync problem for one person');
}

/** Success: a pending / error row becomes ok (conditional); a check also stamps an ok row. Returns true on first ok. */
async function markSuccess(row: ConnectionRow, now: Date, check: boolean): Promise<boolean> {
    if (row.status === 'pending' || row.status === 'error') {
        const { count } = await prisma.calendarConnection.updateMany({
            where: { id: row.id, status: row.status },
            data: {
                status: 'ok',
                statusReason: null,
                lastSuccessAt: now,
                lastCheckedAt: now,
                consecutiveFailures: 0,
                lastErrorCode: null,
                lastErrorMessage: null,
                nextCheckAt: null,
            },
        });
        return count === 1;
    }
    if (check) await prisma.calendarConnection.updateMany({ where: { id: row.id, status: 'ok' }, data: { lastSuccessAt: now, lastCheckedAt: now } });
    return false;
}

/**
 * Microsoft: a 403 `ErrorAccessDenied` hits one person. It is the app itself that has no calendar permission (a
 * missing grant, not one person outside the RBAC scope: app-level `no_application_permission`) only when no other
 * live row on the provider is `ok`, and the provider's other recent checks of live rows (up to 10, at least 3) all
 * failed the same way. A tenant that scopes the app with RBAC for Applications keeps its people outside the scope in
 * `error` forever, and only those rows are re-checked (the nightly due checks never re-check an `ok` row), so the
 * newest checks alone would read a few out-of-scope people as the whole app failing.
 */
async function escalatesToApp(row: ConnectionRow, failure: SyncFailure): Promise<boolean> {
    if (row.provider !== 'microsoft' || failure.code !== 'mailbox_out_of_scope') return false;
    const others = { provider: row.provider, id: { not: row.id } };
    if ((await prisma.calendarConnection.count({ where: { ...others, status: 'ok' } })) > 0) return false;
    const recent = await prisma.calendarConnection.findMany({
        where: { ...others, status: { in: [...LIVE_CONNECTION_STATUSES] }, lastCheckedAt: { not: null } },
        select: { status: true, lastErrorCode: true },
        orderBy: { lastCheckedAt: 'desc' },
        take: 10,
    });
    return recent.length >= 3 && recent.every((r) => r.status === 'error' && r.lastErrorCode === 'mailbox_out_of_scope');
}

/** Applies a classified failure (see the file header) and returns the error to throw. */
async function handleFailure(row: ConnectionRow, failure: SyncFailure, original: unknown, now: Date): Promise<unknown> {
    const provider = row.provider as CalendarProvider;
    if (failure.level === 'transient') return original;
    if (failure.level === 'user' && !(await escalatesToApp(row, failure))) {
        await markUserError(row, failure, now);
        return new ConnectionUnavailableError('user_error', failure);
    }
    const appFailure: SyncFailure = failure.level === 'app' ? failure : { ...failure, level: 'app', code: 'no_application_permission' };
    await markProviderUnhealthy(provider, appFailure.code, now);
    return new ConnectionUnavailableError('provider_unhealthy', appFailure);
}

const isUnauthorized = (err: unknown) => err instanceof ProviderError && err.status === 401;

/** See the file header. `fn` gets the call context and the row as read (never a token outside the call). */
export async function withCalendarAccess<T>(connectionId: string, fn: (ctx: CallCtx, row: ConnectionRow) => Promise<T>, options: CalendarAccessOptions = {}): Promise<T> {
    const clock = options.clock ?? (() => new Date());
    const now = clock();
    const row = await prisma.calendarConnection.findUnique({ where: { id: connectionId } });
    if (!row) throw new ConnectionUnavailableError('not_found');
    const provider = row.provider as CalendarProvider;
    if (provider !== 'fake' && !secretBox.ready()) throw new ConnectionUnavailableError('key_missing');
    if (!isLiveStatus(row.status)) throw new ConnectionUnavailableError('not_active');
    const user = await prisma.user.findUnique({ where: { username: row.username }, select: { isActive: true, isGroupUser: true } });
    if (!user || !user.isActive || user.isGroupUser) throw new ConnectionUnavailableError('user_inactive');
    const access = await loadProviderAccess(provider);
    if (!access.enabled) throw new ConnectionUnavailableError('provider_disabled');
    if (!access.configured) throw new ConnectionUnavailableError('key_error');
    const blocked = tokenSource.appBlocked(provider, access.credentialsVersion);
    if (blocked) throw new ConnectionUnavailableError('provider_unhealthy', { level: 'app', code: blocked.code });

    const email = row.accountEmail.toLowerCase();
    const ctxOf = (accessToken: string): CallCtx => ({ accessToken, calendarId: row.calendarId, accountEmail: email, mailbox: email });

    let result: T;
    try {
        try {
            const grant = await tokenSource.getAccessToken(provider, email);
            result = await fn(ctxOf(grant.accessToken), row);
        } catch (err) {
            if (!isUnauthorized(err)) throw err;
            // The provider no longer accepts this token (revoked early, credentials rotated): one fresh token, one retry.
            tokenSource.invalidate(provider, provider === 'microsoft' ? undefined : email);
            const grant = await tokenSource.getAccessToken(provider, email);
            result = await fn(ctxOf(grant.accessToken), row);
        }
    } catch (err) {
        if (err instanceof ConnectionUnavailableError) throw err;
        const failure = err instanceof TokenError ? classifyApiError(provider, err) : classifyApiError(provider, err, { probe: options.check });
        if (!failure) throw err;
        if (options.readOnly && !(err instanceof TokenError) && failure.level !== 'transient') throw new ConnectionUnavailableError('call_refused', failure);
        throw await handleFailure(row, failure, err, clock());
    }

    const firstOk = await markSuccess(row, clock(), Boolean(options.check));
    if (access.healthStatus === 'error') await markProviderHealthy(provider, clock());
    if (firstOk && row.backfilledAt === null) {
        for (const listener of readyListeners) {
            try {
                await listener({ ...row, status: 'ok' });
            } catch (err) {
                logger.warn({ connectionId: row.id, err: (err as Error).message }, 'Calendar ready listener failed');
            }
        }
    }
    return result;
}

export type CheckOutcome = 'ok' | 'user_error' | 'provider_unhealthy' | 'transient' | 'skipped';

/**
 * The per-row health check (`check` job; People table "Check now"; nightly due checks): `probeCalendar` through
 * `withCalendarAccess`. Never throws; the outcome is written on the row / provider by withCalendarAccess.
 */
export async function checkConnection(connectionId: string, clock?: () => Date): Promise<CheckOutcome> {
    try {
        await withCalendarAccess(connectionId, (ctx, row) => getAdapter(row.provider as CalendarProvider).probeCalendar(ctx), { clock, check: true });
        return 'ok';
    } catch (err) {
        if (err instanceof ConnectionUnavailableError) {
            if (err.reason === 'user_error' || err.reason === 'provider_unhealthy') return err.reason;
            logger.info({ connectionId, reason: err.reason }, 'Calendar check skipped');
            return 'skipped';
        }
        logger.warn({ connectionId, err: (err as Error).message }, 'Calendar check failed (will retry)');
        return 'transient';
    }
}
