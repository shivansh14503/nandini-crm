/**
 * An employee's own calendar connections: the contract of `/api/calendar-connections`
 * (backend-crm/src/modules/calendar-sync/connection.routes.ts, docs/api-plan.md). Dependency-free: the backend's
 * contract test (src/validators/contractSync.test.ts) loads this file and compares the constants with its own.
 */

export const CALENDAR_PROVIDERS = ['google', 'microsoft', 'fake'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const CONNECTION_STATUSES = ['active', 'reauth_required', 'error', 'disconnected'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONNECTION_STATUS_REASONS = [
    'invalid_grant',
    'client_changed',
    'grant_expired',
    'key_error',
    'user_inactive',
    'by_user',
    'by_admin',
    'switched_account',
] as const;
export type ConnectionStatusReason = (typeof CONNECTION_STATUS_REASONS)[number];

/** `?calendar=error&reason=<code>` codes of the OAuth callback redirect. */
export const CALLBACK_REASONS = [
    'denied',
    'expired',
    'invalid',
    'scope_denied',
    'email_mismatch',
    'email_too_long',
    'domain_not_allowed',
    'account_in_use',
    'provider_error',
    'not_configured',
    'already_connected',
    'server_error',
] as const;
export type CallbackReason = (typeof CALLBACK_REASONS)[number];

/** What each callback reason tells the user (never provider text). */
export const CALLBACK_REASON_MESSAGES: Record<CallbackReason, string> = {
    denied: 'You cancelled the sign-in, so no calendar was connected.',
    expired: 'The sign-in took too long or was opened in another browser. Please try again.',
    invalid: 'The sign-in could not be verified. Please try again from this page.',
    scope_denied: 'Calendar access was not allowed. Connect again and keep the calendar permission ticked.',
    email_mismatch: 'You signed in with a different account than your CRM email. Connect again with your company account.',
    email_too_long: 'That account address is too long for the CRM. Ask an admin to set your company email first.',
    domain_not_allowed: 'Only company accounts can be connected. Sign in with your work account.',
    account_in_use: 'That calendar account is already connected for another CRM user. Ask an admin for help.',
    provider_error: 'The calendar provider did not finish the sign-in. Please try again in a few minutes.',
    not_configured: 'This calendar provider was switched off by an admin.',
    already_connected: 'You already have a calendar connected. Disconnect it first to connect another one.',
    server_error: 'Something went wrong while connecting. Please try again.',
};

/** Why a connection needs attention, for the user. */
export const STATUS_REASON_MESSAGES: Partial<Record<ConnectionStatusReason, string>> = {
    invalid_grant: 'Your sign-in expired or was removed. Reconnect to keep your calendar in sync.',
    client_changed: "An admin changed the company's calendar app. Reconnect to keep your calendar in sync.",
    grant_expired: 'The time-limited access you gave the CRM has ended. Reconnect to keep your calendar in sync.',
    key_error: 'The CRM can no longer read this connection. Reconnect to fix it.',
};

export interface ProviderOption {
    provider: CalendarProvider;
    label: string;
    kind: 'calendar';
    /** Switched on and configured by an admin. */
    available: boolean;
    /** Disconnecting also ends the grant at the provider (Microsoft: no). */
    canRevoke: boolean;
}

export interface OwnConnection {
    id: string;
    provider: CalendarProvider | (string & {});
    kind: string;
    accountEmail: string;
    status: ConnectionStatus | (string & {});
    statusReason: ConnectionStatusReason | (string & {}) | null;
    connectedAt: string;
    lastPulledAt: string | null;
    lastPushedAt: string | null;
    backfilledAt: string | null;
    backfillCount: number | null;
    importMeetings: boolean;
    importAllowed: boolean;
    pendingPushes: number;
    failedPushes: number;
    /** Time-limited Google grant end; null = no known end. */
    accessEndsAt: string | null;
}

/** `GET /api/calendar-connections`. */
export interface OwnConnections {
    /** The encryption key and public API address are set (else connecting answers 503 INTEGRATIONS_NOT_READY). */
    ready: boolean;
    providers: ProviderOption[];
    connections: OwnConnection[];
    /** The user's company email ('' when none). */
    email: string;
    publicApiUrl: string | null;
    webhooksActive: boolean;
    syncHours: string | null;
    /** False until two-way sync ships: a connection only stores the grant for now. */
    syncActive: boolean;
}

/** A connection the user should act on (reconnect). */
export const needsReconnect = (c: Pick<OwnConnection, 'status'>) => c.status === 'reauth_required' || c.status === 'error';

export const isCallbackReason = (value: string | null | undefined): value is CallbackReason =>
    typeof value === 'string' && (CALLBACK_REASONS as readonly string[]).includes(value);
