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
    Note: ['startAt', 'endAt', 'allDay', 'reminder', 'location', 'attendees', 'customerResponse', 'status'],
    Task: ['endAt', 'location', 'attendees', 'customerResponse'],
};

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

export interface Activity extends ActivityFormData {
    id: string;
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
    /** Sent with every activity the API returns (outside the audited record). */
    viewer?: ActivityViewer;
}

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
    attendeeCount: number;
    myResponse: AttendeeResponse | null;
    editable: boolean;
    overdue: boolean;
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
