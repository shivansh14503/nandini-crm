import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import type { ApiFieldError } from '../../utils/httpError.js';
import { instantToZonedWallClock, zonedDayOf } from '../../utils/zonedTime.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    customFieldsSchema,
    enumWithDefault,
    optionalDate,
    optionalDescription,
    optionalEnum,
    optionalInstant,
    optionalText,
    optionalUpperText,
    requiredInstant,
    requiredText,
} from '../../validators/common.js';
import { pastValueIssues } from '../../validators/notInPast.js';
import { VIDEO_PROVIDERS } from '../calendar-sync/conference.rules.js';
import {
    ACTIVITY_DEFAULT_STATUS,
    ACTIVITY_RELATED_MODULES,
    ACTIVITY_REMINDERS,
    ACTIVITY_STATUSES,
    COMPLETED_STATUS,
    NOTE_TYPE,
    PLANNED_STATUS,
    TASK_TYPE,
} from './activity.schedule.js';

/**
 * Activity request rules (the frontend's validations/activity.schema.ts mirrors them). Only locked fields are
 * required here; the rest come from the form configuration (`checkModulePayload`), and the schedule rules that need
 * the time zone and the type's duration from `normalizeSchedule` (activity.schedule.ts).
 */

/** Attendee replies, in Google Calendar's vocabulary (Phase 2 maps Microsoft's). */
export const ATTENDEE_RESPONSES = ['needsAction', 'accepted', 'tentative', 'declined'] as const;
export type AttendeeResponse = (typeof ATTENDEE_RESPONSES)[number];
/** What an invited colleague can answer (POST /:id/response). */
export const RSVP_RESPONSES = ['accepted', 'tentative', 'declined'] as const;
export const MAX_ATTENDEES = 50;

export const RELATED_RECORD_MESSAGE = 'Pick the record this activity is related to.';
export const NOTE_REMARKS_MESSAGE = 'Remarks is required for a note.';
export const PAST_START_MESSAGE = 'Start cannot be in the past. Set Status to Completed to log an activity that already happened.';

const optionalResponse = optionalEnum('Response', ATTENDEE_RESPONSES);

/** `Required` email of an outside attendee (same rules as `optionalEmail`). */
const attendeeEmail = z.preprocess(
    (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
    z
        .string({ error: 'Attendee email is required.' })
        .trim()
        .toLowerCase()
        .max(L.email, { message: `Email cannot exceed ${L.email} characters.` })
        .pipe(z.email({ message: 'Invalid email format.' })),
);

const optionalAttendeeEmail = z.preprocess(
    (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
    z
        .string()
        .trim()
        .toLowerCase()
        .max(L.email, { message: `Email cannot exceed ${L.email} characters.` })
        .pipe(z.email({ message: 'Invalid email format.' }))
        .optional(),
);

/** One attendee: a colleague, a contact, or an outside email. Unknown keys (row ids, names of users) are dropped. */
export const attendeeInputSchema = z.discriminatedUnion(
    'kind',
    [
        z.object({ kind: z.literal('user'), username: requiredText('Attendee', L.username), responseStatus: optionalResponse }),
        z.object({
            kind: z.literal('contact'),
            contactId: requiredText('Attendee', 50),
            name: optionalText('Attendee name', L.title),
            email: optionalAttendeeEmail,
            responseStatus: optionalResponse,
        }),
        z.object({ kind: z.literal('email'), email: attendeeEmail, name: optionalText('Attendee name', L.title), responseStatus: optionalResponse }),
    ],
    { error: "Each attendee needs a kind: 'user', 'contact' or 'email'." },
);
export type AttendeeInput = z.infer<typeof attendeeInputSchema>;

/** `user:<username>` | `contact:<id>` | `email:<address>` (usernames and emails lowercased): one row per identity. */
export function attendeeIdentity(attendee: { kind: string; username?: string | null; contactId?: string | null; email?: string | null }): string {
    if (attendee.kind === 'user') return `user:${(attendee.username ?? '').trim().toLowerCase()}`;
    if (attendee.kind === 'contact') return `contact:${(attendee.contactId ?? '').trim()}`;
    return `email:${(attendee.email ?? '').trim().toLowerCase()}`;
}

/** Drops keys whose value is undefined, so a blank key is absent rather than `''` / undefined. */
function compact<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

const SCHEDULE_KEYS = ['startAt', 'endAt', 'startDay', 'endDay', 'reminder', 'location', 'customerResponse'] as const;

/**
 * Video meeting (Calendar Phase 3, P3-1): `meet` | `teams` | `zoom` (P3-2: refused as not available). `''` / null =
 * none; missing = keep what is stored (system writes that don't name it). Whether the owner can have it is checked by
 * activity.conference.ts.
 */
const videoMeetingSchema = z.preprocess(
    (value) => (value === '' ? null : value),
    z.enum(VIDEO_PROVIDERS, { error: `Video meeting must be one of: ${VIDEO_PROVIDERS.join(', ')}.` }).nullable().optional(),
);

export const activityInputSchema = z
    .object({
        // Same list as the Lead / Opportunity Followup Type (admin-customizable, so plain text); Task / Note have rules.
        followupType: requiredText('Followup Type', 30),
        subject: requiredText('Subject', L.title),
        status: enumWithDefault('Status', ACTIVITY_STATUSES, ACTIVITY_DEFAULT_STATUS),
        assignedTo: requiredText('Assigned to', L.username),
        relatedModule: optionalEnum('Related To', ACTIVITY_RELATED_MODULES),
        relatedId: optionalText('Related To', 50),
        relatedTo: optionalText('Related To', L.title),
        organizationName: optionalUpperText('Organization Name', L.organizationName),
        organizationId: optionalText('Organization', 50),
        contact: optionalText('Contact', L.personName),
        contactId: optionalText('Contact', 50),
        // Timed activities: instants with a zone. All-day ones: inclusive business-timezone days (the instants are ignored).
        startAt: optionalInstant('Start'),
        endAt: optionalInstant('End'),
        startDay: optionalDate('Start'),
        endDay: optionalDate('End'),
        allDay: z.preprocess((value) => (value === null || value === '' ? undefined : value), z.boolean({ error: 'All Day must be true or false.' }).default(false)),
        reminder: optionalEnum('Reminder', ACTIVITY_REMINDERS),
        location: optionalText('Location', L.address),
        videoMeeting: videoMeetingSchema,
        customerResponse: optionalText('Customer Response', L.option),
        remarks: optionalDescription('Remarks'),
        attendees: z.preprocess(
            (value) => (value === null ? undefined : value),
            z.array(attendeeInputSchema, { error: 'Attendees must be a list.' }).max(MAX_ATTENDEES, { message: `An activity can have at most ${MAX_ATTENDEES} attendees.` }).default([]),
        ),
        customFields: customFieldsSchema,
    })
    .transform((activity) => {
        // Task / Note are system options: read them in any case.
        const type = activity.followupType.toLowerCase();
        const followupType = type === TASK_TYPE.toLowerCase() ? TASK_TYPE : type === NOTE_TYPE.toLowerCase() ? NOTE_TYPE : activity.followupType;
        return { ...activity, followupType };
    })
    .superRefine((activity, ctx) => {
        // 1. A related record is a module plus a record of it, picked (not typed).
        if (Boolean(activity.relatedModule) !== Boolean(activity.relatedId) || (activity.relatedTo && !activity.relatedId)) {
            ctx.addIssue({ code: 'custom', path: ['relatedTo'], message: RELATED_RECORD_MESSAGE });
        }
        // 2. A note is its remarks.
        if (activity.followupType === NOTE_TYPE && !activity.remarks) {
            ctx.addIssue({ code: 'custom', path: ['remarks'], message: NOTE_REMARKS_MESSAGE });
        }
    })
    .transform((activity) => {
        // 3. One row per attendee (the first occurrence wins), with blank keys dropped.
        const seen = new Set<string>();
        let attendees = activity.attendees
            .map((attendee) => compact(attendee))
            .filter((attendee) => {
                const identity = attendeeIdentity(attendee);
                if (seen.has(identity)) return false;
                seen.add(identity);
                return true;
            });
        let { status, location } = activity;
        const cleared: Partial<Record<(typeof SCHEDULE_KEYS)[number], undefined>> = {};
        if (activity.followupType === NOTE_TYPE) {
            // A note has no schedule, reminder, place, attendees or outcome, and is done when written.
            for (const key of SCHEDULE_KEYS) cleared[key] = undefined;
            attendees = [];
            status = COMPLETED_STATUS;
            return { ...activity, ...cleared, allDay: false, location: undefined, videoMeeting: null, status, attendees };
        }
        let { videoMeeting } = activity;
        if (activity.followupType === TASK_TYPE) {
            // A task is a to-do of its owner: no invitees, no place, no video meeting.
            attendees = [];
            location = undefined;
            videoMeeting = null;
        }
        return { ...activity, status, location, videoMeeting, attendees };
    });

export type ActivityInput = z.infer<typeof activityInputSchema>;

// ── Past starts ──────────────────────────────────────────────────────────────

const GRACE_MS = 5 * 60_000;

/** The stored activity as the past check compares it (DTO form). */
export interface StoredStart {
    allDay: boolean;
    /** ISO instant, '' on notes. */
    startAt: string;
    /** `YYYY-MM-DD` when all-day, else ''. */
    startDay: string;
}

/**
 * A Planned activity can't start in the past (the CRM-wide rule for dates users enter). Completed and Cancelled ones
 * can, so a call that already happened can be logged. All-day activities compare the business-timezone day (today
 * is fine); timed ones the wall clock, with 5 minutes' grace for "log it now" from a calendar slot. An unchanged
 * stored start passes, so an overdue activity stays editable.
 */
export function activityPastIssues(
    input: { followupType: string; status: string; allDay: boolean; startAt: Date | null },
    before: StoredStart | undefined,
    now: Date,
    timeZone: string,
): ApiFieldError[] {
    if (input.status !== PLANNED_STATUS || input.followupType === NOTE_TYPE || !input.startAt) return [];
    const wallNow = instantToZonedWallClock(new Date(now.getTime() - GRACE_MS), timeZone);
    const check = input.allDay
        ? {
              kind: 'date' as const,
              path: 'startAt',
              label: 'Start',
              value: zonedDayOf(input.startAt, timeZone),
              previous: before?.allDay ? before.startDay : undefined,
          }
        : {
              kind: 'dateTime' as const,
              path: 'startAt',
              label: 'Start',
              value: instantToZonedWallClock(input.startAt, timeZone),
              previous: before && !before.allDay && before.startAt ? instantToZonedWallClock(new Date(before.startAt), timeZone) : undefined,
          };
    return pastValueIssues([check], wallNow).map((issue) => ({ ...issue, message: PAST_START_MESSAGE }));
}

// ── Queries ──────────────────────────────────────────────────────────────────

const RANGE_MESSAGE = 'Send both from and to.';
const ORDER_MESSAGE = 'to must be after from.';

export const activityListQuerySchema = z
    .object({
        followupType: csvQuery,
        status: csvQuery,
        excludeStatus: csvQuery,
        assignedTo: z.string().trim().max(L.username).optional(),
        /** Only activities the signed-in user owns ("My Activities"). */
        mine: booleanQuery,
        /** Only activities the signed-in user is invited to. */
        attending: booleanQuery,
        /** The Activities tab of a record. */
        relatedModule: z.enum(ACTIVITY_RELATED_MODULES, { error: `relatedModule must be one of: ${ACTIVITY_RELATED_MODULES.join(', ')}.` }).optional(),
        relatedId: z.string().trim().max(50).optional(),
        organizationId: z.string().trim().max(50).optional(),
        contactId: z.string().trim().max(50).optional(),
        /**
         * With organizationId: also activities related to that organization. With contactId: also those related to
         * that contact or attended by it.
         */
        rollup: booleanQuery,
        /** A window `[from, to)`: activities overlapping it, and notes written in it. */
        from: optionalInstant('from'),
        to: optionalInstant('to'),
        /** Planned activities whose end has passed. */
        overdue: booleanQuery,
        createdWithinDays: createdWithinDaysQuery,
    })
    .superRefine((query, ctx) => {
        if (Boolean(query.from) !== Boolean(query.to)) ctx.addIssue({ code: 'custom', path: [query.from ? 'to' : 'from'], message: RANGE_MESSAGE });
        else if (query.from && query.to && query.to <= query.from) ctx.addIssue({ code: 'custom', path: ['to'], message: ORDER_MESSAGE });
    });
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;

export const ACTIVITY_SORT_FIELDS = [
    'startAt',
    'endAt',
    'createdAt',
    'updatedAt',
    'subject',
    'followupType',
    'status',
    'assignedTo',
    'relatedTo',
    'organizationName',
] as const;

/** Calendar feed sources: activities, plus the follow-ups and renewal reminders other modules already store. */
export const CALENDAR_SOURCES = ['activity', 'leadFollowup', 'opportunityFollowup', 'contractRenewal'] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];
/** Statuses the calendar shows when none are asked for (Cancelled is hidden). */
export const CALENDAR_DEFAULT_STATUSES = ['Planned', 'Completed'] as const;
export const CALENDAR_MAX_RANGE_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A csv of allowed values (`?sources=activity,leadFollowup`). */
const csvOf = <const T extends readonly [string, ...string[]]>(field: string, values: T) =>
    csvQuery.pipe(z.array(z.enum(values, { error: `${field} must be among: ${values.join(', ')}.` })).optional());

export const calendarQuerySchema = z
    .object({
        /** Window start (inclusive), an instant with a zone. */
        from: requiredInstant('from'),
        /** Window end (exclusive). */
        to: requiredInstant('to'),
        /** Usernames (at most 50); default: the caller. Owner or invited colleague; derived items by owner. */
        users: csvQuery,
        /** Followup Types (activities and lead / opportunity follow-ups). */
        types: csvQuery,
        sources: csvOf('sources', CALENDAR_SOURCES),
        /** Activity statuses; default Planned and Completed. */
        status: csvOf('status', ACTIVITY_STATUSES),
    })
    .superRefine((query, ctx) => {
        const from = Date.parse(query.from);
        const to = Date.parse(query.to);
        if (to <= from) ctx.addIssue({ code: 'custom', path: ['to'], message: ORDER_MESSAGE });
        else if (to - from > CALENDAR_MAX_RANGE_DAYS * DAY_MS) {
            ctx.addIssue({ code: 'custom', path: ['to'], message: `Pick a range of at most ${CALENDAR_MAX_RANGE_DAYS} days.` });
        }
    });
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const LINK_TARGETS_MAX = 50;

export const linkTargetsQuerySchema = z.object({
    module: z.enum(ACTIVITY_RELATED_MODULES, { error: `module must be one of: ${ACTIVITY_RELATED_MODULES.join(', ')}.` }),
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(LINK_TARGETS_MAX).catch(20).default(20),
});
export type LinkTargetsQuery = z.infer<typeof linkTargetsQuerySchema>;

export const respondSchema = z.object({
    responseStatus: z.enum(RSVP_RESPONSES, { error: `responseStatus must be one of: ${RSVP_RESPONSES.join(', ')}.` }),
});
