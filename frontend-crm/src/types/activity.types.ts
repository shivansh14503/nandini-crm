// ─── Activity Types ───────────────────────────────────────────────────────────
// Mirrors backend-crm/src/modules/activities (ActivityDto, activity.schedule.ts, the calendar feed). The constants
// below are checked against the backend's by backend-crm/src/validators/contractSync.test.ts.

import { FOLLOWUP_TYPES } from './lead.types';

/** Followup Types offered on Activities only (system options of `shared_followup_type`). Leads / opportunities hide them. */
export const ACTIVITY_ONLY_FOLLOWUP_TYPES = ['Task', 'Note'] as const;
/** Fallback Followup Type list of the activity form (the lead / opportunity list plus Task and Note). */
export const ACTIVITY_TYPES: string[] = [...FOLLOWUP_TYPES, ...ACTIVITY_ONLY_FOLLOWUP_TYPES];
export const TASK_TYPE = 'Task';
export const NOTE_TYPE = 'Note';

/** `activity_status` (fixed system options). */
export const ACTIVITY_STATUSES = ['Planned', 'Completed', 'Cancelled'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export const PLANNED_STATUS: ActivityStatus = 'Planned';
export const COMPLETED_STATUS: ActivityStatus = 'Completed';
export const CANCELLED_STATUS: ActivityStatus = 'Cancelled';

/**
 * Built-in fields the activity form hides for a Followup Type, so they are never required for it (the form's
 * `relaxedFields`, the API's `notApplicableKeys`). Only the system types hide fields; admin-added types show all.
 */
export const ACTIVITY_NOT_APPLICABLE: Readonly<Record<string, readonly string[]>> = {
    Note: ['startAt', 'endAt', 'allDay', 'reminder', 'location', 'videoMeeting', 'attendees', 'customerResponse', 'status'],
    Task: ['endAt', 'location', 'videoMeeting', 'attendees', 'customerResponse'],
};

/** Video meeting providers (backend calendar-sync/conference.rules.ts; Calendar Phase 3, P3-1). Zoom comes later. */
export const VIDEO_PROVIDERS = ['meet', 'teams', 'zoom'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];
export const VIDEO_PROVIDER_LABELS: Readonly<Record<VideoProvider, string>> = {
    meet: 'Google Meet',
    teams: 'Microsoft Teams',
    zoom: 'Zoom',
};
export const isVideoProvider = (value: unknown): value is VideoProvider => typeof value === 'string' && (VIDEO_PROVIDERS as readonly string[]).includes(value);
/** `requested` (the calendar is creating the link), `ready`, `failed`. */
export const CONFERENCE_STATES = ['requested', 'ready', 'failed'] as const;
export type ConferenceState = (typeof CONFERENCE_STATES)[number];
/** Followup Type option meta that offers the Video meeting field on that type. */
export const VIDEO_MEETING_META_KEY = 'videoMeeting';
/** 409: the owner's company calendar can't create the chosen kind of link. */
export const VIDEO_PROVIDER_NOT_CONNECTED = 'VIDEO_PROVIDER_NOT_CONNECTED';
/** 409: a ready Teams link can't be removed or changed. */
export const VIDEO_MEETING_LOCKED = 'VIDEO_MEETING_LOCKED';
export const VIDEO_MEETING_LOCKED_MESSAGE = 'Cancel and create a new meeting to remove the Teams link.';

/** `activity_reminder` (fixed system options; the stored value is the label). */
export const ACTIVITY_REMINDERS = [
    'At start time',
    '5 minutes before',
    '10 minutes before',
    '15 minutes before',
    '30 minutes before',
    '1 hour before',
    '2 hours before',
    '1 day before',
] as const;
export type ActivityReminder = (typeof ACTIVITY_REMINDERS)[number];

/** Modules an activity can be related to. */
export const ACTIVITY_RELATED_MODULES = ['leads', 'opportunities', 'contacts', 'organizations', 'quotations', 'tickets', 'contracts'] as const;
export type ActivityRelatedModule = (typeof ACTIVITY_RELATED_MODULES)[number];
/** What the "Related To" type picker calls one record of each module. */
export const ACTIVITY_RELATED_MODULE_LABELS: Readonly<Record<ActivityRelatedModule, string>> = {
    leads: 'Lead',
    opportunities: 'Opportunity',
    contacts: 'Contact',
    organizations: 'Organization',
    quotations: 'Quotation',
    tickets: 'Ticket',
    contracts: 'Contract',
};
export const isActivityRelatedModule = (value: unknown): value is ActivityRelatedModule =>
    typeof value === 'string' && (ACTIVITY_RELATED_MODULES as readonly string[]).includes(value);

/** Longest an activity may last (days). */
export const ACTIVITY_MAX_DURATION_DAYS = 31;

/** Most attendees an activity can have. */
export const ACTIVITY_MAX_ATTENDEES = 50;

/** Attendee replies (Google Calendar's vocabulary). */
export type AttendeeResponse = 'needsAction' | 'accepted' | 'tentative' | 'declined';

/**
 * One attendee. No row id; keys without a value are left out (never `''`), so a contact without an email still
 * counts as an attendee when an admin makes Attendees required.
 */
export interface ActivityAttendee {
    kind: 'user' | 'contact' | 'email';
    username?: string;
    contactId?: string;
    email?: string;
    name?: string;
    responseStatus?: AttendeeResponse;
    /** ISO instant of the reply (read only). */
    respondedAt?: string;
}

/**
 * What the form sends. Timed activities send `startAt` / `endAt` as ISO instants with a zone; all-day ones send
 * `allDay: true` with inclusive `startDay` / `endDay` (`YYYY-MM-DD` in the business timezone), and the API ignores
 * the instants. Notes have no schedule.
 */
export interface ActivityFormData {
    customFields?: Record<string, unknown>;

    // Activity Details
    /** Option of `shared_followup_type` (Task and Note are activity-only system values). */
    followupType: string;
    subject: string;
    status: string;
    /** Owner (username). */
    assignedTo: string;
    /** The linked record's module, or '' when none. */
    relatedModule: ActivityRelatedModule | '';
    relatedId?: string;
    /** Label of the linked record. */
    relatedTo: string;
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;

    // Schedule
    /** ISO instant (`…Z`), '' on notes. */
    startAt: string;
    endAt: string;
    allDay: boolean;
    /** All-day only: inclusive days in the business timezone, '' otherwise. */
    startDay: string;
    endDay: string;
    reminder: ActivityReminder | '';
    location: string;
    /** Video meeting the owner's calendar creates (P3-1): meet | teams | zoom, '' for none. */
    videoMeeting: VideoProvider | '';
    attendees: ActivityAttendee[];

    // Outcome & Notes
    /** Option of shared_customer_response (the Leads / Opportunities list, every active option); recorded only. */
    customerResponse: string;
    remarks: string;
}

/** What the signed-in user may do with an activity. */
export interface ActivityViewer {
    canEdit: boolean;
    /** The caller's reply when invited as a colleague, else null. */
    myResponse: AttendeeResponse | null;
}

/** State of an activity's copy in its owner's calendar (backend calendar-sync/sync.constants.ts LINK_STATES). */
export const CALENDAR_LINK_STATES = ['pending', 'synced', 'error', 'cancelled', 'removed_remote', 'unsupported', 'detached'] as const;
export type CalendarLinkState = (typeof CALENDAR_LINK_STATES)[number];

/** `send` = guests are invited; `withhold` = a private copy (someone other than the owner created it, D41). */
export const CALENDAR_LINK_INVITES = ['send', 'withhold'] as const;
export type CalendarLinkInvites = (typeof CALENDAR_LINK_INVITES)[number];

/**
 * The activity in its owner's company calendar (Calendar Phase 2; data only for now, the drawer's status line comes
 * with P2-3c). Null when the owner isn't synced or the type never goes to calendars.
 */
export interface ActivityCalendarState {
    provider: string;
    state: CalendarLinkState;
    /** A CRM change is waiting to be sent to the calendar. */
    pending: boolean;
    invites: CalendarLinkInvites;
    /** Guests someone else added that wait for the owner to send the invitations. */
    heldCount: number;
    /** The viewer is the owner and there is someone to invite. */
    canSendInvites: boolean;
    lastSyncedAt: string | null;
    /** "Open in Google Calendar" (owner / editors only). */
    htmlLink: string | null;
    errorCode: string | null;
    /** The calendar's own error text (owner / editors only). */
    errorMessage: string | null;
    warning: string | null;
    conflictAt: string | null;
    externalUpdatedAt: string | null;
}

/** The activity's video meeting (P3-1): the link, or why it isn't there yet. */
export interface ActivityConferenceState {
    provider: VideoProvider;
    state: ConferenceState;
    joinUrl: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    /** The viewer may ask again (failed, and they may edit the activity). */
    canRetry: boolean;
    /** A Teams link exists: it can't be removed or changed. */
    locked: boolean;
}

/** One Video meeting choice for the form (GET /api/activities/video-options). */
export interface VideoOption {
    value: VideoProvider;
    label: string;
    available: boolean;
    /** Why not (shown on the disabled option). */
    reason?: string;
}

export interface VideoOptions {
    owner: string;
    /** google | microsoft | fake | null (the owner isn't synced). */
    calendarProvider: string | null;
    options: VideoOption[];
}

export interface Activity extends ActivityFormData {
    id: string;
    /** The ready join link ('' while none). Read only. */
    conferenceJoinUrl?: string;
    /** The video meeting's progress; null when the activity has none. */
    conference?: ActivityConferenceState | null;
    /** Record number of the linked record (LD-0001 …), '' when none. */
    relatedCode: string;
    /** IANA zone the times are entered in (the business timezone). */
    timeZone: string;
    completedAt: string;
    completedBy: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
    /**
     * Who made it: 'crm' (the CRM, any user), 'followup' (a lead / opportunity follow-up activity, which moves with
     * its record), 'calendar' (brought in from a calendar), 'booking' (booked by a visitor on a
     * public booking page, /book/<slug>). Read only.
     */
    origin?: ActivityOrigin;
    /** Sent with every activity the API returns (outside the audited record). */
    viewer?: ActivityViewer;
    /**
     * Fields this activity won't let anyone change (a follow-up activity's type, times, status, owner and related
     * record: they move with the lead / opportunity). A PUT changing one gets 409 FOLLOW_UP_ACTIVITY_LOCKED.
     */
    lockedFields?: string[];
    /** Sent with every activity the API returns: its copy in the owner's calendar, or null (not synced). */
    calendar?: ActivityCalendarState | null;
}

/** `Activity.origin` values. */
export type ActivityOrigin = 'crm' | 'followup' | 'calendar' | 'booking' | (string & {});
/** Origin of a lead / opportunity follow-up activity (Calendar Phase 2 P2-4). */
export const FOLLOW_UP_ORIGIN = 'followup';
/** Error code of a write to a locked field of a follow-up activity (409). */
export const FOLLOW_UP_ACTIVITY_LOCKED = 'FOLLOW_UP_ACTIVITY_LOCKED';

/** Whether this is a lead / opportunity follow-up activity (it moves with its record). */
export const isFollowUpActivity = (activity: Pick<Activity, 'origin'> | null | undefined): boolean => activity?.origin === FOLLOW_UP_ORIGIN;

/** GET /api/activities/meta. */
export interface ActivityMeta {
    timeZone: string;
    /** Server time (ISO), for the business clock before any activity is loaded. */
    now: string;
    relatedModules: { key: ActivityRelatedModule; label: string }[];
    /** Default length (minutes) of each Followup Type when no End is given. */
    durationMinutes: Record<string, number>;
    fallbackDurationMinutes: number;
    reminders: { value: ActivityReminder; minutes: number }[];
    statuses: ActivityStatus[];
    maxDurationDays: number;
}

export type CalendarSource = 'activity' | 'leadFollowup' | 'opportunityFollowup' | 'contractRenewal';

/** One entry of GET /api/activities/calendar. */
export interface CalendarItem {
    key: string;
    source: CalendarSource;
    module: 'activities' | 'leads' | 'opportunities' | 'contracts';
    recordId: string;
    title: string;
    followupType: string | null;
    /** ISO instant. */
    start: string;
    /** ISO instant, null for follow-ups and renewals. All-day: exclusive midnight. */
    end: string | null;
    allDay: boolean;
    /** All-day items: inclusive days in the business timezone. */
    startDay: string | null;
    endDay: string | null;
    status: string;
    assignedTo: string;
    relatedModule: string;
    relatedId: string;
    relatedTo: string;
    location: string;
    /** The ready video meeting link of an activity (P3-1); null / absent when none. */
    conferenceJoinUrl?: string | null;
    attendeeCount: number;
    myResponse: AttendeeResponse | null;
    editable: boolean;
    overdue: boolean;
    /** The activity behind an `activities` item (also for follow-up activities under a follow-up source); null for derived items. */
    activityId?: string | null;
    /** `Activity.origin` of an activity item ('followup' for a follow-up activity); null for derived items. */
    origin?: string | null;
}

export interface CalendarFeed {
    timeZone: string;
    from: string;
    to: string;
    truncated: boolean;
    items: CalendarItem[];
}

export interface CalendarFeedParams {
    /** ISO instants with a zone; `to` is exclusive, at most 62 days after `from`. */
    from: string;
    to: string;
    users?: string[];
    types?: string[];
    sources?: CalendarSource[];
    status?: ActivityStatus[];
}

// ─── Busy times (Calendar Phase 2, P2-6: GET /api/activities/busy) ───────────

/** What a block means: a meeting, a maybe, out of office (or an all-day Site Visit). */
export const BUSY_KINDS = ['busy', 'tentative', 'away'] as const;
export type BusyKind = (typeof BUSY_KINDS)[number];
/**
 * How much the CRM knows about a person: `ok` CRM + their company calendar; `not_connected` / `error` / `unavailable`
 * CRM activities only (not synced, sync problem or read refused, calendar didn't answer / out of budget or time);
 * `unknown` not an active user.
 */
export const BUSY_PERSON_STATUSES = ['ok', 'not_connected', 'error', 'unavailable', 'unknown'] as const;
export type BusyPersonStatus = (typeof BUSY_PERSON_STATUSES)[number];
/** People per request. */
export const BUSY_MAX_USERS = 20;
/** Longest window (days). */
export const BUSY_MAX_RANGE_DAYS = 31;
/** "Find a free time" slot length bounds (minutes). */
export const BUSY_SUGGEST_MIN_MINUTES = 5;
export const BUSY_SUGGEST_MAX_MINUTES = 1440;
/** Business hours and look-ahead the server searches for "Find a free time". */
export const BUSY_WORKING_HOURS = '09:00-19:00';
export const BUSY_SUGGEST_DAYS = 7;

export interface BusyBlock {
    /** ISO instants. */
    start: string;
    end: string;
    kind: BusyKind;
}

export interface BusyPerson {
    username: string;
    name: string;
    provider: 'google' | 'microsoft' | 'fake' | null;
    status: BusyPersonStatus;
    sources: string[];
    busy: BusyBlock[];
}

export interface BusyTimes {
    timeZone: string;
    from: string;
    to: string;
    generatedAt: string;
    people: BusyPerson[];
    /** Only when `suggest` was sent: the first common free slot, or null when none fits. */
    suggestion?: { start: string; end: string } | null;
}

export interface BusyTimesParams {
    /** 1–20 usernames. */
    users: string[];
    /** ISO instants with a zone; `to` exclusive, at most 31 days after `from`. */
    from: string;
    to: string;
    /** The activity being edited (its own block doesn't count). */
    exclude?: string;
    /** Ask for the first common free slot of this many minutes (5–1440). */
    suggest?: number;
}

/** One record of GET /api/activities/link-targets (the "Related To" picker). */
export interface ActivityLinkTarget {
    module: ActivityRelatedModule;
    id: string;
    code: string;
    label: string;
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;
    assignedTo: string;
}

export interface ActivityLinkTargetParams {
    module: ActivityRelatedModule;
    search?: string;
    limit?: number;
}

/** List filters of GET /api/activities (besides page / search / sort). */
export interface ActivityListParams {
    followupType?: string;
    status?: string;
    excludeStatus?: string;
    assignedTo?: string;
    mine?: boolean;
    attending?: boolean;
    relatedModule?: ActivityRelatedModule;
    relatedId?: string;
    organizationId?: string;
    contactId?: string;
    rollup?: boolean;
    /** Window `[from, to)` (ISO instants): activities overlapping it, notes written in it. */
    from?: string;
    to?: string;
    overdue?: boolean;
    createdWithinDays?: number;
}
