import { prisma } from '../../config/prisma.js';
import type { ActivityExternalLink } from '../../generated/prisma/client.js';
import type { ActivityCalendarView, ActivityRow } from '../activities/activity.mapper.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';
import { parseHeld } from './sync.attendees.js';

/**
 * `ActivityView.calendar` (Calendar Phase 2 spec §4.4, §14.5; the drawer's ActivitySyncStatus, the list's Calendar
 * column and the calendar's error dot read it, P2-3c): the activity in its owner's connected calendar. Read with one
 * query per list page (links of the page's activities), plus one for their connections only when links exist. Imports
 * only types from the activities module.
 */

/**
 * An organizer link, plus whether the first-sync backfill created it (sync.backfill.ts stamps every backfilled link's
 * `createdAt` with the row's run stamp `backfilledAt`, the same across runs).
 */
export type OwnerCalendarLink = ActivityExternalLink & { fromBackfill?: boolean };

/** The owner's organizer link of each activity (by activity id). */
export type CalendarLinksByActivity = ReadonlyMap<string, OwnerCalendarLink>;
export const NO_CALENDAR_LINKS: CalendarLinksByActivity = new Map();

const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** The organizer link on the owner's own live connection, per activity (an old owner's or detached link doesn't show). */
export async function loadOwnerCalendarLinks(rows: readonly Pick<ActivityRow, 'id' | 'assignedTo'>[]): Promise<CalendarLinksByActivity> {
    if (rows.length === 0) return NO_CALENDAR_LINKS;
    const links = await prisma.activityExternalLink.findMany({
        where: { activityId: { in: rows.map((r) => r.id) }, role: 'organizer', state: { not: 'detached' } },
    });
    if (links.length === 0) return NO_CALENDAR_LINKS;
    const connections = await prisma.calendarConnection.findMany({
        where: { id: { in: [...new Set(links.map((l) => l.connectionId))] }, status: { in: [...LIVE_CONNECTION_STATUSES] } },
        select: { id: true, username: true, backfilledAt: true },
    });
    const ownerOf = new Map(connections.map((c) => [c.id, lc(c.username)]));
    const backfilledAt = new Map(connections.map((c) => [c.id, c.backfilledAt?.getTime() ?? null]));
    const assignee = new Map(rows.map((r) => [r.id, lc(r.assignedTo)]));
    const out = new Map<string, OwnerCalendarLink>();
    for (const link of links) {
        if (ownerOf.get(link.connectionId) !== assignee.get(link.activityId)) continue;
        out.set(link.activityId, { ...link, fromBackfill: backfilledAt.get(link.connectionId) === link.createdAt.getTime() });
    }
    return out;
}

/** Guests of an activity (attendees other than its owner). */
const guestCount = (row: Pick<ActivityRow, 'assignedTo' | 'attendees'>) => row.attendees.filter((a) => !(a.kind === 'user' && lc(a.username) === lc(row.assignedTo))).length;

/** The view of one activity's link for `viewer` (pure). */
export function calendarViewOf(
    row: Pick<ActivityRow, 'assignedTo' | 'attendees' | 'externalUpdatedAt'>,
    link: OwnerCalendarLink | undefined,
    viewer: string,
    viewerCanEdit: boolean,
): ActivityCalendarView | null {
    if (!link) return null;
    const isOwner = lc(viewer) !== '' && lc(viewer) === lc(row.assignedTo);
    const privileged = isOwner || viewerCanEdit;
    const heldCount = parseHeld(link.heldAttendeesJson).length;
    const withheld = link.invites === 'withhold';
    // Nothing to send while the event is gone (cancelled, deleted in the calendar): the push would plan nothing. The
    // drawer offers Add again instead; once the copy is back, its guests wait again.
    const eventGone = link.state === 'cancelled' || link.state === 'removed_remote';
    const invitesWaiting = !eventGone && ((withheld && guestCount(row) > 0) || heldCount > 0);
    return {
        provider: link.provider,
        state: link.state,
        pending: link.dirtyAt !== null,
        invites: link.invites,
        heldCount,
        canSendInvites: isOwner && invitesWaiting,
        invitesWaiting,
        copyReason: withheld ? (link.fromBackfill ? 'connected' : 'assigned') : null,
        lastSyncedAt: iso(link.lastSyncedAt),
        htmlLink: privileged ? link.htmlLink : null,
        errorCode: link.lastErrorCode,
        errorMessage: privileged ? link.lastErrorMessage : null,
        warning: link.lastWarning,
        conflictAt: iso(link.lastConflictAt),
        externalUpdatedAt: iso(row.externalUpdatedAt),
    };
}
