import { z } from 'zod';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import { secretBox } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { notify } from '../notifications/notification.producer.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { normalizeUserEmail } from '../users/userEmail.service.js';
import {
    CALENDAR_PROVIDER_LABELS,
    CALENDAR_PROVIDERS,
    CONNECTION_STATUSES,
    GRANT_EXPIRY_WARNING_DAYS,
    LIVE_CONNECTION_STATUSES,
    type CalendarProvider,
    type ConnectionStatusReason,
} from './connection.constants.js';
import { reconnectNotification } from './connection.notifications.js';
import { openToken, type ConnectionRow } from './connectionTokens.js';
import { getAdapter, isFakeProviderEnabled, loadConnectCredentials } from './providers/registry.js';
import type { ProviderCredentials } from './providers/types.js';

/**
 * Employees' calendar connections (Calendar Phase 2 P2-2, spec §3.5, §6.3): the own list, disconnect (by the user, an
 * admin, or the nightly check for inactive users), the admin connections list, and `hasActiveCalendarConnection`.
 * DTOs never carry a token or the sync cursor. Disconnect keeps the row (tokens nulled, status `disconnected`) so a
 * reconnect of the same account re-activates it; events already in the calendar stay there.
 */

// ── DTOs ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface OwnConnectionDto {
    id: string;
    provider: string;
    kind: string;
    accountEmail: string;
    status: string;
    statusReason: string | null;
    connectedAt: string;
    lastPulledAt: string | null;
    lastPushedAt: string | null;
    backfilledAt: string | null;
    backfillCount: number | null;
    importMeetings: boolean;
    /** The admin allows customer-meeting import (P2-8); false until then. */
    importAllowed: boolean;
    /** Activities waiting to go to the calendar / that failed (P2-3); 0 until then. */
    pendingPushes: number;
    failedPushes: number;
    /** Google time-limited grant end; null = no known end. */
    accessEndsAt: string | null;
}

export interface ProviderOptionDto {
    provider: CalendarProvider;
    label: string;
    kind: 'calendar';
    /** Switched on and configured by an admin (the fake: CALENDAR_FAKE_PROVIDER). */
    available: boolean;
    /** Whether disconnecting ends the grant at the provider (Microsoft: no, remove the app at myapps.microsoft.com). */
    canRevoke: boolean;
}

export interface OwnConnectionsDto {
    /** INTEGRATIONS_ENCRYPTION_KEY and the public API address are set. */
    ready: boolean;
    providers: ProviderOptionDto[];
    connections: OwnConnectionDto[];
    /** The caller's company email ('' when none): the account they must sign in with. */
    email: string;
    publicApiUrl: string | null;
    webhooksActive: boolean;
    /** Business-time window of background sync (P2-5); null until sync ships. */
    syncHours: string | null;
    /** Sync between the CRM and calendars is live (P2-3); false: a connection only stores the grant for now. */
    syncActive: boolean;
}

export interface AdminConnectionDto {
    id: string;
    username: string;
    fullName: string;
    provider: string;
    kind: string;
    accountEmail: string;
    status: string;
    statusReason: string | null;
    connectedAt: string;
    disconnectedAt: string | null;
    disconnectedBy: string | null;
    lastPulledAt: string | null;
    lastPushedAt: string | null;
    lastErrorCode: string | null;
    consecutiveFailures: number;
    pendingPushes: number;
    failedPushes: number;
    accessEndsAt: string | null;
    /** Webhook channel (P2-7); null until then. */
    webhook: { active: boolean; expiresAt: string | null } | null;
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** Columns a DTO may read: never a token, the cursor or the lease. */
const PUBLIC_SELECT = {
    id: true,
    username: true,
    provider: true,
    kind: true,
    accountEmail: true,
    status: true,
    statusReason: true,
    connectedAt: true,
    disconnectedAt: true,
    disconnectedBy: true,
    lastPulledAt: true,
    lastPushedAt: true,
    lastErrorCode: true,
    consecutiveFailures: true,
    backfilledAt: true,
    backfillCount: true,
    importMeetings: true,
    refreshTokenExpiresAt: true,
} as const;

type PublicRow = Pick<ConnectionRow, keyof typeof PUBLIC_SELECT>;

export function toOwnConnectionDto(row: PublicRow): OwnConnectionDto {
    return {
        id: row.id,
        provider: row.provider,
        kind: row.kind,
        accountEmail: row.accountEmail,
        status: row.status,
        statusReason: row.statusReason,
        connectedAt: row.connectedAt.toISOString(),
        lastPulledAt: iso(row.lastPulledAt),
        lastPushedAt: iso(row.lastPushedAt),
        backfilledAt: iso(row.backfilledAt),
        backfillCount: row.backfillCount,
        importMeetings: row.importMeetings,
        importAllowed: false,
        pendingPushes: 0,
        failedPushes: 0,
        accessEndsAt: iso(row.refreshTokenExpiresAt),
    };
}

export function toAdminConnectionDto(row: PublicRow, fullName: string): AdminConnectionDto {
    return {
        id: row.id,
        username: row.username,
        fullName: fullName || row.username,
        provider: row.provider,
        kind: row.kind,
        accountEmail: row.accountEmail,
        status: row.status,
        statusReason: row.statusReason,
        connectedAt: row.connectedAt.toISOString(),
        disconnectedAt: iso(row.disconnectedAt),
        disconnectedBy: row.disconnectedBy,
        lastPulledAt: iso(row.lastPulledAt),
        lastPushedAt: iso(row.lastPushedAt),
        lastErrorCode: row.lastErrorCode,
        consecutiveFailures: row.consecutiveFailures,
        pendingPushes: 0,
        failedPushes: 0,
        accessEndsAt: iso(row.refreshTokenExpiresAt),
        webhook: null,
    };
}

// ── Disconnect ────────────────────────────────────────────────────────────────────────────────────────────────

/** A grant to end at the provider after the transaction commits (best effort, never blocks the disconnect). */
export interface RevokeTask {
    provider: CalendarProvider;
    token: string;
    connectionId: string | null;
    /** Already loaded (the connect flow has them); otherwise loaded when the task runs. */
    creds?: ProviderCredentials;
}

/** Ends a grant at the provider; logs and swallows every failure (5 s timeout in the adapters). */
export async function revokeQuietly(task: RevokeTask): Promise<void> {
    try {
        const adapter = getAdapter(task.provider);
        if (!adapter.canRevoke) return;
        const creds = task.creds ?? (await loadConnectCredentials(task.provider)).creds;
        if (!creds) {
            logger.warn({ provider: task.provider, connectionId: task.connectionId }, 'Calendar grant not revoked: the provider is not configured');
            return;
        }
        await adapter.revoke({ creds, token: task.token });
    } catch (err) {
        logger.warn({ provider: task.provider, connectionId: task.connectionId, err: (err as Error).message }, 'Calendar grant revoke failed (tokens were dropped anyway)');
    }
}

export type DisconnectBy = 'user' | 'admin' | 'system';

export interface DisconnectOptions {
    /** Username written to `disconnectedBy` and the audit entry ('system' for the nightly check). */
    actor: string;
    by: DisconnectBy;
    reason: Extract<ConnectionStatusReason, 'by_user' | 'by_admin' | 'user_inactive' | 'switched_account'>;
    /** Admin's free-text note (≤ 200), audited. */
    note?: string;
    now?: Date;
}

/**
 * Disconnects a live row inside the caller's transaction: tokens nulled, status `disconnected`, audited
 * `CalendarConnection DISCONNECT`. Returns the grant to revoke after commit (null when there is nothing to revoke or
 * the tokens can't be opened). Links (P2-3) become `detached` and channels (P2-7) `stopped` here too.
 */
export async function disconnectInTransaction(tx: TransactionClient, row: ConnectionRow, options: DisconnectOptions): Promise<RevokeTask | null> {
    const now = options.now ?? new Date();
    let token: string | null = null;
    try {
        token = secretBox.ready() ? (openToken(row, 'refreshToken') ?? openToken(row, 'accessToken')) : null;
    } catch {
        token = null;
    }
    await tx.calendarConnection.update({
        where: { id: row.id },
        data: {
            status: 'disconnected',
            statusReason: options.reason,
            accessTokenEnc: null,
            accessTokenExpiresAt: null,
            refreshTokenEnc: null,
            keyId: null,
            leaseId: null,
            leaseUntil: null,
            disconnectedAt: now,
            disconnectedBy: options.actor,
        },
    });
    await auditService.record(tx, {
        entityType: 'CalendarConnection',
        entityId: row.id,
        action: 'DISCONNECT',
        changedBy: options.actor,
        changes: {
            provider: row.provider,
            accountEmail: row.accountEmail,
            by: options.actor,
            reason: options.reason,
            ...(options.note ? { note: options.note } : {}),
        },
    });
    return token ? { provider: row.provider as CalendarProvider, token, connectionId: row.id } : null;
}

/**
 * Disconnects one connection (user: only their own, else 404; admin: any). Already disconnected = no-op. The
 * provider revoke runs after commit and never fails the request.
 */
async function disconnectOne(id: string, options: DisconnectOptions & { ownerUsername?: string }): Promise<void> {
    const peek = await prisma.calendarConnection.findUnique({ where: { id }, select: { username: true } });
    if (!peek || (options.ownerUsername !== undefined && peek.username.toLowerCase() !== options.ownerUsername.toLowerCase())) {
        throw HttpError.notFound('Calendar connection not found.');
    }
    const task = await runInTransaction(async (tx) => {
        await acquireLocks(tx, [`calendar-connection:user:${peek.username.toLowerCase()}`]);
        const row = await tx.calendarConnection.findUnique({ where: { id } });
        if (!row || !(LIVE_CONNECTION_STATUSES as readonly string[]).includes(row.status)) return null;
        return disconnectInTransaction(tx, row, options);
    });
    if (task) await revokeQuietly(task);
    logger.info({ connectionId: id, by: options.by, reason: options.reason }, 'Calendar disconnected');
}

// ── Queries ───────────────────────────────────────────────────────────────────────────────────────────────────

export const adminConnectionsQuerySchema = z.object({
    provider: z.enum(CALENDAR_PROVIDERS).optional().catch(undefined),
    /** `live` (default) = active, reauth_required and error. */
    status: z.enum(['live', 'all', ...CONNECTION_STATUSES]).optional().catch(undefined),
    search: z.string().trim().max(100).optional().catch(undefined),
});

export const adminDisconnectBodySchema = z
    .object({ reason: z.string().trim().max(200, { message: 'Reason cannot exceed 200 characters.' }).optional() })
    .strict();

const ADMIN_LIST_LIMIT = 1000;

export const connectionService = {
    /** GET /api/calendar-connections: the caller's live connections and the providers they may connect. */
    async listOwn(user: AuthUser): Promise<OwnConnectionsDto> {
        const [account, rows] = await Promise.all([
            prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }),
            prisma.calendarConnection.findMany({
                where: { username: user.username, status: { in: [...LIVE_CONNECTION_STATUSES] } },
                select: PUBLIC_SELECT,
                orderBy: { connectedAt: 'desc' },
            }),
        ]);
        const keys: CalendarProvider[] = isFakeProviderEnabled() ? ['google', 'microsoft', 'fake'] : ['google', 'microsoft'];
        const apps = await Promise.all(keys.map((key) => loadConnectCredentials(key)));
        const providers = apps
            .map((app): ProviderOptionDto => ({
                provider: app.provider,
                label: CALENDAR_PROVIDER_LABELS[app.provider],
                kind: 'calendar',
                available: app.enabled && app.configured,
                canRevoke: getAdapter(app.provider).canRevoke,
            }))
            // Providers an admin never switched on are left out (a connected one always stays visible).
            .filter((p) => p.available || rows.some((row) => row.provider === p.provider));
        return {
            ready: ENV.INTEGRATIONS.READY_REASON === null,
            providers,
            connections: rows.map(toOwnConnectionDto),
            email: normalizeUserEmail(account?.email) ?? '',
            publicApiUrl: ENV.INTEGRATIONS.PUBLIC_API_URL,
            webhooksActive: false,
            syncHours: null,
            syncActive: false,
        };
    },

    /** POST /api/calendar-connections/:id/disconnect (own connection only). */
    async disconnectOwn(id: string, user: AuthUser): Promise<void> {
        await disconnectOne(id, { actor: user.username, by: 'user', reason: 'by_user', ownerUsername: user.username });
    },

    /** POST /api/admin/integrations/connections/:id/disconnect (audited with the admin as actor). */
    async adminDisconnect(id: string, body: unknown, admin: AuthUser): Promise<void> {
        const { reason } = adminDisconnectBodySchema.parse(body ?? {});
        await disconnectOne(id, { actor: admin.username, by: 'admin', reason: 'by_admin', ...(reason ? { note: reason } : {}) });
    },

    /** GET /api/admin/integrations/connections. */
    async adminList(query: unknown = {}): Promise<AdminConnectionDto[]> {
        const { provider, status, search } = adminConnectionsQuerySchema.parse(query ?? {});
        const statusFilter = !status || status === 'live' ? { in: [...LIVE_CONNECTION_STATUSES] } : status === 'all' ? undefined : status;
        const rows = await prisma.calendarConnection.findMany({
            where: { ...(provider ? { provider } : {}), ...(statusFilter ? { status: statusFilter } : {}) },
            select: PUBLIC_SELECT,
            orderBy: [{ status: 'asc' }, { connectedAt: 'desc' }],
            take: ADMIN_LIST_LIMIT,
        });
        const usernames = [...new Set(rows.map((r) => r.username))];
        const users = usernames.length
            ? await prisma.user.findMany({ where: { username: { in: usernames } }, select: { username: true, fullName: true } })
            : [];
        const names = new Map(users.map((u) => [u.username.toLowerCase(), u.fullName]));
        const needle = search?.toLowerCase();
        return rows
            .map((row) => toAdminConnectionDto(row, names.get(row.username.toLowerCase()) ?? ''))
            .filter((dto) => !needle || [dto.username, dto.fullName, dto.accountEmail].some((v) => v.toLowerCase().includes(needle)));
    },

    /** Nightly: disconnects (and revokes) live connections of users who are inactive, group logins or gone. */
    async disconnectInactiveUsers(now: Date = new Date()): Promise<number> {
        const live = await prisma.calendarConnection.findMany({ where: { status: { in: [...LIVE_CONNECTION_STATUSES] } }, select: { id: true, username: true } });
        if (live.length === 0) return 0;
        const usernames = [...new Set(live.map((row) => row.username))];
        const active = await prisma.user.findMany({ where: { username: { in: usernames }, isActive: true, isGroupUser: false }, select: { username: true } });
        const keep = new Set(active.map((u) => u.username.toLowerCase()));
        let done = 0;
        for (const row of live) {
            if (keep.has(row.username.toLowerCase())) continue;
            try {
                await disconnectOne(row.id, { actor: 'system', by: 'system', reason: 'user_inactive', now });
                done += 1;
            } catch (err) {
                logger.warn({ connectionId: row.id, err: (err as Error).message }, 'Nightly disconnect of an inactive user failed');
            }
        }
        return done;
    },

    /**
     * Nightly: `calendar_reconnect` 3 days before a time-limited Google grant ends (one per connection, dedupe
     * `calendar_reconnect:<id>:expiring`).
     */
    async notifyExpiringGrants(now: Date = new Date()): Promise<number> {
        const horizon = new Date(now.getTime() + GRANT_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);
        const rows = await prisma.calendarConnection.findMany({
            where: { status: 'active', refreshTokenExpiresAt: { not: null, gt: now, lte: horizon } },
            select: { id: true, username: true, provider: true, refreshTokenExpiresAt: true },
        });
        if (rows.length === 0) return 0;
        const { created } = await notify(rows.map((row) => reconnectNotification(row, 'expiring', now, row.refreshTokenExpiresAt)));
        return created;
    },
};

/**
 * Whether a user has a working calendar connection (active, and the user still active). The morning email will use it
 * (parked by the owner, spec D29) to leave out its "Add to Google Calendar" links for connected users.
 */
export async function hasActiveCalendarConnection(username: string): Promise<boolean> {
    const [row, user] = await Promise.all([
        prisma.calendarConnection.findFirst({ where: { username, kind: 'calendar', status: 'active' }, select: { id: true } }),
        prisma.user.findUnique({ where: { username }, select: { isActive: true } }),
    ]);
    return Boolean(row && user?.isActive);
}

/** Nightly calendar steps run from the reminders worker's nightly job until the calendar worker exists (P2-3b). */
export async function runCalendarConnectionNightly(now: Date = new Date()): Promise<{ disconnected: number; expiring: number }> {
    let disconnected = 0;
    let expiring = 0;
    try {
        disconnected = await connectionService.disconnectInactiveUsers(now);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Nightly calendar disconnect of inactive users failed');
    }
    try {
        expiring = await connectionService.notifyExpiringGrants(now);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Nightly calendar access-ending notifications failed');
    }
    return { disconnected, expiring };
}
