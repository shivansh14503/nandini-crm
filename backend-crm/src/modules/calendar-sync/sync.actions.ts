import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { ActivityExternalLink } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { canEditActivity, canViewActivity } from '../activities/activity.access.js';
import type { ActivityRow, ActivityView } from '../activities/activity.mapper.js';
import { EDIT_FORBIDDEN_MESSAGE, loadActivityConfig, loadImportSources, toActivityView, WITH_ATTENDEES } from '../activities/activity.service.js';
import { lockRecords, runInTransaction } from '../shared/transactions.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';
import { parseHeld } from './sync.attendees.js';
import { requestedIdFor } from './sync.keys.js';
import { isCreateEligible, type HeldNotice } from './sync.outbox.js';
import { loadOwnerCalendarLinks } from './sync.view.js';
import { notifyHeldInvites, wakePushes } from './sync.wake.js';

/**
 * The activity drawer's calendar actions (Calendar Phase 2 P2-3c; spec §6.3, D41, §14.5):
 *
 * - `POST /api/activities/:id/calendar-sync/retry` (owner or editor): the owner's organizer link is marked dirty again
 *   with its attempts reset and pushed now. A refused push (`error`) goes back to `pending`; a link whose restore was
 *   refused (`cancelled` with an error) is tried again; **Add again** for an event deleted in the calendar
 *   (`removed_remote`, upcoming planned activities only) starts a new copy (new generation and requested id, the
 *   gone event's id dropped), so it is created again even when the sweep, not this request's wake-up, pushes it.
 *   The re-created event is a new invitation for its guests (they already got the cancellation), so when someone
 *   other than the owner presses Add again on an activity with guests the new copy is private (`invites='withhold'`,
 *   held list cleared) and the owner gets the `calendar_invites_held` notice, as for any copy someone else makes (D41,
 *   sync.outbox.ts `heldChanges`). The owner's own Add again keeps the link's invitations as they were.
 * - `POST /api/activities/:id/calendar-sync/send-invites` (**owner only**, D41: invitations leave a mailbox only on its
 *   owner's action, managers and admins included): `invites='send'`, held guests released (`heldAttendeesJson`
 *   null), dirty. The push then adds every invitable attendee with Google `sendUpdates=all`, and when any of them is
 *   outside the company the same request clears the internal description (sync.push.ts, D15). Audited
 *   `Activity SEND_INVITES` with counts only. Nothing held → answers the view unchanged (a double click is harmless).
 *   Refused (409 CALENDAR_SYNC_NOT_RETRYABLE) while the copy's event is gone (`cancelled`, `removed_remote`): the push
 *   would send nothing, so the copy has to be back in the calendar first (Add again, or the activity planned again).
 *
 * Both answer the activity view (with its fresh `calendar` state), 503 CALENDAR_SYNC_DISABLED when the kill switch is
 * off, 409 CALENDAR_NOT_SYNCED when the activity has no copy in its owner's calendar, 409 CALENDAR_SYNC_NOT_RETRYABLE
 * when the copy can't be pushed again (a repeating series in the calendar, D19; Add again on an activity that is no
 * longer upcoming and planned). Writes only the link (no activity row, no `updatedAt` change) in one short transaction
 * under the activity's record lock, so it serializes with saves of the same activity.
 */

export const CALENDAR_NOT_SYNCED = 'CALENDAR_NOT_SYNCED';
export const CALENDAR_SYNC_NOT_RETRYABLE = 'CALENDAR_SYNC_NOT_RETRYABLE';
export const CALENDAR_SYNC_DISABLED = 'CALENDAR_SYNC_DISABLED';

const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const VIEW_FORBIDDEN_MESSAGE = 'You do not have permission to access or modify this record.';

function assertSyncEnabled(): void {
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) {
        throw new HttpError('Calendar sync is switched off on the server (CALENDAR_SYNC_ENABLED=false).', StatusCodes.SERVICE_UNAVAILABLE, { code: CALENDAR_SYNC_DISABLED });
    }
}

const notSynced = () => new HttpError("This activity isn't in its owner's calendar.", StatusCodes.CONFLICT, { code: CALENDAR_NOT_SYNCED });
const notRetryable = (message: string) => new HttpError(message, StatusCodes.CONFLICT, { code: CALENDAR_SYNC_NOT_RETRYABLE });

/** The organizer link on the owner's live connection row (what the drawer shows), read through `tx`; null when none. */
async function ownerLinkOf(tx: TransactionClient, row: ActivityRow): Promise<ActivityExternalLink | null> {
    const connections = await tx.calendarConnection.findMany({
        where: { username: row.assignedTo, status: { in: [...LIVE_CONNECTION_STATUSES] } },
        select: { id: true },
    });
    if (connections.length === 0) return null;
    const ids = new Set(connections.map((c) => c.id));
    const links = await tx.activityExternalLink.findMany({ where: { activityId: row.id, role: 'organizer', state: { not: 'detached' } } });
    return links.find((l) => ids.has(l.connectionId)) ?? null;
}

/** Reads the live activity under its record lock and checks the caller may see it. */
async function lockedActivity(tx: TransactionClient, id: string, user: AuthUser): Promise<ActivityRow> {
    await lockRecords(tx, 'activity', [id]);
    const row = (await tx.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES })) as ActivityRow | null;
    if (!row) throw HttpError.notFound('Activity not found');
    if (!canViewActivity(user, row)) throw HttpError.forbidden(VIEW_FORBIDDEN_MESSAGE);
    return row;
}

/** States whose event is gone: the plan restores / recreates from them, so a retry keeps them. */
const GONE_STATES = new Set(['cancelled', 'removed_remote']);

async function viewOf(id: string, user: AuthUser): Promise<ActivityView> {
    const row = (await prisma.activity.findFirst({ where: { id, isDeleted: false }, include: WITH_ATTENDEES })) as ActivityRow | null;
    if (!row) throw HttpError.notFound('Activity not found');
    return toActivityView(row, user, await loadOwnerCalendarLinks([row]), await loadImportSources([row]));
}

async function afterCommit(id: string, link: { id: string; dirtyAt: Date } | null, user: AuthUser, notice: HeldNotice | null = null): Promise<ActivityView> {
    if (link) {
        await cacheService.invalidateEntityCaches('activities');
        try {
            await wakePushes([link]);
        } catch (err) {
            logger.warn({ err: (err as Error).message, linkId: link.id }, 'Could not wake the calendar push; the outbox sweep covers it');
        }
    }
    if (notice) {
        try {
            await notifyHeldInvites([notice]);
        } catch (err) {
            logger.warn({ err: (err as Error).message, activityId: id }, 'Could not send the "invitations held" notification');
        }
    }
    return viewOf(id, user);
}

/** Guests of an activity (attendees other than its owner): the people a sent invitation would mail. */
const guestsOf = (row: ActivityRow) => row.attendees.filter((a) => !(a.kind === 'user' && lc(a.username) === lc(row.assignedTo))).length;

export const calendarSyncActions = {
    async retry(id: string, user: AuthUser): Promise<ActivityView> {
        assertSyncEnabled();
        // Loaded before the transaction (Add again checks the activity is still create-eligible).
        const config = await loadActivityConfig();
        const now = new Date();
        let notice: HeldNotice | null = null;
        const dirty = await runInTransaction(async (tx) => {
            notice = null;
            const row = await lockedActivity(tx, id, user);
            if (!canEditActivity(user, row)) throw HttpError.forbidden(EDIT_FORBIDDEN_MESSAGE);
            const link = await ownerLinkOf(tx, row);
            if (!link) throw notSynced();
            if (link.state === 'unsupported') {
                throw notRetryable('This meeting became a repeating event in the calendar, so the CRM no longer updates it.');
            }
            let data: Record<string, unknown> = { dirtyAt: now, nextAttemptAt: null, attempts: 0 };
            if (link.state === 'removed_remote') {
                if (!isCreateEligible(row, config, now)) throw notRetryable('Only an upcoming planned activity can be added to the calendar again.');
                // Add again: a new copy. The deleted event's id is dropped, so the plan creates instead of patching a
                // gone event, whichever push (this wake-up or the outbox sweep) runs it.
                const generation = link.generation + 1;
                data = {
                    ...data,
                    state: 'pending',
                    generation,
                    requestedId: requestedIdFor(row.id, link.connectionId, generation),
                    externalEventId: null,
                    externalEventKey: null,
                    iCalUid: null,
                    etag: null,
                    htmlLink: null,
                    baseJson: null,
                    providerUpdatedAt: null,
                    lastErrorCode: null,
                    lastErrorMessage: null,
                };
                // D41: a new event is a new invitation; only its owner sends those.
                const guests = guestsOf(row);
                if (lc(row.assignedTo) !== lc(user.username) && link.invites === 'send' && guests > 0) {
                    data = { ...data, invites: 'withhold', heldAttendeesJson: null };
                    notice = { activityId: row.id, owner: row.assignedTo, actor: user.username, subject: row.subject, guests, newCopy: true };
                }
            } else if (!GONE_STATES.has(link.state)) {
                data.state = 'pending';
            }
            await tx.activityExternalLink.update({ where: { id: link.id }, data });
            return { id: link.id, dirtyAt: now };
        });
        logger.info({ activityId: id, linkId: dirty.id, by: user.username }, 'Calendar push retried from the activity drawer');
        return afterCommit(id, dirty, user, notice);
    },

    async sendInvites(id: string, user: AuthUser): Promise<ActivityView> {
        assertSyncEnabled();
        const now = new Date();
        const dirty = await runInTransaction(async (tx) => {
            const row = await lockedActivity(tx, id, user);
            if (lc(row.assignedTo) !== lc(user.username)) {
                const owner = await tx.user.findFirst({ where: { username: row.assignedTo }, select: { fullName: true } });
                throw HttpError.forbidden(`Only ${owner?.fullName || row.assignedTo} can send these invitations: they go out from their own calendar.`);
            }
            const link = await ownerLinkOf(tx, row);
            if (!link) throw notSynced();
            if (link.state === 'unsupported') {
                throw notRetryable('This meeting became a repeating event in the calendar, so the CRM no longer updates it. Invite the guests there.');
            }
            if (GONE_STATES.has(link.state)) {
                throw notRetryable(
                    link.state === 'removed_remote'
                        ? 'This meeting was removed from the calendar. Add it to the calendar again first, then send the invitations.'
                        : "This meeting isn't in the calendar right now. The invitations can be sent once it's back there.",
                );
            }
            const held = parseHeld(link.heldAttendeesJson);
            const privateCopy = link.invites === 'withhold';
            if (!privateCopy && held.length === 0) return null;
            const guests = guestsOf(row);
            await tx.activityExternalLink.update({
                where: { id: link.id },
                data: {
                    invites: 'send',
                    heldAttendeesJson: null,
                    dirtyAt: now,
                    nextAttemptAt: null,
                    attempts: 0,
                    state: 'pending',
                },
            });
            await auditService.record(tx, {
                entityType: 'Activity',
                entityId: id,
                action: 'SEND_INVITES',
                changedBy: user.username,
                changes: { provider: link.provider, privateCopy, guests: privateCopy ? guests : held.length },
            });
            return { id: link.id, dirtyAt: now };
        });
        return afterCommit(id, dirty, user);
    },
};
