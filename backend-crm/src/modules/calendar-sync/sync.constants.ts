/**
 * Fixed vocabulary and limits of the CRM → calendar push engine (Calendar Phase 2 P2-3b, spec §4.3, §8, §10). Pure.
 * Link states are mirrored by frontend-crm/src/types/activity.types.ts (contractSync.test.ts checks).
 */

/** `ActivityExternalLink.state`. */
export const LINK_STATES = [
    /** Dirty: waiting for the push (or being pushed). */
    'pending',
    /** The calendar holds what the CRM holds. */
    'synced',
    /** The provider refused the last push (or retries ran out); retried on the next CRM edit / nightly / Retry. */
    'error',
    /** The CRM deleted the event (activity cancelled, deleted, owner changed); `externalEventId` kept for a restore. */
    'cancelled',
    /** The event was deleted in the calendar while the activity stays (follow-up / completed activities, §8.9). */
    'removed_remote',
    /** The event became a repeating series in the calendar (D19): the CRM keeps its fields, nothing more is pushed. */
    'unsupported',
    /** The connection row was stopped (excluded, provider changed, user inactive …): the event stays, the link does nothing. */
    'detached',
] as const;
export type LinkState = (typeof LINK_STATES)[number];

/** `ActivityExternalLink.invites`: `withhold` = a private copy without attendees (D41, D23). */
export const LINK_INVITES = ['send', 'withhold'] as const;
export type LinkInvites = (typeof LINK_INVITES)[number];

/** `ActivityExternalLink.role`. */
export const LINK_ROLES = ['organizer', 'attendee'] as const;
export type LinkRole = (typeof LINK_ROLES)[number];

/** Links the outbox never marks dirty again (a stopped connection / a repeating series ended them). */
export const INERT_LINK_STATES: ReadonlySet<string> = new Set<LinkState>(['detached', 'unsupported']);

/** Fixed `lastErrorCode` values of ours (provider codes are stored as the provider sent them). */
export const SYNC_ERROR_CODES = {
    /** Retries of a transient failure ran out; the link stays dirty and is tried again later. */
    retriesExhausted: 'retries_exhausted',
    /** 412 three times in a row: someone keeps editing the event in the calendar. */
    conflictLoop: 'conflict_loop',
    /** The calendar answered with an event we can't read back. */
    badResponse: 'bad_response',
} as const;

/** BullMQ job names on the `crm-calendar-sync` queue. */
export const CALENDAR_SYNC_JOBS = {
    /** Push one dirty link (§8.3 step 5). */
    push: 'push',
    /** A connection row reached `ok`: the first-sync backfill when it has none yet (P2-3c, sync.backfill.ts), then push
     * its dirty links (admin model: replaces the per-user `connect` job). */
    enrolled: 'enrolled',
    /** Health check of one connection row (enrolment.ts `checkConnection`). */
    check: 'check',
    /** Pull one connection's calendar changes (P2-5, §8.7): poll, Sync now, calendar page, nightly re-baseline. */
    pull: 'pull',
    /** Webhook channel of one connection (P2-7, sync.channels.ts): ensure | renew | recreate | stop. */
    watch: 'watch',
    /** A colleague's reply made in the CRM, sent to their calendar (P2-8, sync.rsvp.ts). */
    rsvp: 'rsvp',
    poll: 'poll',
    nightly: 'nightly',
    /** Read the event again until its video link is ready (Calendar Phase 3 P3-1, spec §16.3; sync.conference.ts). */
    conference: 'conference',
} as const;

/** `conference` job: first read this long after the push, then again after each pending answer, at most this many times. */
export const CONFERENCE_CHECK_DELAY_MS = 5_000;
export const CONFERENCE_CHECK_TRIES = 5;

/** A push job waits this long, so quick successive edits collapse into one provider write (§8.3 step 5). */
export const PUSH_JOB_DELAY_MS = 2_000;

/** Per-connection lease (§8.4): held this long, extended every LEASE_EXTEND_MS by long runs. */
export const LEASE_TTL_MS = 120_000;
export const LEASE_EXTEND_MS = 60_000;
/**
 * Lease time a push makes sure it still has before each provider call (extending first when less is left): one call
 * can take up to about 105 s (3 attempts × 15 s timeout, backoff, up to two 30 s in-place `Retry-After` waits,
 * providers/http.ts), so the lease never lapses in the middle of a call.
 */
export const LEASE_CALL_HEADROOM_MS = 110_000;
/** A job that finds the lease taken is moved back this long (+ jitter), without spending an attempt. */
export const LEASE_RETRY_DELAY_MS = 5_000;

/** The outbox sweep pushes links dirty for longer than this (the after-commit wake-up normally got them first). */
export const OUTBOX_SWEEP_GRACE_MS = 2 * 60_000;
/** Links pushed per sweep (§10.1). */
export const OUTBOX_SWEEP_LIMIT = 200;
/** Links pushed inline per fallback tick while Redis is down (§10.2). */
export const FALLBACK_PUSH_LIMIT = 20;
/** Dirty links of one connection pushed per `enrolled` job round (§8.12; spec's CONNECT_PUSH_BATCH). */
export const ENROLLED_PUSH_BATCH = 100;
/** Upcoming activities read per page by the first-sync backfill (P2-3c, sync.backfill.ts). */
export const BACKFILL_PAGE_SIZE = 200;
/**
 * A row that reached `ok` this long ago without a backfill (its `enrolled` job was lost: Redis restarted, the worker
 * was down) gets the job again from the poll tick (P2-3c; addendum §8.1 "lost-connect recovery").
 */
export const BACKFILL_RECOVERY_GRACE_MS = 10 * 60_000;
/** Rows re-queued per poll tick by that recovery; one is backfilled in-process per fallback tick while Redis is down. */
export const BACKFILL_RECOVERY_LIMIT = 50;
/** A link whose connection can't push right now (row in error, provider off or unhealthy, user inactive) is put back
 * this long, so the sweep doesn't retry it every tick. The `enrolled` job ignores it. */
export const GATED_RETRY_MS = 15 * 60_000;
/** Due connection checks enqueued per poll tick. */
export const CHECK_SWEEP_LIMIT = 200;

/** 412 → merge → retry loops of one push before the link goes to `error` (§8.6 step 6). */
export const MAX_PRECONDITION_LOOPS = 3;
/**
 * A push that failed with a transient error is put back this long while BullMQ retries it (30 s, 60 s, 120 s, 240 s:
 * about 7.5 minutes), so the outbox sweep doesn't queue a second retry chain for the same link.
 */
export const TRANSIENT_RETRY_HOLD_MS = 10 * 60_000;
/** After the last BullMQ attempt: next try in min(15 min × attempts, 6 h) (§8.6 step 8). */
export const ERROR_RETRY_STEP_MS = 15 * 60_000;
export const ERROR_RETRY_MAX_MS = 6 * 60 * 60_000;

/** An activity is created in a calendar only when it ends after now − this (§8.3 step 3, §9.1). */
export const CREATE_ELIGIBLE_PAST_MS = 24 * 60 * 60_000;
/** Zero-length activities (Email, WhatsApp, a call logged at one instant) go out as 15-minute blocks (D5). */
export const ZERO_LENGTH_EVENT_MINUTES = 15;
/** All-day reminders: the CRM reminds at 09:00 (ALL_DAY_REMINDER_TIME), i.e. 540 minutes after midnight. */
export const ALL_DAY_REMINDER_OFFSET_MINUTES = 9 * 60;
/** Google `reminders.overrides[].minutes` range [V]. */
export const MAX_REMINDER_MINUTES = 40_320;

/**
 * Default background sync window, business timezone (spec D24 / §10.4). Since P2-5 the window is the
 * `CALENDAR_SYNC_HOURS` setting (syncHours.ts); this is its default.
 */
export const SYNC_WINDOW = { startMinute: 7 * 60, endMinute: 22 * 60 } as const;
/**
 * Default `calendar-poll` pattern (every 5 minutes 07:00–21:55). Since P2-5 the worker builds it from
 * `CALENDAR_SYNC_HOURS` / `CALENDAR_POLL_MINUTES` (`pollCron()`); each tick pulls, sweeps the outbox and runs due checks.
 */
export const POLL_PATTERN = '*/5 7-21 * * *';
/** `calendar-nightly` scheduler: 00:25, right after `reminder-nightly` (00:20), inside the existing 00:05–00:25 nightly wake. */
export const NIGHTLY_PATTERN = '25 0 * * *';
export const POLL_SCHEDULER = 'calendar-poll';
export const NIGHTLY_SCHEDULER = 'calendar-nightly';

/** Redis key of the worker heartbeat (`SET … EX 120` every minute): Admin › API Integrations "Sync worker". */
export const WORKER_HEARTBEAT_KEY = 'calendar:worker:heartbeat';
export const WORKER_HEARTBEAT_TTL_SECONDS = 120;
export const WORKER_HEARTBEAT_EVERY_MS = 60_000;

/** Audit origin route of every sync write (§3.6): `changedBy` is the employee whose calendar changed. */
export const syncAuditRoute = (provider: string) => `job:calendar-sync:${provider}`;

/** Private marker on every event the CRM writes (Google extended property / Graph single-value property value). */
export const CRM_SOURCE_MARKER = 'nandini-crm';
/** Graph single-value extended property holding the activity id [U: syntax, first-run check §21.2 #7]. */
export const GRAPH_MARKER_PROPERTY_ID = 'String {00020329-0000-0000-C000-000000000046} Name NandiniCrmActivityId';

/** Display limits on the provider side (Google `summary` / Graph `subject` and `location`). */
export const SUBJECT_MAX = 200;
export const LOCATION_MAX = 250;

// ── Pull (Calendar → CRM, P2-5, spec §8.7–§8.11) ───────────────────────────────────────────────────────────────

/**
 * Reasons a pull runs (job data, logs). P2-7: `webhook` (a verified Google / Graph change notification) and `missed`
 * (Graph said notifications were missed or the subscription was removed; the delta cursor covers the gap).
 */
export const PULL_REASONS = ['poll', 'manual', 'page', 'admin', 'rebaseline', 'enrolled', 'webhook', 'missed'] as const;
export type PullReason = (typeof PULL_REASONS)[number];

/** Full sync window: from now − 7 days (Google `timeMin`; Graph `startDateTime`) … */
export const PULL_PAST_DAYS = 7;
/** … to now + 400 days (Graph `endDateTime`; Google lists without an end). */
export const PULL_FUTURE_DAYS = 400;
/** Graph delta windows are re-baselined by the nightly job (a new full sync) this many days after their full sync. */
export const GRAPH_REBASELINE_DAYS = 30;
/** Full sync safety (§8.11): unseen synced links are read back one by one, at most this many per run. */
export const VERIFY_MISSING_LIMIT = 50;
/** Pages of one pull (a runaway change stream stops here; the cursor isn't advanced, the next pull continues). */
export const MAX_PULL_PAGES = 200;
/** Connections pulled in-process per fallback tick while Redis is down (§10.2). */
export const FALLBACK_PULL_LIMIT = 5;
/** "Sync now" (the employee's own, and the admin's per person): a pull no sooner than this after the last one. */
export const MANUAL_PULL_MIN_INTERVAL_MS = 30_000;
/** Opening the calendar page pulls silently at most once per this long per person. */
export const PAGE_PULL_MIN_INTERVAL_MS = 3 * 60_000;
/** A pull whose events keep failing to apply holds its cursor back this many runs, then moves on (logged). */
export const PULL_HOLD_CURSOR_RUNS = 3;

/** Link `lastErrorCode` for a calendar event longer than 31 days (D20: the CRM keeps its times; the link stays synced). */
export const TOO_LONG_CODE = 'too_long';
export const TOO_LONG_MESSAGE = 'Longer than 31 days in the calendar; the CRM keeps its own times.';
/** Start of the link note when a follow-up activity was made all-day in the calendar (§11.5; kept through pushes for a week). */
export const FOLLOW_UP_TIME_KEPT_PREFIX = 'Follow-ups keep a time';
export const FOLLOW_UP_NOTE_DAYS = 7;

/** Answers of an on-demand pull (Sync now, the page pull, the admin's Sync now); mirrored by the frontend (contract test). */
export const PULL_REQUEST_STATUSES = ['queued', 'done', 'recent', 'busy', 'not_synced', 'not_ready', 'failed', 'off'] as const;
export type PullRequestStatus = (typeof PULL_REQUEST_STATUSES)[number];

// ── Customer-meeting import and replies (P2-8, sync.import.ts / sync.rsvp.ts) ──

/** `createdBy` of an imported activity, and the actor of the nightly auto-complete (spec §13.1, §10.1 step 6). */
export const CALENDAR_SYNC_ACTOR = 'calendar-sync';
/** An unknown meeting is imported only when it starts inside [now − 1 day, now + 180 days] (D17). */
export const IMPORT_PAST_MS = 24 * 60 * 60_000;
export const IMPORT_FUTURE_DAYS = 180;
/** Subject of an imported meeting without one. */
export const IMPORT_UNTITLED = '(No title)';
/** Rows per query chunk of the import's page lookups (SQL Server's 2,100 parameter cap). */
export const IMPORT_LOOKUP_CHUNK = 500;
/** Imported activities auto-completed per nightly batch (§10.1 step 6). */
export const AUTO_COMPLETE_BATCH = 200;
/** Without Redis, an in-process reply runs at most this many times (busy lease, rate limit, transient failure). */
export const INLINE_RSVP_ATTEMPTS = 5;
/** Wait before trying an in-process reply again after a transient failure (× the attempt number). */
export const INLINE_RSVP_RETRY_MS = 15_000;
/** Link error of a reply the calendar refused (P2-8; first-run check F3 on Google). */
export const RSVP_REFUSED_CODE = 'rsvp_refused';
export const RSVP_REFUSED_MESSAGE = 'The calendar refused this reply. Your reply is saved in the CRM only.';
/** Link error of a reply that could not be sent for another reason (event gone, not on the guest list). */
export const RSVP_FAILED_CODE = 'rsvp_failed';
export const RSVP_FAILED_MESSAGE = 'This reply could not be sent to the calendar (the invitation is gone there). It is saved in the CRM.';
