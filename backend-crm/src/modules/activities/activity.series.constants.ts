/**
 * Limits of recurring activities (Calendar Phase 4, activity.series.ts). A leaf module (no imports), so the calendar
 * outbox (calendar-sync/sync.outbox.ts) reads the sync window without importing activity code.
 */

/** Occurrences exist this many days ahead of today (business time zone); the nightly job keeps the horizon there. */
export const SERIES_HORIZON_DAYS = 90;
/** Most occurrences one transaction creates (a daily series over the horizon is 91). */
export const SERIES_MAX_ROWS_PER_RUN = 120;
/** Series whose horizon the nightly job extends per night (oldest horizon first). */
export const SERIES_NIGHTLY_BATCH = 50;
/**
 * Invitation flood control: an occurrence starting more than this many days ahead gets no calendar copy (and no
 * invitation) yet; the nightly job marks occurrences as they come inside the window.
 */
export const SERIES_SYNC_WINDOW_DAYS = 14;
export const SERIES_SYNC_WINDOW_MS = SERIES_SYNC_WINDOW_DAYS * 24 * 60 * 60_000;
/** Occurrences the nightly job marks for calendar sync per transaction (one batch). */
export const SERIES_SYNC_BATCH = 200;
/**
 * Batches the nightly job runs per night (inside the same 00:20 wake) until nothing is left to mark: at most
 * SERIES_SYNC_BATCH × SERIES_SYNC_MAX_ROUNDS (2,000) occurrences a night. More than that logs a warning; the rest are
 * marked the next night (earliest first), so the window absorbs a backlog of up to 13 nights.
 */
export const SERIES_SYNC_MAX_ROUNDS = 10;
