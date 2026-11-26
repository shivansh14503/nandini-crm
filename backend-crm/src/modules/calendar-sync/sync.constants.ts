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
    /** A connection row first reached `ok`: push its dirty links (admin model: replaces the per-user `connect` job;
     * the first-sync backfill is P2-3c). */
    enrolled: 'enrolled',
    /** Health check of one connection row (enrolment.ts `checkConnection`). */
    check: 'check',
    poll: 'poll',
    nightly: 'nightly',
} as const;

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
/** Dirty links of one connection pushed per `enrolled` job round (§8.12). */
export const ENROLLED_PUSH_BATCH = 100;
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
 * Background sync window, business timezone (spec D24 / §10.4): the poll scheduler and the Redis-down fallback tick
 * run only inside it, so Azure SQL serverless can pause overnight. Fixed at 07:00–22:00 until P2-5 makes it the
 * `CALENDAR_SYNC_HOURS` setting.
 */
export const SYNC_WINDOW = { startMinute: 7 * 60, endMinute: 22 * 60 } as const;
/** `calendar-poll` scheduler: every 5 minutes 07:00–21:55 (P2-3b: outbox sweep + due connection checks only). */
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
