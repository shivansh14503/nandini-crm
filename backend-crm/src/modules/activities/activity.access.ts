import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { canAccessRecord, hasGlobalAccess } from '../shared/accessControl.js';

/**
 * Row-level access to activities: the CRM rule (global roles see everything; others what they own or created,
 * shared/accessControl.ts) extended with attendees. A colleague invited to an activity sees it, but only its owner,
 * its creator or a global role may change or delete it; an invitee may only reply (RSVP).
 */

/** What the access checks read from an activity row. */
export interface ActivityAccessRow {
    assignedTo?: string | null;
    createdBy?: string | null;
    attendees?: readonly { username?: string | null; responseStatus?: string | null }[];
}

const sameUser = (a: string | null | undefined, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Prisma `where` fragment limiting a query to the activities `user` may see; combine it with `AND`. SQL Server runs
 * the attendee arm as an EXISTS on ActivityAttendee(username), and compares usernames case-insensitively.
 */
export function activityScopeWhere(user: AuthUser): Prisma.ActivityWhereInput {
    if (hasGlobalAccess(user)) return {};
    return {
        OR: [{ assignedTo: user.username }, { createdBy: user.username }, { attendees: { some: { username: user.username } } }],
    };
}

/** True when `user` may see the activity: global role, owner, creator or invited colleague. */
export function canViewActivity(user: AuthUser, row: ActivityAccessRow): boolean {
    if (canAccessRecord(user, row)) return true;
    return (row.attendees ?? []).some((attendee) => sameUser(attendee.username, user.username));
}

/** True when `user` may change or delete the activity: global role, owner or creator (not an invitee). */
export function canEditActivity(user: AuthUser, row: ActivityAccessRow): boolean {
    return canAccessRecord(user, row);
}

/** The caller's reply when invited as a colleague, else null. */
export function myResponseOf(user: AuthUser, row: ActivityAccessRow): string | null {
    const mine = (row.attendees ?? []).find((attendee) => sameUser(attendee.username, user.username));
    return mine?.responseStatus ?? null;
}
