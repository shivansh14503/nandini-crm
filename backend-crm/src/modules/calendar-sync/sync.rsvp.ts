import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { calendarSyncQueue, tryEnqueue } from '../../jobs/queues.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { runInTransaction } from '../shared/transactions.js';
import { ConnectionUnavailableError, withCalendarAccess } from './calendarAccess.js';
import type { CalendarProvider } from './connection.constants.js';
import { ProviderBadRequestError, ProviderError, ProviderNotFoundError, ProviderRateLimitedError } from './providers/http.js';
import { getAdapter } from './providers/registry.js';
import type { RsvpReply } from './providers/types.js';
import { CALENDAR_SYNC_JOBS, RSVP_FAILED_CODE, RSVP_FAILED_MESSAGE, RSVP_REFUSED_CODE, RSVP_REFUSED_MESSAGE, syncAuditRoute } from './sync.constants.js';
import { selfBaseJson } from './sync.import.js';
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
 *   in-process after the response. Under the connection's lease (D12) and the audit origin
 *   `job:calendar-sync:<provider>` with the colleague as actor.
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

type InlineRsvp = (data: RsvpJobData) => void;
const defaultInline: InlineRsvp = (data) => {
    setImmediate(() => {
        runRsvp(data.activityId, data.username).catch((err: Error) => logger.warn({ err: err.message, activityId: data.activityId }, 'In-process calendar reply failed'));
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
    if (lc(activity.assignedTo) === lc(username)) return { status: 'skipped', reason: 'owner' };
    const mine = activity.attendees.find((a) => a.kind === 'user' && lc(a.username) === lc(username));
    if (!mine) return { status: 'skipped', reason: 'not_invited' };
    const reply = mine.responseStatus;
    if (!isReply(reply)) return { status: 'skipped', reason: 'no_reply' };

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
            const event = await withCalendarAccess(connection.id, (ctx) => (adapter.respond as NonNullable<typeof adapter.respond>)(ctx, eventId as string, reply), { clock, readOnly: true });
            await prisma.activityExternalLink.updateMany({
                where: { id: link.id },
                data: {
                    baseJson: selfBaseJson(reply),
                    lastSyncedAt: clock(),
                    lastErrorCode: null,
                    lastErrorMessage: null,
                    ...(event ? { etag: event.etag || null, htmlLink: event.htmlLink ?? link.htmlLink } : {}),
                },
            });
            logger.info({ activityId, connectionId: connection.id, reply }, 'Reply sent to the calendar');
            return { status: 'done', reply } as const;
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
