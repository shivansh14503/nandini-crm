import { prisma } from '../../config/prisma.js';
import type { ActivityExternalLink } from '../../generated/prisma/client.js';
import type { ActivityCalendarView, ActivityRow } from '../activities/activity.mapper.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';
import { parseHeld } from './sync.attendees.js';
import { FOLLOW_UP_NOTE_DAYS, FOLLOW_UP_TIME_KEPT_PREFIX } from './sync.constants.js';

/**
 * `ActivityView.calendar` (Calendar Phase 2 spec §4.4, §14.5; data only in P2-3b, the drawer's status line is P2-3c):
 * the activity in its owner's connected calendar. Read with one query per list page (links of the page's activities),
 * plus one for their connections only when links exist. Imports only types from the activities module.
 */

/** The owner's organizer link of each activity (by activity id). */
export type CalendarLinksByActivity = ReadonlyMap<string, ActivityExternalLink>;
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
        select: { id: true, username: true },
    });
    const ownerOf = new Map(connections.map((c) => [c.id, lc(c.username)]));
    const assignee = new Map(rows.map((r) => [r.id, lc(r.assignedTo)]));
    const out = new Map<string, ActivityExternalLink>();
    for (const link of links) {
        if (ownerOf.get(link.connectionId) === assignee.get(link.activityId)) out.set(link.activityId, link);
    }
    return out;
}

/** Guests of an activity (attendees other than its owner). */
const guestCount = (row: Pick<ActivityRow, 'assignedTo' | 'attendees'>) => row.attendees.filter((a) => !(a.kind === 'user' && lc(a.username) === lc(row.assignedTo))).length;

/**
 * The link note as screens show it: the follow-up "keeps a time" note (P2-5, §11.5) only for FOLLOW_UP_NOTE_DAYS after
 * the calendar change (the same rule as `keptFollowUpNote`, which pushes apply when they rewrite the link).
 */
export function shownWarning(warning: string | null, externalUpdatedAt: Date | null | undefined, now: Date): string | null {
    if (!warning?.startsWith(FOLLOW_UP_TIME_KEPT_PREFIX)) return warning;
    if (!externalUpdatedAt) return null;
    return now.getTime() - externalUpdatedAt.getTime() <= FOLLOW_UP_NOTE_DAYS * 24 * 60 * 60_000 ? warning : null;
}

/** The view of one activity's link for `viewer` (pure apart from the clock). */
export function calendarViewOf(
    row: Pick<ActivityRow, 'assignedTo' | 'attendees' | 'externalUpdatedAt'>,
    link: ActivityExternalLink | undefined,
    viewer: string,
    viewerCanEdit: boolean,
    now: Date = new Date(),
): ActivityCalendarView | null {
    if (!link) return null;
    const isOwner = lc(viewer) !== '' && lc(viewer) === lc(row.assignedTo);
    const privileged = isOwner || viewerCanEdit;
    const heldCount = parseHeld(link.heldAttendeesJson).length;
    return {
        provider: link.provider,
        state: link.state,
        pending: link.dirtyAt !== null,
        invites: link.invites,
        heldCount,
        canSendInvites: isOwner && ((link.invites === 'withhold' && guestCount(row) > 0) || heldCount > 0),
        lastSyncedAt: iso(link.lastSyncedAt),
        htmlLink: privileged ? link.htmlLink : null,
        errorCode: link.lastErrorCode,
        errorMessage: privileged ? link.lastErrorMessage : null,
        warning: shownWarning(link.lastWarning, row.externalUpdatedAt, now),
        conflictAt: iso(link.lastConflictAt),
        externalUpdatedAt: iso(row.externalUpdatedAt),
    };
}
