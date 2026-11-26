/**
 * Fixed vocabulary and limits of busy times (Calendar Phase 2, P2-6: spec §12, adapted to admin-managed connections by
 * addendum §8.5). Pure. Mirrored by frontend-crm/src/types/activity.types.ts (contractSync.test.ts checks).
 */

/** What a block means: `busy` (a meeting), `tentative` (maybe), `away` (out of office; an all-day Site Visit). */
export const BUSY_KINDS = ['busy', 'tentative', 'away'] as const;
export type BusyKind = (typeof BUSY_KINDS)[number];

/**
 * How much the CRM knows about one person:
 *   - `ok`: CRM activities plus their company calendar;
 *   - `not_connected`: CRM activities only (not enrolled: no company email, excluded by an admin, provider off);
 *   - `error`: CRM activities only (their calendar sync has a problem an admin has been told about, the provider is
 *     unhealthy, or the provider refused to read their calendar just now: a refusal here marks nothing);
 *   - `unavailable`: CRM activities only (the calendar didn't answer in time just now, or the request's provider
 *     budget or deadline ran out);
 *   - `unknown`: no active, non-group user by that name (nothing is returned for them).
 */
export const BUSY_PERSON_STATUSES = ['ok', 'not_connected', 'error', 'unavailable', 'unknown'] as const;
export type BusyPersonStatus = (typeof BUSY_PERSON_STATUSES)[number];

/** Where a person's blocks came from. */
export const BUSY_SOURCES = ['crm', 'google', 'microsoft', 'fake'] as const;
export type BusySource = (typeof BUSY_SOURCES)[number];

/** People per request (`users`, 1–20: Graph `getSchedule` takes at most 20 schedules). */
export const BUSY_MAX_USERS = 20;
/** Longest window (`to − from`). */
export const BUSY_MAX_RANGE_DAYS = 31;
/** `suggest` (the slot length, minutes) bounds. */
export const BUSY_SUGGEST_MIN_MINUTES = 5;
export const BUSY_SUGGEST_MAX_MINUTES = 1440;

/** "Find a free time": business hours searched (business timezone), the grid and how many days ahead. */
export const BUSY_WORKING_HOURS = '09:00-19:00';
export const BUSY_SUGGEST_STEP_MINUTES = 15;
export const BUSY_SUGGEST_DAYS = 7;

/** A zero-length timed activity (Email, WhatsApp) blocks this long, as it goes to calendars (spec D5). */
export const ZERO_LENGTH_BLOCK_MINUTES = 15;

/** Requests per user per minute (Redis; an in-process counter while Redis can't count, so providers are never unlimited). */
export const BUSY_RATE_LIMIT = 60;
export const BUSY_RATE_WINDOW_SECONDS = 60;

/**
 * Provider calls per user per minute, whatever the number of requests (Redis; an in-process counter while Redis can't
 * count). Past it the calendar part of the people not yet read is `unavailable` (the CRM part is still returned).
 */
export const BUSY_PROVIDER_CALL_BUDGET = 120;

/**
 * The window the CRM and the providers are asked for (and the caches are keyed on) is widened to this grid: `from`
 * down, `to` up; the answer is clipped back to the asked window. A window moved by a few ms or minutes hits the cache.
 */
export const BUSY_CACHE_GRID_MINUTES = 15;

/** Provider part per person and window (Redis, or an in-process memo while Redis is down). */
export const BUSY_PROVIDER_CACHE_SECONDS = 60;
/** CRM part per people set and window (Redis only, guarded: every activity write drops it). */
export const BUSY_CRM_CACHE_SECONDS = 30;

/**
 * Provider calls: at most this many at once per request, each this long at most, each covering at most 14 days; no
 * call starts after the request's deadline, and people still unread at the deadline are `unavailable`.
 */
export const BUSY_PROVIDER_PARALLEL = 5;
export const BUSY_PROVIDER_TIMEOUT_MS = 5_000;
export const BUSY_PROVIDER_DEADLINE_MS = 8_000;
export const BUSY_PROVIDER_WINDOW_DAYS = 14;
/** Calendars per call: Google `freeBusy` (`calendarExpansionMax` 50), Graph `getSchedule` (20). */
export const BUSY_BATCH_SIZE: Readonly<Record<'google' | 'microsoft' | 'fake', number>> = { google: 50, microsoft: 20, fake: 50 };

/** CRM activities read per request (a cap far above what 20 people book in 31 days; a hit is logged). */
export const BUSY_CRM_ROW_CAP = 5_000;
