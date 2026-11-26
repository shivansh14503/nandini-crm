import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { calendarSyncQueue, tryEnqueue } from '../../jobs/queues.js';
import { ConnectionUnavailableError, withCalendarAccess } from './calendarAccess.js';
import { isCalendarProvider } from './connection.constants.js';
import {
    conferenceErrorOf,
    conferenceOutcome,
    conferenceWriteFor,
    withJoinDetails,
    type ActivityConference,
    type ConferenceOutcome,
    type ConferenceWrite,
} from './conference.rules.js';
import { getAdapter } from './providers/registry.js';
import { CALENDAR_SYNC_JOBS, CONFERENCE_CHECK_DELAY_MS, CONFERENCE_CHECK_TRIES } from './sync.constants.js';
import { conferenceJobId } from './sync.keys.js';
import type { CrmShape, FieldGroup, ProviderEvent } from './sync.shapes.js';

/**
 * Video meetings in the push engine (Calendar Phase 3, P3-1; spec §16.3). Kept apart from sync.push.ts, which calls
 * three hooks: `conferenceForCreate` / `conferenceForPatch` (what the provider write carries) and `settleConference`
 * (what the answer means for the activity, and the base the link stores).
 *
 * - Google Meet: the write carries `conferenceData.createRequest` (`conferenceDataVersion=1`). Google often answers
 *   `pending`; then a `conference` job reads the event again 5 s later (up to 5 tries; then `failed
 *   conference_timeout`, which the drawer's Retry asks again with a new request number).
 * - Microsoft Teams: `isOnlineMeeting` on the create; the join URL comes on the answer (or the job's next read).
 * - The outcome is written to the Activity with `updatedAt` kept unchanged (never a user edit) and compare-and-set on
 *   the provider and request number, so an answer to an older request never overwrites a newer choice.
 * - Inbound (no P2-5 pull needed): a Meet / Teams link on the answer that the CRM didn't ask for (added in Google /
 *   Outlook directly) is taken over read only, and the base records it so it isn't asked for again.
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
});

/** The conference part of a create (any wanted link is asked for with the new event). */
export function conferenceForCreate(calendarProvider: string, crm: CrmShape, requestedId: string): ConferenceWrite | null {
    return conferenceWriteFor(calendarProvider, crm.conference, null, requestedId);
}

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
    /** The CRM side to store in the link's base (join details and an adopted link included). */
    crm: CrmShape;
}

/**
 * What a provider answer means for the activity's video meeting (pure apart from nothing: no I/O). `descriptionText`
 * is the description without join details (D15 text or '').
 */
export function settleConference(
    activity: ConferenceSource,
    event: ProviderEvent,
    calendarProvider: string,
    sent: ConferenceWrite | null,
    crm: CrmShape,
    descriptionText: string,
): SettledConference {
    const current = conferenceOf(activity);
    const outcome = conferenceOutcome(current, event.conference, calendarProvider, sent);
    if (!outcome.columns) return { outcome, crm };
    const after = { ...current, ...outcome.columns };
    return {
        outcome,
        crm: {
            ...crm,
            description: withJoinDetails(descriptionText, after),
            ...(outcome.adopted ? { conference: { provider: outcome.columns.conferenceProvider as 'meet' | 'teams', request: current.conferenceRequest } } : {}),
        },
    };
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
        void checkConference(data).catch((err: Error) => logger.warn({ err: err.message, linkId: data.linkId }, 'In-process video link check failed'));
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
    }
}

export type ConferenceCheckResult = 'ready' | 'failed' | 'pending' | 'settled' | 'gone' | 'skipped';

const EVENT_GONE: ReadonlySet<string> = new Set(['detached', 'cancelled', 'removed_remote', 'unsupported']);

/**
 * One `conference` job: reads the event and records its video link. `settled` when the activity no longer waits for
 * this request; `pending` queues the next try (the last try marks it `failed conference_timeout`).
 */
export async function checkConference(data: ConferenceJobData): Promise<ConferenceCheckResult> {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return 'skipped';
    const link = await prisma.activityExternalLink.findUnique({
        where: { id: data.linkId },
        select: { id: true, activityId: true, connectionId: true, provider: true, externalEventId: true, state: true },
    });
    if (!link?.externalEventId || EVENT_GONE.has(link.state) || !isCalendarProvider(link.provider)) return 'gone';
    const activity = await prisma.activity.findUnique({
        where: { id: link.activityId },
        select: { id: true, isDeleted: true, conferenceProvider: true, conferenceState: true, conferenceJoinUrl: true, conferenceId: true, conferenceRequest: true },
    });
    if (!activity || activity.isDeleted || activity.conferenceRequest !== data.request || activity.conferenceState !== 'requested') return 'settled';

    const provider = link.provider;
    let event: ProviderEvent | null;
    try {
        event = await withCalendarAccess(link.connectionId, (ctx) => getAdapter(provider).getEvent(ctx, link.externalEventId as string));
    } catch (err) {
        if (err instanceof ConnectionUnavailableError) return 'skipped';
        throw err;
    }
    if (!event || event.status === 'cancelled') return 'gone';

    let outcome = conferenceOutcome(activity, event.conference, provider, null);
    if (!outcome.columns) {
        if (data.attempt < CONFERENCE_CHECK_TRIES) {
            await enqueueConferenceCheck({ ...data, attempt: data.attempt + 1 });
            return 'pending';
        }
        outcome = { columns: { conferenceState: 'failed', conferenceJoinUrl: null, conferenceId: null, conferenceError: conferenceErrorOf('conference_timeout') }, poll: false, adopted: false };
    }
    const written = await recordConference(prisma, activity, outcome);
    if (!written) return 'settled';
    return outcome.columns?.conferenceState === 'ready' ? 'ready' : 'failed';
}
