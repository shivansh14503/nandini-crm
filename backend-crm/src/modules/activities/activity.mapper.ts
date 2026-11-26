import type { Activity, ActivityAttendee, Prisma } from '../../generated/prisma/client.js';
import { nullable, parseCustomFields, serializeCustomFields, text, toIso } from '../../utils/mappers.js';
import { zonedDayOf } from '../../utils/zonedTime.js';
import type { ActivityInput } from './activity.validator.js';

/**
 * `Activity` from frontend-crm/src/types/activity.types.ts. Times are true UTC instants (`…Z`); all-day activities
 * also carry their inclusive business-timezone days. Empty values are '' (not null), except on attendees, whose
 * blank keys are omitted (see AttendeeDto).
 */
export interface ActivityDto {
    id: string;
    followupType: string;
    subject: string;
    status: string;
    /** Owner (username). */
    assignedTo: string;
    /** CrmModuleKey of the linked record, or '' when none. */
    relatedModule: string;
    relatedId?: string;
    /** Display label of the linked record. */
    relatedTo: string;
    /** Its record number (LD-0001 …), '' when none. */
    relatedCode: string;
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;
    /** ISO instant, '' on notes. All-day: business-timezone midnight of the first day. */
    startAt: string;
    /** ISO instant, '' on notes. All-day: business-timezone midnight after the last day (exclusive). */
    endAt: string;
    allDay: boolean;
    /** All-day only: first day `YYYY-MM-DD` in `timeZone`; '' otherwise. */
    startDay: string;
    /** All-day only: last day (inclusive) `YYYY-MM-DD` in `timeZone`; '' otherwise. */
    endDay: string;
    timeZone: string;
    location: string;
    /** activity_reminder option ('15 minutes before'), '' for none. */
    reminder: string;
    customerResponse: string;
    remarks: string;
    attendees: AttendeeDto[];
    completedAt: string;
    completedBy: string;
    customFields: Record<string, unknown>;
    /**
     * Where it comes from: `crm` (made in the CRM), `followup` (a lead / opportunity next follow-up, Calendar Phase 2
     * P2-4: schedule, type, status, owner and related record follow the record, see `ActivityView.lockedFields`),
     * `calendar` (imported, P2-8). Read only (set by the system write path).
     */
    origin: string;
    /** Organizer of an imported meeting (P2-8); '' when the owner organizes it. Read only. */
    organizerEmail: string;
    organizerName: string;
    /**
     * Organized outside the CRM's connected users (P2-8, D31): subject, time, place, attendees and owner are read-only
     * here (`lockedFields`, 409 EXTERNAL_EVENT_LOCKED) and the activity is never pushed. Read only.
     */
    externalOrganizer: boolean;
    createdBy: string;
    /** Username of the last editor; empty until the record is first modified. */
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * One attendee. No row id (rows are re-created when the set changes, and replies key on the username), and keys
 * without a value are left out rather than sent as '', so the shared "empty list entry" check (an object whose
 * values are all blank) never counts a contact without an email as no attendee.
 */
export interface AttendeeDto {
    kind: string;
    username?: string;
    contactId?: string;
    email?: string;
    name: string;
    responseStatus: string;
    respondedAt?: string;
}

/** What the signed-in user may do with the activity. Sent next to the DTO, outside the audited record. */
export interface ActivityViewer {
    canEdit: boolean;
    /** The caller's reply when invited as a colleague, else null. */
    myResponse: string | null;
}

/**
 * The activity in its owner's calendar (Calendar Phase 2 spec §4.4, §14.5; the drawer's status line, P2-3c), from the owner's organizer link on their live connection row; null when there is none (the owner isn't
 * synced, or the type never syncs). Outside the audited DTO. `htmlLink` and `errorMessage` only for the owner and
 * editors.
 */
export interface ActivityCalendarView {
    provider: string;
    /** calendar-sync/sync.constants.ts LINK_STATES (never `detached` here). */
    state: string;
    /** A CRM change is waiting to be pushed (the outbox `dirtyAt` is set). */
    pending: boolean;
    /** send | withhold (a private copy: attendees weren't invited, D41). */
    invites: string;
    /** Guests someone else added that wait for the owner (D41). */
    heldCount: number;
    /** The viewer is the owner and there is someone to invite (withheld copy with guests, or held guests). */
    canSendInvites: boolean;
    /**
     * Someone waits for the owner to send invitations (a withheld copy with guests, or held guests), whoever views it:
     * the owner sees Send invitations, others "Waiting for <owner> to send the invitations" (P2-3c). False while the event
     * is gone (`cancelled`, `removed_remote`): nothing can be sent until it's back (send-invites answers 409 then).
     */
    invitesWaiting: boolean;
    /**
     * Why a private copy (`invites='withhold'`) has no guests: `connected` = copied when the owner's calendar was first
     * connected (the backfill, D23); `assigned` = saved or reassigned by someone other than the owner (D41); null when
     * invitations are sent.
     */
    copyReason: 'connected' | 'assigned' | null;
    lastSyncedAt: string | null;
    htmlLink: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    warning: string | null;
    conflictAt: string | null;
    /** When a calendar change was last applied to the activity. */
    externalUpdatedAt: string | null;
}

export type ActivityView = ActivityDto & {
    viewer: ActivityViewer;
    /** The activity in its owner's calendar; null when not synced. */
    calendar: ActivityCalendarView | null;
    /**
     * ActivityDto keys a CRM `PUT` may not change (activity.access.ts `lockedFieldsFor`, spec §8.13): a follow-up
     * activity's schedule, type, status, owner and related record. `[]` when nothing is locked.
     */
    lockedFields: string[];
    /** P2-8: where an imported activity (`origin='calendar'`) came from (`google` | `microsoft` | `fake`); null otherwise. */
    importedFrom: string | null;
};

export type ActivityRow = Activity & { attendees: ActivityAttendee[] };

export function toAttendeeDto(row: Pick<ActivityAttendee, 'kind' | 'username' | 'contactId' | 'email' | 'name' | 'responseStatus' | 'respondedAt'>): AttendeeDto {
    const dto: AttendeeDto = { kind: row.kind, name: row.name, responseStatus: row.responseStatus };
    if (row.username) dto.username = row.username;
    if (row.contactId) dto.contactId = row.contactId;
    if (row.email) dto.email = row.email;
    if (row.respondedAt) dto.respondedAt = row.respondedAt.toISOString();
    return dto;
}

const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

/** Inclusive first / last day of a stored all-day span (the end is exclusive midnight). */
export function allDayRange(startAt: Date, endAt: Date | null, timeZone: string): { startDay: string; endDay: string } {
    const startDay = zonedDayOf(startAt, timeZone);
    if (!endAt || endAt.getTime() <= startAt.getTime()) return { startDay, endDay: startDay };
    return { startDay, endDay: zonedDayOf(new Date(endAt.getTime() - 1), timeZone) };
}

export function toActivityDto(row: ActivityRow): ActivityDto {
    const days = row.allDay && row.startAt ? allDayRange(row.startAt, row.endAt, row.timeZone) : { startDay: '', endDay: '' };
    return {
        id: row.id,
        followupType: row.followupType,
        subject: row.subject,
        status: row.status,
        assignedTo: row.assignedTo,
        relatedModule: text(row.relatedModule),
        relatedId: row.relatedId ?? undefined,
        relatedTo: text(row.relatedTo),
        relatedCode: text(row.relatedCode),
        organizationName: text(row.organizationName),
        organizationId: row.organizationId ?? undefined,
        contact: text(row.contact),
        contactId: row.contactId ?? undefined,
        startAt: row.startAt ? toIso(row.startAt) : '',
        endAt: row.endAt ? toIso(row.endAt) : '',
        allDay: row.allDay,
        startDay: days.startDay,
        endDay: days.endDay,
        timeZone: row.timeZone,
        location: text(row.location),
        reminder: text(row.reminder),
        customerResponse: text(row.customerResponse),
        remarks: text(row.remarks),
        attendees: [...row.attendees].sort(bySortOrder).map(toAttendeeDto),
        completedAt: row.completedAt ? toIso(row.completedAt) : '',
        completedBy: text(row.completedBy),
        customFields: parseCustomFields(row.customDataJson),
        origin: row.origin,
        organizerEmail: text(row.organizerEmail),
        organizerName: text(row.organizerName),
        externalOrganizer: row.externalOrganizer,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
}

export interface ActivityLink {
    id: string | null;
    name: string;
}

/** The linked record and the organization / contact as resolved by the service (activity.links.ts). */
export interface ActivityLinks {
    relatedModule: string | null;
    relatedId: string | null;
    relatedTo: string;
    relatedCode: string;
    organization: ActivityLink;
    contact: ActivityLink;
}

/** Start / End as stored (normalizeSchedule). */
export interface StoredSchedule {
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
}

type ActivityData = Omit<
    Prisma.ActivityUncheckedCreateInput,
    'createdBy' | 'timeZone' | 'remindAt' | 'reminderSentAt' | 'completedAt' | 'completedBy' | 'revision' | 'attendees'
>;

/** Writable columns; links come from the service, Start / End from `normalizeSchedule`. */
export function toActivityData(input: ActivityInput, links: ActivityLinks, schedule: StoredSchedule): ActivityData {
    return {
        followupType: input.followupType,
        subject: input.subject,
        status: input.status,
        assignedTo: input.assignedTo,
        relatedModule: links.relatedModule,
        relatedId: links.relatedId,
        relatedTo: nullable(links.relatedTo),
        relatedCode: nullable(links.relatedCode),
        organizationName: nullable(links.organization.name),
        organizationId: links.organization.id,
        contact: nullable(links.contact.name),
        contactId: links.contact.id,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        allDay: schedule.allDay,
        location: nullable(input.location),
        reminder: nullable(input.reminder),
        customerResponse: nullable(input.customerResponse),
        remarks: nullable(input.remarks),
        customDataJson: serializeCustomFields(input.customFields),
    };
}
