/**
 * Fixed vocabulary of employees' company calendars as the CRM syncs them (Calendar Phase 2, admin-managed: P2-2b;
 * design addendum phase2-admin-connect §3–§5). Pure.
 * Mirrored by frontend-crm/src/components/integrations/calendarConnections.types.ts and
 * frontend-crm/src/types/integration.types.ts (contractSync.test.ts checks).
 */

/**
 * Application lock (`acquireLocks`) held by every write that must agree with one user's calendar sync row: the
 * enrolment reconcile (`reconcileUser`) and any change of that user's `Users.email` (People screen, Admin › Users), so
 * an email change and the reconcile that moves the sync to the new mailbox serialize. Keyed by the lower-cased
 * username (SQL Server compares usernames case-insensitively).
 */
export const calendarConnectionUserLockKey = (username: string) => `calendar-connection:user:${username.trim().toLowerCase()}`;

/** Calendar providers the CRM syncs with. `fake` = the dev-only admin-mode test provider (CALENDAR_FAKE_PROVIDER). */
export const CALENDAR_PROVIDERS = ['google', 'microsoft', 'fake'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const isCalendarProvider = (value: unknown): value is CalendarProvider =>
    typeof value === 'string' && (CALENDAR_PROVIDERS as readonly string[]).includes(value);

export const CALENDAR_PROVIDER_LABELS: Readonly<Record<CalendarProvider, string>> = {
    google: 'Google Calendar',
    microsoft: 'Microsoft 365 (Outlook)',
    fake: 'Test calendar (development only)',
};

/** pending (enrolled, not checked yet) | ok | error (a user-level problem) | stopped (row kept for link history). */
export const CONNECTION_STATUSES = ['pending', 'ok', 'error', 'stopped'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Statuses of a live row: the hand-written filtered unique indexes cover exactly these. */
export const LIVE_CONNECTION_STATUSES: readonly ConnectionStatus[] = ['pending', 'ok', 'error'];

export const isLiveStatus = (status: string): boolean => (LIVE_CONNECTION_STATUSES as readonly string[]).includes(status);

/** Why a row was stopped (`statusReason` of a `stopped` row). */
export const STOP_REASONS = ['excluded', 'user_inactive', 'email_changed', 'provider_changed', 'provider_removed', 'no_email', 'oauth_retired'] as const;
export type StopReason = (typeof STOP_REASONS)[number];

/** User-level problems (`statusReason` / `lastErrorCode` of an `error` row): one person, shown on their People row. */
export const USER_ERROR_CODES = ['user_not_found', 'user_unavailable', 'calendar_unavailable', 'mailbox_out_of_scope', 'no_mailbox'] as const;
export type UserErrorCode = (typeof USER_ERROR_CODES)[number];

/** App-level problems (`IntegrationProvider.healthCode`): the whole provider, shown on its card. */
export const APP_ERROR_CODES = [
    'delegation_missing',
    'delegation_wrong_id',
    'scopes_not_authorised',
    'admin_policy',
    'key_invalid',
    'clock_skew',
    'invalid_client',
    'secret_expired',
    'app_not_in_tenant',
    'tenant_not_found',
    'no_application_permission',
    'not_configured',
    'provider_error',
] as const;
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/** Transient problems: retried with backoff, nothing marked. */
export const TRANSIENT_ERROR_CODES = ['rate_limited', 'provider_unavailable', 'network'] as const;
export type TransientErrorCode = (typeof TRANSIENT_ERROR_CODES)[number];

/** How the provider of a row was chosen: the email domain's provider, or the admin's per-person override. */
export const ENROLMENT_SOURCES = ['domain', 'override'] as const;
export type EnrolmentSource = (typeof ENROLMENT_SOURCES)[number];

/** Why a person has no live row (GET /api/calendar-connections `reason`, People table). */
export const NOT_SYNCED_REASONS = ['no_email', 'not_company', 'no_provider', 'excluded', 'inactive', 'group'] as const;
export type NotSyncedReason = (typeof NOT_SYNCED_REASONS)[number];

/** What an employee sees on their own card: the row's status, or `paused` while the provider is off or unhealthy. */
export const OWN_CALENDAR_STATUSES = ['pending', 'ok', 'error', 'paused'] as const;
export type OwnCalendarStatus = (typeof OWN_CALENDAR_STATUSES)[number];

/** Backoff of the next health check after consecutive user-level failures (1st, 2nd, 3rd, 4th and later). */
export const CHECK_BACKOFF_MS: readonly number[] = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
export const nextCheckDelayMs = (consecutiveFailures: number): number =>
    CHECK_BACKOFF_MS[Math.min(Math.max(consecutiveFailures, 1), CHECK_BACKOFF_MS.length) - 1];

/**
 * My Profile › Connected accounts, which hosts CalendarConnectionsCard (status only). Same value as the frontend
 * ROUTES.PROFILE_CONNECTED_ACCOUNTS (contract-tested).
 */
export const CALENDAR_CONNECTIONS_PAGE = '/profile?tab=connected-accounts';

/** Notification `entityModule` of `calendar_sync_issue` (admins; notificationHref maps it to Admin › API Integrations). */
export const ADMIN_INTEGRATIONS_ENTITY_MODULE = 'admin-integrations';
/** The admin page itself (frontend ROUTES.API_INTEGRATIONS). */
export const ADMIN_INTEGRATIONS_PAGE = '/admin/integrations';
/** `entityId` of a user-level digest: opens the People tab filtered to calendar problems. */
export const PEOPLE_CALENDAR_PROBLEMS_ENTITY_ID = 'people:calendar_problem';
