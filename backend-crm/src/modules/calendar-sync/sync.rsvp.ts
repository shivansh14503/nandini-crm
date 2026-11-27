import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { calendarSyncQueue, tryEnqueue } from '../../jobs/queues.js';
import { auditService } from '../../services/audit.service.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import type { AuthUser } from '../../types/user.types.js';
import type { ActivityRow } from '../activities/activity.mapper.js';
import { PLANNED_STATUS } from '../activities/activity.schedule.js';
import { loadActivityConfig, WITH_ATTENDEES, type ActivityCommitRow } from '../activities/activity.service.js';
import { applySystemPatch } from '../activities/activity.system.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { lockRecords, runInTransaction } from '../shared/transactions.js';
import { ConnectionUnavailableError, withCalendarAccess } from './calendarAccess.js';
import type { CalendarProvider } from './connection.constants.js';
import { ProviderBadRequestError, ProviderError, ProviderNotFoundError, ProviderRateLimitedError } from './providers/http.js';
import { getAdapter } from './providers/registry.js';
import type { RsvpReply } from './providers/types.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';
import {
    CALENDAR_SYNC_JOBS,
    INLINE_RSVP_ATTEMPTS,
    INLINE_RSVP_RETRY_MS,
    LEASE_RETRY_DELAY_MS,
    RSVP_FAILED_CODE,
    RSVP_FAILED_MESSAGE,
    RSVP_REFUSED_CODE,
    RSVP_REFUSED_MESSAGE,
    syncAuditRoute,
} from './sync.constants.js';
import { parseOwnerReply, parseSelfBase, selfBaseJson } from './sync.import.js';
import { eventKeyOf, requestedIdFor, rsvpJobId } from './sync.keys.js';
import { claimLease } from './sync.lease.js';

/**
 * Replies CRM → calendar (Calendar Phase 2 spec §13.3, P2-8): an invited colleague answers in the CRM (`POST
 * /activities/:id/response`), and the same answer goes to the invitation in their own calendar, so the organizer (a
 * customer, or a colleague) sees it there.
 *
 * - Only when the company switch `allowMeetingImport` and the person's admin-set `importMeetings` are on and they have
 *   an `ok` connection; otherwise the reply stays CRM-only (Phase 1), and the pull's merge rule keeps it (a calendar
 *   `needsAction` never replaces a CRM answer).
 * - `rsvp` job `{ activityId, username }`, id `rsvp-<activityId>-<username>-<respondedAtMs>`; without Redis it runs
 *   in-process after the response, and a busy lease, a rate limit or a transient provider failure is tried again a few
 *   times (INLINE_RSVP_ATTEMPTS, `rsvpRetryDelay` / INLINE_RSVP_RETRY_MS apart; a restart in between loses it, and the
 *   person can reply again). Under the connection's lease (D12) and the audit origin `job:calendar-sync:<provider>` with
 *   the colleague as actor.
 * - The owner of a meeting organized outside the CRM (a customer invited them: no attendee row, an attendee link on
 *   their own calendar) replies too (`respondAsOwner`): the reply is kept on that link (`baseJson.mine`), Decline
 *   cancels the activity and Accept / Maybe bring a cancelled one back (as the same answer in the calendar does), and the
 *   same `rsvp` job sends it.
 * - The attendee link, or (none yet) the person's copy found by the activity's `iCalUid` (`findByICalUid`), then linked.
 *   Google: own copy read → `self.responseStatus` set → `PATCH attendees` with `If-Match` and `sendUpdates=all`. Graph:
 *   `accept | tentativelyAccept | decline` with `sendResponse: true`, app-only on `/users/{mailbox}`.
 * - Calls are read-only for the connection's health (`readOnly`): a refusal (Google `calendar.events.owned` may not
 *   write an invitation copy, first-run check F3) is recorded on the link (`rsvp_refused`) and marks neither the row nor
 *   the provider. Busy / rate-limited → the job waits; transient failures throw (the queue retries).
 */

export interface RsvpJobData {
    activityId: string;
    username: string;
}

export type RsvpResult =
    | { status: 'skipped'; reason: string }
    | { status: 'busy' }
    | { status: 'rate_limited'; retryAfterMs: number }
    /** The calendar refused the reply; recorded on the link. */
    | { status: 'refused'; code: string }
    | { status: 'done'; reply: RsvpReply };

const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const isReply = (value: string): value is RsvpReply => value === 'accepted' || value === 'tentative' || value === 'declined';

/** The person's live, `ok` connection when replies go to their calendar (both switches on); null otherwise. */
async function replyingConnection(username: string) {
    const settings = await loadCalendarSettings();
    if (!settings.allowMeetingImport) return null;
    const choice = await prisma.calendarSyncUser.findUnique({ where: { username }, select: { importMeetings: true, excluded: true } });
    if (!choice?.importMeetings || choice.excluded) return null;
    return prisma.calendarConnection.findFirst({ where: { username, status: 'ok' }, orderBy: { enrolledAt: 'desc' } });
}

/** When a reply that couldn't run now should run again (ms from now), or null (P2-8). Pure. */
export function rsvpRetryDelay(result: RsvpResult, random: () => number = Math.random): number | null {
    if (result.status === 'busy') return LEASE_RETRY_DELAY_MS + Math.floor(random() * 2_000);
    if (result.status === 'rate_limited') return Math.max(1_000, result.retryAfterMs) + Math.floor(random() * 1_000);
    return null;
}

/**
 * The in-process reply (no Redis): run now; a busy lease or a rate limit waits like the queue would, a transient
 * provider failure (a thrown error) waits INLINE_RSVP_RETRY_MS × attempt; at most INLINE_RSVP_ATTEMPTS runs.
 */
export async function runRsvpInline(
    data: RsvpJobData,
    deps: { run?: typeof runRsvp; wait?: (ms: number) => Promise<void>; attempts?: number } = {},
): Promise<RsvpResult | null> {
    const run = deps.run ?? runRsvp;
    const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref()));
    const attempts = deps.attempts ?? INLINE_RSVP_ATTEMPTS;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        let delay: number | null;
        try {
            const result = await run(data.activityId, data.username);
            delay = rsvpRetryDelay(result);
            if (delay === null) return result;
        } catch (err) {
            logger.warn({ err: (err as Error).message, activityId: data.activityId, attempt }, 'In-process calendar reply failed');
            delay = INLINE_RSVP_RETRY_MS * attempt;
        }
        if (attempt < attempts) await wait(delay);
    }
    logger.warn({ activityId: data.activityId, attempts }, 'In-process calendar reply gave up; the reply stays in the CRM');
    return null;
}

type InlineRsvp = (data: RsvpJobData) => void;
const defaultInline: InlineRsvp = (data) => {
    setImmediate(() => {
        void runRsvpInline(data).catch(() => null);
    });
};
let inlineRsvp: InlineRsvp = defaultInline;

/** Tests: capture in-process replies instead of running them (null = the real runner). */
export function setInlineRsvpForTests(runner: InlineRsvp | null): void {
    inlineRsvp = runner ?? defaultInline;
}

/**
 * After a committed CRM reply (`activityService.respond`): queues the `rsvp` job when the reply goes to the person's
 * calendar. Never throws (the reply is saved either way).
 */
export async function enqueueRsvp(activityId: string, username: string, respondedAt: Date): Promise<void> {
    try {
        if (!ENV.INTEGRATIONS.SYNC_ENABLED) return;
        if (!(await replyingConnection(username))) return;
        const data: RsvpJobData = { activityId, username };
        const id = await tryEnqueue(calendarSyncQueue, CALENDAR_SYNC_JOBS.rsvp, data, { jobId: rsvpJobId(activityId, username, respondedAt) });
        if (id === null) inlineRsvp(data);
    } catch (err) {
        logger.warn({ err: (err as Error).message, activityId }, 'Could not queue the calendar reply');
    }
}

/** The `rsvp` job: sends the person's current CRM reply on the activity to their calendar copy. */
export async function runRsvp(activityId: string, username: string, options: { now?: () => Date } = {}): Promise<RsvpResult> {
    const clock = options.now ?? (() => new Date());
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return { status: 'skipped', reason: 'sync_disabled' };
    const connection = await replyingConnection(username);
    if (!connection) return { status: 'skipped', reason: 'not_replying' };
    const user = await prisma.user.findUnique({ where: { username: connection.username }, select: { id: true, isActive: true, isGroupUser: true } });
    if (!user?.isActive || user.isGroupUser) return { status: 'skipped', reason: 'user_inactive' };
    const activity = await prisma.activity.findFirst({ where: { id: activityId, isDeleted: false }, include: { attendees: true } });
    if (!activity) return { status: 'skipped', reason: 'not_found' };
    // The owner replies only on a meeting organized outside the CRM (their reply sits on their attendee link, read below).
    const isOwner = lc(activity.assignedTo) === lc(username);
    if (isOwner && !activity.externalOrganizer) return { status: 'skipped', reason: 'owner' };
    let reply = '';
    if (!isOwner) {
        const mine = activity.attendees.find((a) => a.kind === 'user' && lc(a.username) === lc(username));
        if (!mine) return { status: 'skipped', reason: 'not_invited' };
        reply = mine.responseStatus;
        if (!isReply(reply)) return { status: 'skipped', reason: 'no_reply' };
    }

    const provider = connection.provider as CalendarProvider;
    const adapter = getAdapter(provider);
    if (!adapter.respond || !adapter.findByICalUid) return { status: 'skipped', reason: 'unsupported' };

    return runWithAuditOrigin({ source: 'JOB', route: syncAuditRoute(provider), actorId: user.id }, async () => {
        const lease = await claimLease(prisma, connection.id, clock());
        if (!lease) return { status: 'busy' } as const;
        let linkId: string | null = null;
        try {
            let link = await prisma.activityExternalLink.findFirst({ where: { activityId, connectionId: connection.id } });
            if (link && link.role !== 'attendee') return { status: 'skipped', reason: 'organizer_link' } as const;
            if (link?.state === 'detached') return { status: 'skipped', reason: 'link_inactive' } as const;
            if (isOwner) {
                // The owner's copy is the one the meeting was imported from (no lazy lookup: the reply lives on the link).
                if (!link || link.state === 'cancelled' || !link.externalEventId) return { status: 'skipped', reason: 'no_event' } as const;
                reply = parseOwnerReply(link.baseJson) ?? '';
                if (!isReply(reply)) return { status: 'skipped', reason: 'no_reply' } as const;
            }
            linkId = link?.id ?? null;
            let eventId = link?.state === 'cancelled' ? null : (link?.externalEventId ?? null);
            if (!eventId) {
                // Lazy link: the person's copy of the meeting, by its iCalUID.
                if (!activity.iCalUid) return { status: 'skipped', reason: 'no_event' } as const;
                const found = await withCalendarAccess(connection.id, (ctx) => (adapter.findByICalUid as NonNullable<typeof adapter.findByICalUid>)(ctx, activity.iCalUid as string), {
                    clock,
                    readOnly: true,
                });
                if (!found || found.isOrganizerCopy) return { status: 'skipped', reason: 'not_in_calendar' } as const;
                eventId = found.id;
                link = await linkCopy(activityId, connection, found, link?.id ?? null, clock());
                if (!link) return { status: 'skipped', reason: 'event_linked_elsewhere' } as const;
                linkId = link.id;
            }
            if (!link) return { status: 'skipped', reason: 'no_event' } as const;
            await lease.keepAlive(clock());
            const sent = reply as RsvpReply;
            const event = await withCalendarAccess(connection.id, (ctx) => (adapter.respond as NonNullable<typeof adapter.respond>)(ctx, eventId as string, sent), { clock, readOnly: true });
            await prisma.activityExternalLink.updateMany({
                where: { id: link.id },
                data: {
                    baseJson: selfBaseJson(sent, isOwner ? sent : null),
                    lastSyncedAt: clock(),
                    lastErrorCode: null,
                    lastErrorMessage: null,
                    ...(event ? { etag: event.etag || null, htmlLink: event.htmlLink ?? link.htmlLink } : {}),
                },
            });
            logger.info({ activityId, connectionId: connection.id, reply: sent }, 'Reply sent to the calendar');
            return { status: 'done', reply: sent } as const;
        } catch (err) {
            if (err instanceof ProviderRateLimitedError) return { status: 'rate_limited', retryAfterMs: err.retryAfterMs ?? 60_000 } as const;
            const refused = err instanceof ConnectionUnavailableError && err.reason === 'call_refused';
            if (refused || err instanceof ProviderBadRequestError || err instanceof ProviderNotFoundError) {
                const code = refused ? ((err as ConnectionUnavailableError).failure?.code ?? 'refused') : (err as ProviderError).code;
                // F3: Google's narrow scope may refuse writing an invitation copy; the reply stays in the CRM. A copy that
                // is gone (404) is looked up again by iCalUID next time.
                if (linkId) {
                    await prisma.activityExternalLink.updateMany({
                        where: { id: linkId },
                        data: refused
                            ? { lastErrorCode: RSVP_REFUSED_CODE, lastErrorMessage: RSVP_REFUSED_MESSAGE }
                            : { lastErrorCode: RSVP_FAILED_CODE, lastErrorMessage: RSVP_FAILED_MESSAGE, ...(err instanceof ProviderNotFoundError ? { state: 'cancelled' } : {}) },
                    });
                }
                logger.warn({ activityId, connectionId: connection.id, code }, 'The calendar refused a reply; it stays in the CRM');
                return { status: 'refused', code } as const;
            }
            if (err instanceof ConnectionUnavailableError) return { status: 'skipped', reason: err.reason } as const;
            if (err instanceof ProviderError) logger.warn({ activityId, code: err.code, status: err.status }, 'Calendar reply failed; retried');
            throw err;
        } finally {
            await lease.release().catch(() => undefined);
        }
    });
}

/**
 * `POST /activities/:id/response` by the owner of a meeting organized outside the CRM (P2-8): they were invited by a
 * customer (or an unconnected colleague) and hold an attendee link on their own live connection, but have no attendee
 * row. The reply is kept on that link (`baseJson.mine`, audited `RSVP` on the activity); Decline cancels a Planned
 * activity and Accept / Maybe bring a Cancelled one back (system path: nothing pushed, participants told). Null when it
 * doesn't apply (not the owner, a CRM-held meeting, no such link): the caller's attendee-row path answers then. The
 * caller queues the `rsvp` job after the commit.
 */
export async function respondAsOwner(
    activityId: string,
    reply: RsvpReply,
    user: AuthUser,
    now: Date,
): Promise<{ existing: ActivityRow; row: ActivityRow; rows: ActivityCommitRow[] } | null> {
    const head = await prisma.activity.findFirst({ where: { id: activityId, isDeleted: false }, select: { assignedTo: true, externalOrganizer: true } });
    if (!head?.externalOrganizer || lc(head.assignedTo) !== lc(user.username)) return null;
    const config = await loadActivityConfig();
    return runInTransaction(async (tx) => {
        await lockRecords(tx, 'activity', [activityId]);
        const existing = (await tx.activity.findFirst({ where: { id: activityId, isDeleted: false }, include: WITH_ATTENDEES })) as ActivityRow | null;
        if (!existing?.externalOrganizer || lc(existing.assignedTo) !== lc(user.username)) return null;
        const mineConnections = await tx.calendarConnection.findMany({ where: { username: user.username, status: { in: [...LIVE_CONNECTION_STATUSES] } }, select: { id: true } });
        const link = mineConnections.length
            ? await tx.activityExternalLink.findFirst({
                  where: { activityId, role: 'attendee', state: { not: 'detached' }, connectionId: { in: mineConnections.map((c) => c.id) } },
                  select: { id: true, baseJson: true },
              })
            : null;
        if (!link) return null;
        const self = parseSelfBase(link.baseJson) ?? 'needsAction';
        const before = parseOwnerReply(link.baseJson) ?? self;
        await tx.activityExternalLink.update({ where: { id: link.id }, data: { baseJson: selfBaseJson(self, reply) }, select: { id: true } });
        if (before !== reply) {
            await auditService.record(tx, { entityType: 'Activity', entityId: activityId, action: 'RSVP', changedBy: user.username, changes: { myResponse: { from: before, to: reply } } });
        }
        const status = reply === 'declined' ? (existing.status === PLANNED_STATUS ? 'Cancelled' : null) : existing.status === 'Cancelled' ? PLANNED_STATUS : null;
        const rows: ActivityCommitRow[] = [];
        if (status) rows.push(await applySystemPatch(tx, activityId, { status }, user.username, now, { activityConfig: config, markSync: false, notify: true }));
        const row = rows.at(-1)?.after ?? existing;
        return { existing, row, rows };
    });
}

/** Links the person's copy found by iCalUID (pre-read for the unique indexes, D45: no catch inside the transaction). */
async function linkCopy(
    activityId: string,
    connection: { id: string; provider: string },
    event: { id: string; iCalUid: string; etag: string; htmlLink?: string; selfResponse?: string },
    existingId: string | null,
    now: Date,
) {
    return runInTransaction(async (tx) => {
        const holder = await tx.activityExternalLink.findFirst({ where: { connectionId: connection.id, externalEventKey: eventKeyOf(event.id) }, select: { id: true } });
        if (holder && holder.id !== existingId) return null;
        const identity = {
            role: 'attendee',
            state: 'synced',
            externalEventId: event.id,
            externalEventKey: eventKeyOf(event.id),
            iCalUid: event.iCalUid || null,
            etag: event.etag || null,
            htmlLink: event.htmlLink ?? null,
            lastSyncedAt: now,
        };
        if (existingId) return tx.activityExternalLink.update({ where: { id: existingId }, data: identity });
        const current = await tx.activityExternalLink.findFirst({ where: { activityId, connectionId: connection.id } });
        if (current) return current.role === 'attendee' ? tx.activityExternalLink.update({ where: { id: current.id }, data: identity }) : null;
        return tx.activityExternalLink.create({
            data: { activityId, connectionId: connection.id, provider: connection.provider, invites: 'send', requestedId: requestedIdFor(activityId, connection.id, 0), ...identity },
        });
    });
}
