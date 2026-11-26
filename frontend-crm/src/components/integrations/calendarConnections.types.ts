/**
 * An employee's own company calendar sync, read-only: the contract of `GET /api/calendar-connections`
 * (backend-crm/src/modules/calendar-sync/connection.routes.ts, docs/api-plan.md). Calendar sync is set up by admins
 * (Admin › API Integrations); there is nothing to connect or disconnect here. Dependency-free: the backend's contract
 * test (src/validators/contractSync.test.ts) loads this file and compares the constants with its own.
 */

export const CALENDAR_PROVIDERS = ['google', 'microsoft', 'fake'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

/** pending (being set up) | ok | error (a problem only an admin can fix) | paused (the company's sync is paused). */
export const OWN_CALENDAR_STATUSES = ['pending', 'ok', 'error', 'paused'] as const;
export type OwnCalendarStatus = (typeof OWN_CALENDAR_STATUSES)[number];

/** Why the employee's calendar isn't synced. */
export const NOT_SYNCED_REASONS = ['no_email', 'not_company', 'no_provider', 'excluded', 'inactive', 'group'] as const;
export type NotSyncedReason = (typeof NOT_SYNCED_REASONS)[number];

/** What each reason tells the employee (fixed sentences; never provider text). */
export const NOT_SYNCED_REASON_MESSAGES: Record<NotSyncedReason, string> = {
    no_email: "Your CRM account has no company email yet. Ask an admin to add it, and your calendar will sync on its own.",
    not_company: "Your CRM email isn't a company address, so your calendar isn't synced. Ask an admin if this is wrong.",
    no_provider: "Calendar sync isn't set up for your email domain yet.",
    excluded: 'An admin turned calendar sync off for your account.',
    inactive: 'Your account is inactive, so your calendar is not synced.',
    group: "Shared logins don't sync a calendar.",
};

export interface OwnCalendar {
    provider: CalendarProvider | (string & {});
    providerLabel: string;
    accountEmail: string;
    status: OwnCalendarStatus | (string & {});
    /** When this mailbox was enrolled. */
    since: string;
    /** Last successful push or pull; null until sync has run. */
    lastSyncedAt: string | null;
    /** The first-sync copy of upcoming CRM activities (P2-3c). Optional: older servers don't send it. */
    backfill?: OwnCalendarBackfill;
}

/**
 * `waiting`: not run yet (or under way); `done`: `copied` upcoming activities were copied at `at` (private copies when
 * they have guests: nobody was invited). `sending`: changes of this calendar still waiting to be sent.
 */
export interface OwnCalendarBackfill {
    state: 'waiting' | 'done';
    at: string | null;
    copied: number | null;
    sending: number;
}

/** `GET /api/calendar-connections`. */
export interface OwnCalendarSync {
    /** At least one calendar provider is switched on for the company. */
    ready: boolean;
    /** Null = not synced (see `reason`). */
    calendar: OwnCalendar | null;
    reason: NotSyncedReason | null;
}

/** The calendar needs an admin's attention (shown as a quiet notice, never as an action for the employee). */
export const needsAttention = (calendar: Pick<OwnCalendar, 'status'> | null | undefined): boolean =>
    calendar?.status === 'error' || calendar?.status === 'paused';
