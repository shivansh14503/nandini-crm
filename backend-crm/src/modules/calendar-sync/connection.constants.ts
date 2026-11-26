/**
 * Fixed vocabulary of employees' calendar connections (Calendar Phase 2 P2-2, spec §3.3 / §3.5 / §4.2). Pure.
 * Mirrored by frontend-crm/src/components/integrations/calendarConnections.types.ts (contractSync.test.ts checks).
 */

/**
 * Application lock (`acquireLocks`) held by every write that must agree with one user's live calendar connection:
 * connect, disconnect, and any change of that user's `Users.email` (People screen, Admin › Users). Keyed by the
 * lower-cased username (SQL Server compares usernames case-insensitively).
 */
export const calendarConnectionUserLockKey = (username: string) => `calendar-connection:user:${username.trim().toLowerCase()}`;

/** Calendar providers an employee can connect. `fake` = the dev-only test provider (CALENDAR_FAKE_PROVIDER). */
export const CALENDAR_PROVIDERS = ['google', 'microsoft', 'fake'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const isCalendarProvider = (value: unknown): value is CalendarProvider =>
    typeof value === 'string' && (CALENDAR_PROVIDERS as readonly string[]).includes(value);

export const CALENDAR_PROVIDER_LABELS: Readonly<Record<CalendarProvider, string>> = {
    google: 'Google Calendar',
    microsoft: 'Microsoft 365 (Outlook)',
    fake: 'Test calendar (development only)',
};

/** active | reauth_required (sign-in expired / app changed) | error | disconnected (row kept, tokens nulled). */
export const CONNECTION_STATUSES = ['active', 'reauth_required', 'error', 'disconnected'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Statuses of a live connection: the hand-written filtered unique indexes cover exactly these. */
export const LIVE_CONNECTION_STATUSES: readonly ConnectionStatus[] = ['active', 'reauth_required', 'error'];

/** `CalendarConnection.statusReason` codes (fixed; the UI maps each to a sentence). */
export const CONNECTION_STATUS_REASONS = [
    /** The provider refused the refresh token (revoked, expired, password change). */
    'invalid_grant',
    /** The company OAuth app changed (client id / tenant): IntegrationProvider.clientVersion moved on. */
    'client_changed',
    /** A time-limited Google grant ended (refreshTokenExpiresAt passed). */
    'grant_expired',
    /** The stored tokens can't be opened with the current INTEGRATIONS_ENCRYPTION_KEY. */
    'key_error',
    /** Disconnected: the CRM user was deactivated (nightly check). */
    'user_inactive',
    /** Disconnected by the employee. */
    'by_user',
    /** Disconnected by an admin (Admin › API Integrations). */
    'by_admin',
    /** Disconnected because the employee connected another account of the same provider. */
    'switched_account',
] as const;
export type ConnectionStatusReason = (typeof CONNECTION_STATUS_REASONS)[number];

/**
 * Reason codes of the OAuth callback redirect (`/profile?tab=connected-accounts&calendar=error&reason=<code>`): fixed codes only,
 * never provider text (no reflected content). The frontend maps each to a sentence.
 */
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

/**
 * Where the OAuth callback sends the browser back to (and where `calendar_reconnect` notifications point): My Profile ›
 * Connected accounts, which hosts CalendarConnectionsCard. It already carries a query (`?tab=`), so the callback appends
 * its params with `&`. Same value as the frontend ROUTES.PROFILE_CONNECTED_ACCOUNTS (contract-tested). The old
 * `/connected-calendars` page only redirects here, keeping its query string.
 */
export const CALENDAR_CONNECTIONS_PAGE = '/profile?tab=connected-accounts';

/** Notification `entityModule` of `calendar_reconnect` (notificationHref maps it to CALENDAR_CONNECTIONS_PAGE). */
export const CALENDAR_CONNECTIONS_ENTITY_MODULE = 'calendar-connections';

/** Sealed, short-lived httpOnly cookie carrying state / PKCE verifier / nonce / origin between start and callback. */
export const OAUTH_COOKIE_NAME = 'crm_oauth';
export const OAUTH_COOKIE_PATH = '/api/calendar-connections/oauth';
export const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;

/** `Users.email` is NVarChar(120): a longer account address can't become a CRM email. */
export const ACCOUNT_EMAIL_MAX_FOR_USER = 120;

/** Best-effort provider calls on disconnect (revoke) wait at most this long. */
export const DISCONNECT_CALL_TIMEOUT_MS = 5_000;

/** Days before a time-limited Google grant ends when the user gets a `calendar_reconnect` notification. */
export const GRANT_EXPIRY_WARNING_DAYS = 3;
