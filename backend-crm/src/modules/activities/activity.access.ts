import type { Activity, Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { buildAccessScopeWhere, canAccessRecord, hasGlobalAccess } from '../shared/accessControl.js';
import { isActivityOnlyFollowupType } from '../shared/followupTypes.js';

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
    if (hasGlobalAccess(user, 'activities', 'view')) return {};
    // Invitations show whatever the role's View (Admin › Roles): a colleague's meeting is on the invitee's calendar.
    const own = buildAccessScopeWhere(user, 'assignedTo', 'activities', 'view') as Prisma.ActivityWhereInput;
    const owned = Array.isArray(own.OR) && Object.keys(own).length === 1 ? own.OR : [own];
    return { OR: [...owned, { attendees: { some: { username: user.username } } }] };
}

/** True when `user` may see the activity: View on all activities, owner / creator at View Own, or invited colleague. */
export function canViewActivity(user: AuthUser, row: ActivityAccessRow): boolean {
    if (canAccessRecord(user, row, 'activities', 'view')) return true;
    return (row.attendees ?? []).some((attendee) => sameUser(attendee.username, user.username));
}

/** True when `user` may change (`edit`, default) or delete the activity by their role: never as an invitee only. */
export function canEditActivity(user: AuthUser, row: ActivityAccessRow, action: 'edit' | 'delete' = 'edit'): boolean {
    return canAccessRecord(user, row, 'activities', action);
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

/** Activity origins: made in the CRM, a lead / opportunity follow-up (P2-4), imported (P2-8), booked on a public booking page (Phase 4). */
export const ACTIVITY_ORIGINS = ['crm', 'followup', 'calendar', 'booking'] as const;
export type ActivityOrigin = (typeof ACTIVITY_ORIGINS)[number];
export const FOLLOW_UP_ORIGIN: ActivityOrigin = 'followup';

export const FOLLOW_UP_ACTIVITY_LOCKED = 'FOLLOW_UP_ACTIVITY_LOCKED';

/**
 * What a follow-up activity takes from its lead / opportunity (spec §8.13): changed on the record (Record a follow-up),
 * never on the activity. Subject, location, attendees, reminder, remarks and custom fields stay editable.
 */
export const FOLLOW_UP_LOCKED_FIELDS = ['followupType', 'startAt', 'endAt', 'allDay', 'status', 'assignedTo', 'relatedModule', 'relatedId', 'relatedTo'] as const;

/** What the lock reads from a row (`externalOrganizer` / `organizerEmail`: P2-8; rows read without them are unlocked by it). */
export type ActivityLockRow = Pick<Activity, 'origin' | 'status' | 'relatedModule' | 'relatedCode'> & Partial<Pick<Activity, 'externalOrganizer' | 'organizerEmail'>>;

export const EXTERNAL_EVENT_LOCKED = 'EXTERNAL_EVENT_LOCKED';

/**
 * What a meeting organized outside the CRM takes from the organizer's calendar (spec §8.13, P2-8): changed there, never
 * here. The related record, remarks, customer response, Completed and custom fields stay editable; it may be deleted
 * (removed from the CRM only, the calendar event stays). `videoMeeting` (P3-1): the CRM never adds, changes or removes
 * a Meet / Teams link on someone else's event; a join link the organizer's event carries is still taken over read only
 * (sync.import.ts) and shown.
 */
export const EXTERNAL_LOCKED_FIELDS = ['subject', 'startAt', 'endAt', 'allDay', 'location', 'attendees', 'assignedTo', 'videoMeeting'] as const;

/** The lock of an externally organized meeting (`externalOrganizer`), or null for any other row. */
export function externalOrganizerLockOf(row: ActivityLockRow): ActivityLock | null {
    if (!row.externalOrganizer) return null;
    const who = row.organizerEmail ? `Organized by ${row.organizerEmail}` : 'Organized by someone outside the CRM';
    return {
        fields: EXTERNAL_LOCKED_FIELDS,
        code: EXTERNAL_EVENT_LOCKED,
        message: `${who} in their calendar. Times, title, place, attendees and the video meeting can only be changed there.`,
        deleteRefusedReason: null,
    };
}

/**
 * 409 EXTERNAL_EVENT_LOCKED body when a CRM update would turn a meeting organized outside the CRM into Task or Note
 * (activity-only types), or null. The type itself stays the CRM's (another meeting type is fine), but Task / Note drop
 * the end, place, attendees, video meeting (and for a Note the times) that the organizer's calendar owns, so the change
 * is refused before anything is derived from it (activity.service.ts `applyCrmUpdate`).
 */
export function externalTypeChangeRefusal(row: ActivityLockRow & Pick<Activity, 'followupType'>, nextType: string): { message: string; code: string } | null {
    if (!row.externalOrganizer || !isActivityOnlyFollowupType(nextType) || isActivityOnlyFollowupType(row.followupType)) return null;
    const who = row.organizerEmail ? `Organized by ${row.organizerEmail}` : 'Organized by someone outside the CRM';
    return {
        message: `${who} in their calendar. It can't become a ${nextType.trim()}: that would drop the times, place and attendees the calendar owns. Pick another meeting type.`,
        code: EXTERNAL_EVENT_LOCKED,
    };
}

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
     * The lock on a stored row, or null. P2-4: follow-up activities (`followUpLockOf`); P2-8: externally organized
     * meetings (`externalOrganizerLockOf`). `activity.service.ts` enforces it in `update`, `remove` and `bulkRemove`;
     * the calendar feed reads it for `editable`. Tests replace it with `mock.method`.
     */
    lockFor(row: ActivityLockRow): ActivityLock | null {
        return followUpLockOf(row) ?? externalOrganizerLockOf(row);
    },
};

/**
 * A Teams link that exists can't be removed or changed by its owner (Calendar Phase 3 P3-1, spec §16.3): the Video
 * meeting field is locked while `conferenceProvider = 'teams'` and `conferenceState = 'ready'` (activity.conference.ts
 * answers 409 VIDEO_MEETING_LOCKED; the form reads `ActivityView.conference.locked`). Owner changes stay allowed (the
 * old event goes; the new owner's calendar gets a new meeting, or the link shows failed). Kept out of `lockedFieldsFor`,
 * which is the follow-up lock with its own reason.
 */
export const isVideoMeetingLocked = (row: Partial<Pick<Activity, 'conferenceProvider' | 'conferenceState'>>): boolean =>
    row.conferenceProvider === 'teams' && row.conferenceState === 'ready';

/** Fields of the row a CRM update may not change (spec §8.13); `[]` when unlocked. */
export function lockedFieldsFor(row: ActivityLockRow): string[] {
    return [...(activityLocks.lockFor(row)?.fields ?? [])];
}

/** The caller's reply when invited as a colleague, else null. */
export function myResponseOf(user: AuthUser, row: ActivityAccessRow): string | null {
    const mine = (row.attendees ?? []).find((attendee) => sameUser(attendee.username, user.username));
    return mine?.responseStatus ?? null;
}
