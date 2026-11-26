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

/** Activity origins (Calendar Phase 2): made in the CRM, a lead / opportunity follow-up (P2-4), imported (P2-8). */
export const ACTIVITY_ORIGINS = ['crm', 'followup', 'calendar'] as const;
export type ActivityOrigin = (typeof ACTIVITY_ORIGINS)[number];
export const FOLLOW_UP_ORIGIN: ActivityOrigin = 'followup';

export const FOLLOW_UP_ACTIVITY_LOCKED = 'FOLLOW_UP_ACTIVITY_LOCKED';

/**
 * What a follow-up activity takes from its lead / opportunity (spec §8.13): changed on the record (Record a follow-up),
 * never on the activity. Subject, location, attendees, reminder, remarks and custom fields stay editable.
 */
export const FOLLOW_UP_LOCKED_FIELDS = ['followupType', 'startAt', 'endAt', 'allDay', 'status', 'assignedTo', 'relatedModule', 'relatedId', 'relatedTo'] as const;

/** What the lock reads from a row. */
export type ActivityLockRow = Pick<Activity, 'origin' | 'status' | 'relatedModule' | 'relatedCode'>;

const RECORD_NOUN: Readonly<Record<string, string>> = { leads: 'lead', opportunities: 'opportunity' };

/** The lock of a follow-up activity (`origin = 'followup'`, any status), or null for any other row. */
export function followUpLockOf(row: ActivityLockRow): ActivityLock | null {
    if (row.origin !== FOLLOW_UP_ORIGIN) return null;
    const noun = RECORD_NOUN[row.relatedModule ?? ''] ?? 'record';
    const code = row.relatedCode ? ` (${row.relatedCode})` : '';
    const open = row.status === 'Planned';
    return {
        fields: FOLLOW_UP_LOCKED_FIELDS,
        code: FOLLOW_UP_ACTIVITY_LOCKED,
        message: open
            ? `This is the ${noun}'s next follow-up. Change it on the ${noun}${code}: Record a follow-up.`
            : `This is a follow-up of the ${noun}${code}. Its schedule, type, status and owner can't be changed here.`,
        deleteRefusedReason: open
            ? `Next follow-up of ${row.relatedCode || `the ${noun}`}: change it on the ${noun}`
            : `Follow-up history of ${row.relatedCode || `the ${noun}`}: kept with the ${noun}`,
    };
}

export const activityLocks = {
    /**
     * The lock on a stored row, or null. P2-4: follow-up activities (`followUpLockOf`); P2-8 adds externally organized
     * meetings here. `activity.service.ts` enforces it in `update`, `remove` and `bulkRemove`; the calendar feed reads
     * it for `editable`. Tests replace it with `mock.method`.
     */
    lockFor(row: ActivityLockRow): ActivityLock | null {
        return followUpLockOf(row);
    },
};

/** Fields of the row a CRM update may not change (spec §8.13); `[]` when unlocked. */
export function lockedFieldsFor(row: ActivityLockRow): string[] {
    return [...(activityLocks.lockFor(row)?.fields ?? [])];
}

/** The caller's reply when invited as a colleague, else null. */
export function myResponseOf(user: AuthUser, row: ActivityAccessRow): string | null {
    const mine = (row.attendees ?? []).find((attendee) => sameUser(attendee.username, user.username));
    return mine?.responseStatus ?? null;
}
