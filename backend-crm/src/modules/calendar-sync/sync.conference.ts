import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { calendarSyncQueue, tryEnqueue } from '../../jobs/queues.js';
import { SERIES_SYNC_WINDOW_MS } from '../activities/activity.series.constants.js';
import { ConnectionUnavailableError, withCalendarAccess } from './calendarAccess.js';
import { isCalendarProvider } from './connection.constants.js';
import {
    conferenceOutcome,
    conferenceWriteFor,
    failedConferenceColumns,
    type ActivityConference,
    type ConferenceErrorCode,
    type ConferenceOutcome,
    type ConferenceWrite,
} from './conference.rules.js';
import { getAdapter } from './providers/registry.js';
import { CALENDAR_SYNC_JOBS, CONFERENCE_CHECK_DELAY_MS, CONFERENCE_CHECK_TRIES } from './sync.constants.js';
import { conferenceJobId } from './sync.keys.js';
import type { CrmShape, FieldGroup, ProviderEvent } from './sync.shapes.js';
import { wakePushes } from './sync.wake.js';

/**
 * Video meetings in the push engine (Calendar Phase 3, P3-1; spec §16.3). Kept apart from sync.push.ts, which calls
 * its hooks: `conferenceForCreate` / `conferenceForPatch` (what the provider write carries), `settleConference` (what
 * the answer means for the activity, and the base the link stores), `conferenceRefused` (the provider refused the
 * write because of the video part) and `afterConference` (the next read, the join details push).
 *
 * - Google Meet: the write carries `conferenceData.createRequest` (`conferenceDataVersion=1`). Google often answers
 *   `pending`; then a `conference` job reads the event again 5 s later (up to 5 tries; then `failed
 *   conference_timeout`, which the drawer's Retry asks again with a new request number).
 * - Microsoft Teams: `isOnlineMeeting` on the create; the join URL comes on the answer (an answer without a Teams
 *   meeting is `failed not_created`: Graph doesn't add one later).
 * - A 400 to a write that asked for a link (e.g. Meet turned off for the organisation): the link is marked `failed
 *   not_created` and the write is sent again without the video part, so the event itself still syncs.
 * - Every way a wait ends is final: a read that can't be made (connection paused, provider error) uses up a try, a
 *   missing event is `failed no_event`, the worker's last attempt and the nightly sweep (`failStaleConferences`: still
 *   `requested` an hour after the last save) write `failed conference_timeout`. So Retry always comes back.
 * - The outcome is written to the Activity with `updatedAt` kept unchanged (never a user edit) and compare-and-set on
 *   the provider and request number, so an answer to an older request never overwrites a newer choice.
 * - Join details: once the link is `ready` the event's description gets "Join with Google Meet: <url>" / "Join
 *   Microsoft Teams meeting: <url>" (spec §16.3, also for external guests). The base stores what was actually sent, and
 *   the link is marked dirty for one more quiet push (a description-only patch never re-sends invitations).
 * - Inbound: a Meet / Teams link on the answer that the CRM didn't ask for (added in Google / Outlook directly) is
 *   taken over read only, and the base records it so it isn't asked for again. P2-5's pull does the same for the
 *   organizer copies it reads (sync.pull.ts, `settleConference` + `recordConference`), writing `ready` links only.
 * - Redis down: the job's reads run in-process on a timer (same tries).
 */

/** Activity columns this module reads. */
export type ConferenceSource = ActivityConference & { id: string };

const conferenceOf = (row: ConferenceSource): ActivityConference => ({
    conferenceProvider: row.conferenceProvider ?? null,
    conferenceState: row.conferenceState ?? null,
    conferenceJoinUrl: row.conferenceJoinUrl ?? null,
    conferenceId: row.conferenceId ?? null,
    conferenceRequest: row.conferenceRequest ?? 0,
    conferenceError: row.conferenceError ?? null,
});

/**
 * The conference part of a create (any wanted link is asked for with the new event). `restore`: Google brings a
 * deleted copy back with its old fields, an old Meet included, so a restore without a wanted Meet removes it
 * (`conferenceData: null`) instead of leaving it to be taken over again.
 */
export function conferenceForCreate(calendarProvider: string, crm: CrmShape, requestedId: string, restore = false): ConferenceWrite | null {
    const write = conferenceWriteFor(calendarProvider, crm.conference, null, requestedId);
    if (write || !restore || crm.conference) return write;
    return conferenceWriteFor(calendarProvider, null, { provider: 'meet', request: 0 }, requestedId);
}

/** Whether a write asks the provider to create a link (the part a 400 may be about). */
export const asksForLink = (write: ConferenceWrite | null | undefined): boolean => write?.kind === 'meet' || write?.kind === 'teams';

/**
 * The conference part of a patch, and the groups actually sent: a changed `conference` group with nothing to send
 * (a provider this calendar can't create, a Teams link that can't be removed) is dropped from the write (the base
 * still records the CRM's choice, so it isn't tried again).
 */
export function conferenceForPatch(
    calendarProvider: string,
    groups: readonly FieldGroup[],
    crm: CrmShape,
    before: CrmShape | null | undefined,
    requestedId: string,
): { groups: FieldGroup[]; write: ConferenceWrite | null } {
    if (!groups.includes('conference')) return { groups: [...groups], write: null };
    const write = conferenceWriteFor(calendarProvider, crm.conference, before?.conference, requestedId);
    return { groups: write ? [...groups] : groups.filter((g) => g !== 'conference'), write };
}

export interface SettledConference {
    outcome: ConferenceOutcome;
    /** The CRM side to store in the link's base (what was sent, plus an adopted link's provider). */
    crm: CrmShape;
}

/**
 * What a provider answer means for the activity's video meeting (pure). The base keeps the description that was
 * sent: join details of a link that only became ready on this answer go out with the next push (`afterConference`).
 */
export function settleConference(activity: ConferenceSource, event: ProviderEvent, calendarProvider: string, sent: ConferenceWrite | null, crm: CrmShape): SettledConference {
    const current = conferenceOf(activity);
    const outcome = conferenceOutcome(current, event.conference, calendarProvider, sent);
    if (!outcome.adopted || !outcome.columns) return { outcome, crm };
    return { outcome, crm: { ...crm, conference: { provider: outcome.columns.conferenceProvider as 'meet' | 'teams', request: current.conferenceRequest } } };
}

/**
 * The provider refused a write that asked for a link (400, e.g. Meet off for the organisation): the link is `failed
 * not_created`. The write goes again without the video part; the base still records the CRM's choice, so the same
 * request isn't sent again (Retry asks with a new request number).
 */
export function conferenceRefused(): ConferenceOutcome {
    return { columns: failedConferenceColumns('not_created'), poll: false, adopted: false };
}

/**
 * Writes an outcome's columns: `updatedAt` matched and kept (the reminder-claim pattern), compare-and-set on the
 * provider and request number the outcome was worked out for. False when the activity moved on (a newer request,
 * another provider) or kept changing.
 */
export async function recordConference(db: Pick<TransactionClient, 'activity'>, activity: ConferenceSource, outcome: ConferenceOutcome): Promise<boolean> {
    if (!outcome.columns) return false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await db.activity.findUnique({ where: { id: activity.id }, select: { updatedAt: true } });
        if (!current) return false;
        const { count } = await db.activity.updateMany({
            where: {
                id: activity.id,
                updatedAt: current.updatedAt,
                conferenceRequest: activity.conferenceRequest ?? 0,
                conferenceProvider: activity.conferenceProvider ?? null,
            },
            data: { ...outcome.columns, updatedAt: current.updatedAt },
        });
        if (count === 1) return true;
        // Something else changed: give up when it was the conference itself, retry when it was only updatedAt.
        const now = await db.activity.findUnique({ where: { id: activity.id }, select: { conferenceRequest: true, conferenceProvider: true } });
        if (!now || now.conferenceRequest !== (activity.conferenceRequest ?? 0) || (now.conferenceProvider ?? null) !== (activity.conferenceProvider ?? null)) return false;
    }
    return false;
}

// ── After a push ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * After a push stored its answer: a link still being created is read again by the `conference` job; a link that
 * became `ready` (`written`: recordConference stored it) gets its join details into the event description with one
 * more push.
 */
export async function afterConference(linkId: string, request: number, outcome: ConferenceOutcome, written: boolean): Promise<void> {
    if (outcome.poll) await enqueueConferenceCheck({ linkId, request: request ?? 0, attempt: 1 });
    if (written && outcome.columns?.conferenceState === 'ready') await queueJoinDetailsPush(linkId);
}

/**
 * Marks a synced link dirty again so its next push sends the description with the join details (a description-only
 * patch: no invitations go out again). A link already dirty sends them with the push that is already due.
 */
export async function queueJoinDetailsPush(linkId: string, now: Date = new Date()): Promise<void> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return;
    try {
        const { count } = await prisma.activityExternalLink.updateMany({ where: { id: linkId, state: 'synced', dirtyAt: null }, data: { state: 'pending', dirtyAt: now } });
        if (count === 1) await wakePushes([{ id: linkId, dirtyAt: now }]);
    } catch (err) {
        logger.warn({ err: (err as Error).message, linkId }, 'Could not queue the push of the video join details; the next change sends them');
    }
}

// ── The `conference` job ──────────────────────────────────────────────────────────────────────────────────────

export interface ConferenceJobData {
    linkId: string;
    /** `Activity.conferenceRequest` the read is for (a newer request makes the job a no-op). */
    request: number;
    /** 1-based try. */
    attempt: number;
}

type InlineCheck = (data: ConferenceJobData) => void;

const defaultInlineCheck: InlineCheck = (data) => {
    const timer = setTimeout(() => {
        void checkConference(data).catch(async (err: Error) => {
            logger.warn({ err: err.message, linkId: data.linkId }, 'In-process video link check failed');
            // The database itself failed: one more try while there are tries left, else give up for good.
            if (data.attempt < CONFERENCE_CHECK_TRIES) inlineCheck({ ...data, attempt: data.attempt + 1 });
            else await markConferenceExhausted(data).catch(() => undefined);
        });
    }, CONFERENCE_CHECK_DELAY_MS);
    timer.unref();
};

let inlineCheck: InlineCheck = defaultInlineCheck;

/** Tests: capture in-process checks instead of running them on a timer (null = the real timer). */
export function setInlineConferenceCheckForTests(runner: InlineCheck | null): void {
    inlineCheck = runner ?? defaultInlineCheck;
}

/** Queues the next read of a pending video link (or runs it in-process on a timer when Redis is down). */
export async function enqueueConferenceCheck(data: ConferenceJobData): Promise<void> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return;
    try {
        const id = await tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.conference, data, {
            jobId: conferenceJobId(data.linkId, data.request, data.attempt),
            delay: CONFERENCE_CHECK_DELAY_MS,
        });
        if (id === null) inlineCheck(data);
    } catch (err) {
        logger.warn({ err: (err as Error).message, linkId: data.linkId }, 'Could not queue the video link check');
        inlineCheck(data);
    }
}

export type ConferenceCheckResult = 'ready' | 'failed' | 'pending' | 'settled' | 'skipped';

const EVENT_GONE: ReadonlySet<string> = new Set(['detached', 'cancelled', 'removed_remote', 'unsupported']);

const ACTIVITY_CONFERENCE_SELECT = {
    id: true,
    isDeleted: true,
    conferenceProvider: true,
    conferenceState: true,
    conferenceJoinUrl: true,
    conferenceId: true,
    conferenceRequest: true,
    conferenceError: true,
} as const;

/** Writes `failed <code>` for the request (compare-and-set); 'failed', or 'settled' when the activity moved on. */
async function giveUp(activity: ConferenceSource, code: ConferenceErrorCode): Promise<ConferenceCheckResult> {
    return (await recordConference(prisma, activity, { columns: failedConferenceColumns(code), poll: false, adopted: false })) ? 'failed' : 'settled';
}

/** A try that couldn't read the event: the next try is queued, the last one gives up (`conference_timeout`). */
async function nextTry(data: ConferenceJobData, activity: ConferenceSource): Promise<ConferenceCheckResult> {
    if (data.attempt >= CONFERENCE_CHECK_TRIES) return giveUp(activity, 'conference_timeout');
    await enqueueConferenceCheck({ ...data, attempt: data.attempt + 1 });
    return 'pending';
}

/**
 * One `conference` job: reads the event and records its video link. `settled` when the activity no longer waits for
 * this request; `pending` queues the next try. Every other end is final: the link `ready`, or `failed` (the provider
 * failed it, the event is gone: `no_event`, or the last try: `conference_timeout`). A read that can't be made (the
 * connection paused, a provider error) uses up a try instead of ending the wait.
 */
export async function checkConference(data: ConferenceJobData): Promise<ConferenceCheckResult> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 'skipped';
    const link = await prisma.activityExternalLink.findUnique({
        where: { id: data.linkId },
        select: { id: true, activityId: true, connectionId: true, provider: true, externalEventId: true, state: true },
    });
    if (!link) return 'settled';
    const activity = await prisma.activity.findUnique({ where: { id: link.activityId }, select: ACTIVITY_CONFERENCE_SELECT });
    if (!activity || activity.isDeleted || activity.conferenceRequest !== data.request || activity.conferenceState !== 'requested') return 'settled';
    if (!link.externalEventId || EVENT_GONE.has(link.state) || !isCalendarProvider(link.provider)) return giveUp(activity, 'no_event');

    const provider = link.provider;
    let event: ProviderEvent | null;
    try {
        event = await withCalendarAccess(link.connectionId, (ctx) => getAdapter(provider).getEvent(ctx, link.externalEventId as string));
    } catch (err) {
        if (!(err instanceof ConnectionUnavailableError)) logger.warn({ err: (err as Error).message, linkId: link.id, attempt: data.attempt }, 'Could not read the event for its video link');
        return nextTry(data, activity);
    }
    if (!event || event.status === 'cancelled') return giveUp(activity, 'no_event');

    const outcome = conferenceOutcome(activity, event.conference, provider, null);
    if (!outcome.columns) return nextTry(data, activity);
    const written = await recordConference(prisma, activity, outcome);
    if (!written) return 'settled';
    if (outcome.columns.conferenceState === 'ready') {
        await queueJoinDetailsPush(link.id);
        return 'ready';
    }
    return 'failed';
}

/** The worker's last attempt at a `conference` job failed (the database, not the provider): `failed conference_timeout`. */
export async function markConferenceExhausted(data: Partial<ConferenceJobData>): Promise<void> {
    if (!data.linkId || typeof data.request !== 'number') return;
    const link = await prisma.activityExternalLink.findUnique({ where: { id: data.linkId }, select: { activityId: true } });
    if (!link) return;
    const activity = await prisma.activity.findUnique({ where: { id: link.activityId }, select: ACTIVITY_CONFERENCE_SELECT });
    if (!activity || activity.conferenceRequest !== data.request || activity.conferenceState !== 'requested') return;
    await giveUp(activity, 'conference_timeout');
}

const DAY_MS = 24 * 60 * 60_000;

/** How long a link may stay `requested` after the activity's last save before the nightly sweep gives up on it. */
export const STALE_CONFERENCE_MS = 60 * 60_000;
/** Rows per nightly sweep (the rest wait for the next night). */
const STALE_CONFERENCE_LIMIT = 200;

/**
 * Nightly (calendar-nightly, 00:25, inside the existing nightly database wake): video links still `requested` an hour
 * after the activity's last save (no push ran: the owner's calendar was paused, the type stopped going to calendars,
 * a lost in-process timer) become `failed conference_timeout`, so Retry is offered. Recurring occurrences not pushed
 * yet (more than SERIES_SYNC_WINDOW_DAYS − 1 days ahead) are left waiting. One read on the
 * (conferenceState, updatedAt) index; nothing outside the nightly run.
 */
export async function failStaleConferences(now: Date = new Date()): Promise<number> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 0;
    const rows = await prisma.activity.findMany({
        where: {
            conferenceState: 'requested',
            updatedAt: { lt: new Date(now.getTime() - STALE_CONFERENCE_MS) },
            // Calendar Phase 4: an occurrence of a recurring series isn't pushed until it comes inside the sync window
            // (SERIES_SYNC_WINDOW_DAYS; the 00:20 nightly marks those entering it). Its link waits until then: only
            // occurrences that have been inside the window for a day (pushed by now) can time out.
            OR: [{ seriesId: null }, { startAt: { lte: new Date(now.getTime() + SERIES_SYNC_WINDOW_MS - DAY_MS) } }],
        },
        select: ACTIVITY_CONFERENCE_SELECT,
        take: STALE_CONFERENCE_LIMIT,
    });
    let failed = 0;
    for (const row of rows) if ((await giveUp(row, 'conference_timeout')) === 'failed') failed += 1;
    return failed;
}
