/**
 * Fixed vocabulary and limits of booking links (Calendar Phase 4: public scheduling pages). Pure. Mirrored by
 * frontend-crm/src/types/bookingLink.types.ts (contractSync.test.ts checks the two agree).
 */

/** Who may create booking links (company setting `whoCanCreate`). `managers` = global-access roles and admins. */
export const BOOKING_CREATOR_SCOPES = ['everyone', 'managers', 'admins'] as const;
export type BookingCreatorScope = (typeof BOOKING_CREATOR_SCOPES)[number];

/** ISO weekdays as keys of `availability` (1 = Monday … 7 = Sunday). */
export const BOOKING_WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type BookingWeekday = (typeof BOOKING_WEEKDAYS)[number];

/** Start times every this many minutes inside a window. */
export const BOOKING_SLOT_STEPS = [15, 30, 60] as const;
export type BookingSlotStep = (typeof BOOKING_SLOT_STEPS)[number];

export const BOOKING_DURATION_MIN_MINUTES = 10;
export const BOOKING_DURATION_MAX_MINUTES = 240;
/** Durations a visitor can choose between (first = default). */
export const BOOKING_MAX_DURATIONS = 4;
/** Windows per weekday (e.g. a morning and an afternoon). */
export const BOOKING_MAX_WINDOWS_PER_DAY = 3;
export const BOOKING_MAX_BUFFER_MINUTES = 120;
/** Minimum notice: up to 14 days. */
export const BOOKING_MAX_NOTICE_MINUTES = 14 * 24 * 60;
export const BOOKING_MAX_HORIZON_DAYS = 60;
export const BOOKING_MAX_PER_DAY = 50;
/** Booking links per owner (active or not). */
export const BOOKING_MAX_LINKS_PER_OWNER = 20;

/** Text limits (= column widths). */
export const BOOKING_TITLE_MAX = 120;
export const BOOKING_LOCATION_MAX = 250;
export const BOOKING_VISITOR_NAME_MAX = 100;
export const BOOKING_VISITOR_COMPANY_MAX = 200;
export const BOOKING_VISITOR_MESSAGE_MAX = 1000;

/** Defaults of a new link: Monday–Friday 10:00–13:00 and 14:00–18:00, 30 minutes, 4 hours notice, 30 days ahead. */
export const BOOKING_DEFAULTS = Object.freeze({
    followupType: 'Meeting',
    durations: [30] as number[],
    slotStepMinutes: 30 as BookingSlotStep,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 10,
    minNoticeMinutes: 240,
    horizonDays: 30,
    reminder: '15 minutes before',
});

/**
 * Default video meeting of a link's booked meetings (`BookingLink.videoMeeting`): what an admin-managed company
 * calendar creates with the event (Google Meet with Google, Microsoft Teams with Microsoft 365). Zoom (P3-2) needs a
 * per-user connection and is never offered on booking links. Same values as `Activity.conferenceProvider`.
 */
export const BOOKING_VIDEO_PROVIDERS = ['meet', 'teams'] as const;
export type BookingVideoProvider = (typeof BOOKING_VIDEO_PROVIDERS)[number];

/** Days the public page asks for at once (a week strip). */
export const BOOKING_SLOT_PAGE_DAYS = 7;

/**
 * The public page reads the owner's busy times in fixed 14-day blocks aligned to Mondays (from 1970-01-05), whatever
 * `from` / `days` a visitor asks for, so one link has only a handful of distinct reads (and cache keys) across its
 * horizon: slot browsing can't use up the provider-call budget with made-up windows. 14 = BUSY_PROVIDER_WINDOW_DAYS,
 * one provider call per block on a cache miss.
 */
export const BOOKING_BUSY_BLOCK_DAYS = 14;

/** A slot token is good for this long after the times were shown (the visitor fills the form meanwhile). */
export const BOOKING_TOKEN_TTL_SECONDS = 30 * 60;

/** Error codes of the booking-link routes (api-plan §4). */
export const BOOKING_ERROR_CODES = {
    /** The company switch is off (management routes). */
    off: 'BOOKING_LINKS_OFF',
    /** The user's role may not create booking links. */
    notAllowed: 'BOOKING_LINKS_NOT_ALLOWED',
    /** The owner has BOOKING_MAX_LINKS_PER_OWNER links already. */
    limit: 'BOOKING_LINK_LIMIT',
    /** The picked time can't be booked (taken, expired token, link changed, outside the hours). */
    slotUnavailable: 'SLOT_UNAVAILABLE',
    /** The day's bookings reached maxPerDay. */
    dayFull: 'BOOKING_DAY_FULL',
    /** The form was refused as automated (honeypot). */
    rejected: 'BOOKING_REJECTED',
    /** The owner's calendar can't be read right now: no times offered and nothing booked. */
    calendarUnavailable: 'CALENDAR_UNAVAILABLE',
} as const;

/**
 * Rate limits of the public routes (Redis fixed windows; an in-process counter while Redis can't count). Per IP:
 * every request. Per link: only real attempts (a live link with a valid query; a valid, unused slot token). The slots
 * per-link limit is a high backstop: slot pages read the owner's busy times in aligned windows from short caches, so
 * many visitors cost few provider calls (BOOKING_BUSY_BLOCK_DAYS).
 */
export const BOOKING_RATE_LIMITS = Object.freeze({
    view: { max: 60, windowSeconds: 60 },
    slotsPerIp: { max: 60, windowSeconds: 60 },
    slotsPerLink: { max: 3000, windowSeconds: 60 },
    bookPerIp: { max: 10, windowSeconds: 60 * 60 },
    bookPerLink: { max: 30, windowSeconds: 60 * 60 },
});

/** `Activity.origin` of a booked activity and the audit route of public bookings. */
export const BOOKING_ORIGIN = 'booking';
export const BOOKING_AUDIT_ROUTE = 'public:booking';
/** `changedBy` of the activity's audit entry and the activity's actor (nobody signed in made it). */
export const BOOKING_ACTOR = 'system';

/** Notification kind sent to the owner. */
export const BOOKING_NOTIFICATION_KIND = 'booking_created';
