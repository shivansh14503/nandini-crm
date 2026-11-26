import type { Activity, Prisma } from '../../generated/prisma/client.js';
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

// ── Locks (Calendar Phase 2, spec §8.13) ─────────────────────────────────────

/**
 * A lock on an activity: fields only another source may change (P2-4: a lead / opportunity follow-up activity is
 * changed on its record; P2-8: an externally organized meeting in the organizer's calendar). A state conflict, not
 * a permission problem: `PUT` answers 409 with `code`. The system write path (activity.system.ts) is not subject to
 * locks; its callers decide.
 */
export interface ActivityLock {
    /** ActivityDto keys a CRM update may not change (sending the stored value is fine). */
    fields: readonly string[];
    /** Error code of the 409 (`FOLLOW_UP_ACTIVITY_LOCKED`, `EXTERNAL_EVENT_LOCKED`). */
    code: string;
    /** Message of the 409. */
    message: string;
    /** Null when the activity may still be deleted; else why a bulk delete skips it (a single delete answers 409). */
    deleteRefusedReason: string | null;
}

export const activityLocks = {
    /**
     * The lock on a stored row, or null. None yet (Phase 1 activities are never locked); P2-4 and P2-8 add theirs
     * here. `activity.service.ts` already enforces it in `update`, `remove` and `bulkRemove`. Tests replace it with
     * `mock.method`.
     */
    lockFor(_row: Activity): ActivityLock | null {
        return null;
    },
};

/** Fields of the row a CRM update may not change (spec §8.13); `[]` when unlocked. */
export function lockedFieldsFor(row: Activity): string[] {
    return [...(activityLocks.lockFor(row)?.fields ?? [])];
}

/** The caller's reply when invited as a colleague, else null. */
export function myResponseOf(user: AuthUser, row: ActivityAccessRow): string | null {
    const mine = (row.attendees ?? []).find((attendee) => sameUser(attendee.username, user.username));
    return mine?.responseStatus ?? null;
}
