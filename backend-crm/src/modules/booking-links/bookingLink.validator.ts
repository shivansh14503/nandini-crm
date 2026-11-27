import { z } from 'zod';
import { optionalLongText, optionalPhone, optionalText, requiredText } from '../../validators/common.js';
import { ACTIVITY_RELATED_MODULES, ACTIVITY_REMINDERS } from '../activities/activity.schedule.js';
import {
    BOOKING_DURATION_MAX_MINUTES,
    BOOKING_DURATION_MIN_MINUTES,
    BOOKING_LOCATION_MAX,
    BOOKING_MAX_BUFFER_MINUTES,
    BOOKING_MAX_DURATIONS,
    BOOKING_MAX_HORIZON_DAYS,
    BOOKING_MAX_NOTICE_MINUTES,
    BOOKING_MAX_PER_DAY,
    BOOKING_MAX_WINDOWS_PER_DAY,
    BOOKING_SLOT_STEPS,
    BOOKING_TITLE_MAX,
    BOOKING_VIDEO_PROVIDERS,
    BOOKING_VISITOR_COMPANY_MAX,
    BOOKING_VISITOR_MESSAGE_MAX,
    BOOKING_VISITOR_NAME_MAX,
    BOOKING_WEEKDAYS,
} from './bookingLink.constants.js';
import { minutesOf, type WeeklyAvailability } from './bookingLink.slots.js';

/**
 * Request schemas of booking links: the management API (`/api/booking-links`, signed in) and the public booking page
 * (`/api/public/booking`, anyone). Every object is strict (unknown keys are refused) and every text is bounded by its
 * column.
 */

// ── Management ───────────────────────────────────────────────────────────────

const minutes = (field: string, min: number, max: number) =>
    z
        .number({ error: `${field} must be a number of minutes.` })
        .int({ message: `${field} must be whole minutes.` })
        .min(min, { message: `${field} must be at least ${min}.` })
        .max(max, { message: `${field} can be at most ${max}.` });

const durationsSchema = z
    .array(
        minutes('Duration', BOOKING_DURATION_MIN_MINUTES, BOOKING_DURATION_MAX_MINUTES).refine((m) => m % 5 === 0, { message: 'Durations go in steps of 5 minutes.' }),
        { error: 'Durations must be a list of minutes.' },
    )
    .min(1, { message: 'Offer at least one duration.' })
    .max(BOOKING_MAX_DURATIONS, { message: `Offer at most ${BOOKING_MAX_DURATIONS} durations.` })
    .refine((list) => new Set(list).size === list.length, { message: 'Each duration once.' });

const hhmm = (field: string, asEnd: boolean) =>
    z.string({ error: `${field} is required.` }).refine((value) => minutesOf(value, asEnd) !== null, { message: `${field} must be a time such as 09:30.` });

const windowSchema = z
    .object({ start: hhmm('From', false), end: hhmm('To', true) })
    .strict()
    .refine((w) => (minutesOf(w.end, true) ?? 0) > (minutesOf(w.start) ?? 0), { message: 'The end must be after the start.', path: ['end'] });

/** Weekly hours: ISO weekday → up to 3 windows, sorted, not overlapping; at least one window in the week. */
export const availabilitySchema = z
    .partialRecord(z.enum(BOOKING_WEEKDAYS, { error: 'Weekdays are 1 (Monday) to 7 (Sunday).' }), z.array(windowSchema).max(BOOKING_MAX_WINDOWS_PER_DAY, { message: `At most ${BOOKING_MAX_WINDOWS_PER_DAY} time ranges a day.` }))
    .transform((value): WeeklyAvailability => {
        const out: WeeklyAvailability = {};
        for (const day of BOOKING_WEEKDAYS) {
            const windows = [...(value[day] ?? [])].sort((a, b) => (minutesOf(a.start) ?? 0) - (minutesOf(b.start) ?? 0));
            if (windows.length) out[day] = windows;
        }
        return out;
    })
    .superRefine((value, ctx) => {
        let any = false;
        for (const day of BOOKING_WEEKDAYS) {
            const windows = value[day] ?? [];
            if (windows.length) any = true;
            for (let i = 1; i < windows.length; i += 1) {
                if ((minutesOf(windows[i].start) ?? 0) < (minutesOf(windows[i - 1].end, true) ?? 0)) {
                    ctx.addIssue({ code: 'custom', message: 'Time ranges of a day must not overlap.', path: [day] });
                }
            }
        }
        if (!any) ctx.addIssue({ code: 'custom', message: 'Add at least one time range.', path: [] });
    });

/** Video meeting of booked meetings: meet | teams; '' / null = none. Zoom is refused (never offered on links). */
const videoMeetingSchema = z.preprocess(
    (value) => (value === '' ? null : value),
    z.enum(BOOKING_VIDEO_PROVIDERS, { error: 'Video meeting must be Google Meet, Microsoft Teams or none.' }).nullable(),
);

const linkFields = {
    title: requiredText('Title', BOOKING_TITLE_MAX),
    followupType: requiredText('Type', 30),
    durations: durationsSchema,
    slotStepMinutes: z.union(
        BOOKING_SLOT_STEPS.map((step) => z.literal(step)) as unknown as [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>],
        { error: `Start times go every ${BOOKING_SLOT_STEPS.join(', ')} minutes.` },
    ),
    location: optionalText('Location', BOOKING_LOCATION_MAX).nullable(),
    videoMeeting: videoMeetingSchema,
    note: optionalLongText().nullable(),
    availability: availabilitySchema,
    bufferBeforeMinutes: minutes('Buffer before', 0, BOOKING_MAX_BUFFER_MINUTES),
    bufferAfterMinutes: minutes('Buffer after', 0, BOOKING_MAX_BUFFER_MINUTES),
    minNoticeMinutes: minutes('Minimum notice', 0, BOOKING_MAX_NOTICE_MINUTES),
    horizonDays: z.number({ error: 'Days ahead must be a number.' }).int().min(1, { message: 'Days ahead must be at least 1.' }).max(BOOKING_MAX_HORIZON_DAYS, { message: `Days ahead can be at most ${BOOKING_MAX_HORIZON_DAYS}.` }),
    maxPerDay: z.number({ error: 'Bookings a day must be a number.' }).int().min(1, { message: 'Bookings a day must be at least 1.' }).max(BOOKING_MAX_PER_DAY, { message: `Bookings a day can be at most ${BOOKING_MAX_PER_DAY}.` }).nullable(),
    reminder: z.enum(ACTIVITY_REMINDERS, { error: 'Pick a reminder from the list.' }).nullable(),
    askPhone: z.boolean(),
    askCompany: z.boolean(),
    relatedModule: z.enum(ACTIVITY_RELATED_MODULES, { error: 'Pick a record type from the list.' }).nullable(),
    relatedId: z.string().trim().min(1).max(50).nullable(),
    isActive: z.boolean(),
};

type LinkFieldKey = keyof typeof linkFields;

const bothOrNeither = (body: { relatedModule?: string | null; relatedId?: string | null }) =>
    (body.relatedModule === undefined && body.relatedId === undefined) || Boolean(body.relatedModule) === Boolean(body.relatedId);
const RELATED_MESSAGE = { message: 'Pick a record, or clear both the record type and the record.', path: ['relatedId'] };

/** POST /api/booking-links. `ownerUsername` (admins only; default the caller). Missing fields take the defaults. */
export const createLinkSchema = z
    .object({
        ownerUsername: z.string().trim().min(1).max(50).optional(),
        ...linkFields,
        followupType: linkFields.followupType.optional(),
        durations: linkFields.durations.optional(),
        slotStepMinutes: linkFields.slotStepMinutes.optional(),
        location: linkFields.location.optional(),
        videoMeeting: linkFields.videoMeeting.optional(),
        note: linkFields.note.optional(),
        availability: linkFields.availability.optional(),
        bufferBeforeMinutes: linkFields.bufferBeforeMinutes.optional(),
        bufferAfterMinutes: linkFields.bufferAfterMinutes.optional(),
        minNoticeMinutes: linkFields.minNoticeMinutes.optional(),
        horizonDays: linkFields.horizonDays.optional(),
        maxPerDay: linkFields.maxPerDay.optional(),
        reminder: linkFields.reminder.optional(),
        askPhone: linkFields.askPhone.optional(),
        askCompany: linkFields.askCompany.optional(),
        relatedModule: linkFields.relatedModule.optional(),
        relatedId: linkFields.relatedId.optional(),
        isActive: linkFields.isActive.optional(),
    })
    .strict()
    .refine(bothOrNeither, RELATED_MESSAGE);
export type CreateLinkInput = z.infer<typeof createLinkSchema>;

/** PUT /api/booking-links/:id: any subset (the owner doesn't change). */
export const updateLinkSchema = z
    .object(Object.fromEntries(Object.entries(linkFields).map(([key, schema]) => [key, schema.optional()])) as { [K in LinkFieldKey]: z.ZodOptional<(typeof linkFields)[K]> })
    .strict()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' })
    .refine(bothOrNeither, RELATED_MESSAGE);
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;

export const linkIdParamSchema = z.object({ id: z.string().trim().min(1).max(50) });
export const linkListQuerySchema = z.object({ scope: z.enum(['mine', 'all']).default('mine') }).strict();

// ── Public ───────────────────────────────────────────────────────────────────

/** Slugs are lower-case letters, digits and dashes (generated by the server). Anything else is a 404 before any read. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const slugParamSchema = z.object({ slug: z.string().regex(SLUG_PATTERN) });

const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** GET /api/public/booking/:slug/slots?from=YYYY-MM-DD&days=1..14&duration=<minutes>. */
export const slotsQuerySchema = z
    .object({
        from: z.string().regex(DAY_PATTERN, { message: 'from must be a day (YYYY-MM-DD).' }).optional(),
        days: z.coerce.number().int().min(1).max(14).default(7),
        duration: z.coerce.number().int().min(BOOKING_DURATION_MIN_MINUTES).max(BOOKING_DURATION_MAX_MINUTES).optional(),
    })
    .strict();
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

const visitorEmail = z
    .string({ error: 'Email is required.' })
    .trim()
    .toLowerCase()
    .min(1, { message: 'Email is required.' })
    .max(120, { message: 'Email cannot exceed 120 characters.' })
    .pipe(z.email({ message: 'Enter a valid email address.' }));

/** POST /api/public/booking/:slug/book. `website` is a honeypot: people never see it, so it must stay empty. */
export const bookBodySchema = z
    .object({
        token: z.string({ error: 'Pick a time first.' }).min(10).max(80),
        name: requiredText('Name', BOOKING_VISITOR_NAME_MAX).refine((v) => !/[<>]/.test(v), { message: 'Name cannot contain < or >.' }),
        email: visitorEmail,
        phone: optionalPhone('Phone'),
        company: optionalText('Company', BOOKING_VISITOR_COMPANY_MAX),
        message: optionalText('Message', BOOKING_VISITOR_MESSAGE_MAX),
        website: z.string().max(200).optional(),
    })
    .strict();
export type BookBody = z.infer<typeof bookBodySchema>;
