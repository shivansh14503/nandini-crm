import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { ACTIVITY_MAX_ATTENDEES, ACTIVITY_RELATED_MODULES, NOTE_TYPE, type ActivityAttendee, type ActivityRelatedModule } from '../types/activity.types';
import {
    NOTE_REMARKS_MESSAGE,
    RELATED_RECORD_MESSAGE,
    activityPastIssues,
    activityScheduleIssues,
    type ScheduleIssue,
    type ScheduleValues,
} from '../utils/activitySchedule';
import { configurableOption, customFieldsSchema, optionalDescription, optionalString, optionalText, requiredString, requiredText } from './common';

/** Same cap as the API (backend-crm modules/activities activity.validator.ts `MAX_ATTENDEES`). */
export const MAX_ACTIVITY_ATTENDEES = ACTIVITY_MAX_ATTENDEES;

/**
 * The activity form's values. `startAt` / `endAt` hold business-timezone wall clocks (`YYYY-MM-DDTHH:mm`), or the
 * first and last day (`YYYY-MM-DD`, inclusive) of an all-day activity; `toApiSchedule` turns them into the API input.
 */
export interface ActivityFormValues {
    followupType: string;
    subject: string;
    status: string;
    assignedTo: string;
    relatedModule: ActivityRelatedModule | '';
    relatedId: string;
    relatedTo: string;
    organizationName: string;
    organizationId: string;
    contact: string;
    contactId: string;
    allDay: boolean;
    startAt: string;
    endAt: string;
    reminder: string;
    location: string;
    attendees: ActivityAttendee[];
    customerResponse: string;
    remarks: string;
    customFields?: Record<string, unknown>;
}

const attendeeResponse = z.enum(['needsAction', 'accepted', 'tentative', 'declined']).optional();

/** One attendee as the form holds it (`AttendeeDto`: no row id; blank keys are left out, never `''`). */
const attendeeSchema = z.object({
    kind: z.enum(['user', 'contact', 'email'], { error: "Each attendee needs a kind: 'user', 'contact' or 'email'." }),
    username: z.string().max(L.username).optional(),
    contactId: z.string().max(50).optional(),
    email: z.string().trim().max(L.email, { message: `Email cannot exceed ${L.email} characters.` }).optional(),
    name: z.string().max(L.title).optional(),
    responseStatus: attendeeResponse,
    respondedAt: z.string().optional(),
});

/**
 * Mirrors backend-crm/src/modules/activities/activity.validator.ts (same messages). Only locked fields are required
 * here; the rest come from the form configuration (useRhfForm), and the schedule rules that need the business
 * timezone and clock from {@link activityFormRules}.
 */
export const activityFormSchema = z
    .object({
        // Same list as the Lead / Opportunity Followup Type (admin-customizable); Task and Note have code-level rules.
        followupType: requiredText('Followup Type', 30),
        subject: requiredText('Subject', L.title),
        status: configurableOption('Status', 'Planned'),
        assignedTo: requiredString('Assigned to'),
        relatedModule: z.enum(ACTIVITY_RELATED_MODULES).or(z.literal('')).optional(),
        relatedId: optionalText('Related To', 50),
        relatedTo: optionalText('Related To', L.title),
        organizationName: optionalText('Organization Name', L.organizationName),
        organizationId: optionalString,
        contact: optionalText('Contact', L.personName),
        contactId: optionalString,
        allDay: z.boolean().default(false),
        startAt: optionalString,
        endAt: optionalString,
        reminder: optionalText('Reminder', L.option),
        location: optionalText('Location', L.address),
        attendees: z
            .array(attendeeSchema)
            .max(MAX_ACTIVITY_ATTENDEES, { message: `An activity can have at most ${MAX_ACTIVITY_ATTENDEES} attendees.` })
            .default([]),
        customerResponse: optionalText('Customer Response', L.option),
        remarks: optionalDescription('Remarks', L.longText),
        customFields: customFieldsSchema,
    })
    .superRefine((activity, ctx) => {
        // A related record is a module plus a record of it, picked (not typed).
        if (Boolean(activity.relatedModule) !== Boolean(activity.relatedId) || (activity.relatedTo && !activity.relatedId)) {
            ctx.addIssue({ code: 'custom', path: ['relatedTo'], message: RELATED_RECORD_MESSAGE });
        }
        // A note is its remarks.
        if (activity.followupType === NOTE_TYPE && !activity.remarks) {
            ctx.addIssue({ code: 'custom', path: ['remarks'], message: NOTE_REMARKS_MESSAGE });
        }
    });

export interface ActivityFormRulesOptions {
    /** The business timezone (GET /api/activities/meta). */
    timeZone: string;
    /** The business clock (the server's time, not the device's). */
    now: () => Date;
    /** The schedule the form loaded (edit): an unchanged Start passes the past check, so overdue activities stay editable. */
    initial?: () => Pick<ScheduleValues, 'allDay' | 'startAt'> | undefined;
}

/**
 * The schedule rules (Start required, End not before Start, at most 31 days, no Planned start in the past), for
 * useRhfForm's `extraRules`. Read at validation time, so the latest timezone and clock apply.
 */
export function activityFormRules({ timeZone, now, initial }: ActivityFormRulesOptions): (values: ActivityFormValues) => ScheduleIssue[] {
    return (values) => {
        const schedule: ScheduleValues = {
            followupType: values.followupType,
            status: values.status,
            allDay: Boolean(values.allDay),
            startAt: values.startAt ?? '',
            endAt: values.endAt ?? '',
        };
        const issues = activityScheduleIssues(schedule, timeZone);
        if (issues.some((issue) => issue.path === 'startAt')) return issues;
        return [...issues, ...activityPastIssues(schedule, initial?.(), now(), timeZone)];
    };
}
