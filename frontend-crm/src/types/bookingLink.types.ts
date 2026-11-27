/**
 * Booking links (Calendar Phase 4: public scheduling pages). Mirrors backend-crm/src/modules/booking-links
 * (bookingLink.constants.ts, bookingLink.service.ts and bookingLink.public.ts DTOs); contractSync.test.ts checks the
 * constants below against the backend. Dependency-free (the backend test loads this file at runtime).
 */

/** Who may create booking links (company setting). `managers` = managers (global-access roles) and admins. */
export const BOOKING_CREATOR_SCOPES = ['everyone', 'managers', 'admins'] as const;
export type BookingCreatorScope = (typeof BOOKING_CREATOR_SCOPES)[number];

export const BOOKING_CREATOR_SCOPE_LABELS: Readonly<Record<BookingCreatorScope, string>> = {
    everyone: 'Everyone',
    managers: 'Managers and admins',
    admins: 'Admins only',
};

/** ISO weekdays (1 = Monday … 7 = Sunday), the keys of `availability`. */
export const BOOKING_WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type BookingWeekday = (typeof BOOKING_WEEKDAYS)[number];
export const BOOKING_WEEKDAY_LABELS: Readonly<Record<BookingWeekday, string>> = {
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
    '7': 'Sunday',
};

export const BOOKING_SLOT_STEPS = [15, 30, 60] as const;
export const BOOKING_DURATION_MIN_MINUTES = 10;
export const BOOKING_DURATION_MAX_MINUTES = 240;
export const BOOKING_MAX_DURATIONS = 4;
export const BOOKING_MAX_WINDOWS_PER_DAY = 3;
export const BOOKING_MAX_BUFFER_MINUTES = 120;
export const BOOKING_MAX_NOTICE_MINUTES = 14 * 24 * 60;
export const BOOKING_MAX_HORIZON_DAYS = 60;
export const BOOKING_MAX_PER_DAY = 50;
export const BOOKING_MAX_LINKS_PER_OWNER = 20;
export const BOOKING_TITLE_MAX = 120;
export const BOOKING_LOCATION_MAX = 250;
export const BOOKING_VISITOR_NAME_MAX = 100;
export const BOOKING_VISITOR_COMPANY_MAX = 200;
export const BOOKING_VISITOR_MESSAGE_MAX = 1000;

/**
 * Default video meeting of a link's booked meetings: what the owner's admin-managed company calendar creates (Google
 * Meet with Google, Microsoft Teams with Microsoft 365). Zoom is never offered on booking links.
 */
export const BOOKING_VIDEO_PROVIDERS = ['meet', 'teams'] as const;
export type BookingVideoProvider = (typeof BOOKING_VIDEO_PROVIDERS)[number];

/** Error codes the booking-link API answers with (api-plan). */
export const BOOKING_ERROR_CODES = {
    off: 'BOOKING_LINKS_OFF',
    notAllowed: 'BOOKING_LINKS_NOT_ALLOWED',
    limit: 'BOOKING_LINK_LIMIT',
    slotUnavailable: 'SLOT_UNAVAILABLE',
    dayFull: 'BOOKING_DAY_FULL',
    rejected: 'BOOKING_REJECTED',
    calendarUnavailable: 'CALENDAR_UNAVAILABLE',
} as const;

export interface TimeWindow {
    /** `HH:mm` in the business time zone. */
    start: string;
    /** `HH:mm`, or `24:00` for midnight. */
    end: string;
}

export type WeeklyAvailability = Partial<Record<BookingWeekday, TimeWindow[]>>;

export interface BookingSettings {
    enabled: boolean;
    whoCanCreate: BookingCreatorScope;
}

export interface BookingAccess extends BookingSettings {
    /** May create and change their own links now. */
    canCreate: boolean;
    /** May see everyone's links and make one for a colleague. */
    isAdmin: boolean;
    /** Owns at least one booking link (active or not): may always see its bookings and turn it off. */
    ownsLinks: boolean;
}

/** Whether visitors can be offered times checked against the owner's company calendar. */
export type OwnerCalendarStatus = 'synced' | 'not_connected' | 'error';

export interface BookingLink {
    id: string;
    slug: string;
    /** `/book/<slug>`: the app's own origin goes in front. */
    path: string;
    ownerUsername: string;
    ownerName: string;
    title: string;
    followupType: string;
    durations: number[];
    slotStepMinutes: number;
    location: string;
    /** Default video meeting of booked meetings (null = none). */
    videoMeeting: BookingVideoProvider | null;
    note: string;
    availability: WeeklyAvailability;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    horizonDays: number;
    maxPerDay: number | null;
    reminder: string | null;
    askPhone: boolean;
    askCompany: boolean;
    relatedModule: string | null;
    relatedId: string | null;
    relatedCode: string;
    relatedLabel: string;
    isActive: boolean;
    bookings: { total: number; upcoming: number; lastBookedAt: string | null };
    ownerCalendar: OwnerCalendarStatus;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface BookingLinkList {
    access: BookingAccess;
    links: BookingLink[];
}

/** POST /api/booking-links (PUT takes the same fields but `ownerUsername`, any subset). */
export interface BookingLinkPayload {
    ownerUsername?: string;
    title: string;
    followupType: string;
    durations: number[];
    slotStepMinutes: number;
    location: string | null;
    /** 409 VIDEO_PROVIDER_NOT_CONNECTED unless the owner's company calendar creates that kind of link. */
    videoMeeting: BookingVideoProvider | null;
    note: string | null;
    availability: WeeklyAvailability;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    horizonDays: number;
    maxPerDay: number | null;
    reminder: string | null;
    askPhone: boolean;
    askCompany: boolean;
    relatedModule: string | null;
    relatedId: string | null;
    isActive: boolean;
}

export interface BookingLinkBooking {
    id: string;
    activityId: string;
    /** The activity's status now, or 'Deleted'. */
    activityStatus: string;
    start: string;
    end: string;
    visitorName: string;
    visitorEmail: string;
    visitorPhone: string;
    visitorCompany: string;
    contactId: string | null;
    createdAt: string;
}

// ── Public page (/api/public/booking) ─────────────────────────────────────────

export interface PublicBookingLink {
    slug: string;
    title: string;
    ownerName: string;
    typeLabel: string;
    durations: number[];
    defaultDuration: number;
    location: string;
    /** The video meeting booked meetings get ("Google Meet link: sent by <owner>"); null = none. */
    videoMeeting: { provider: BookingVideoProvider; label: string } | null;
    note: string;
    askPhone: boolean;
    askCompany: boolean;
    timeZone: string;
    firstDay: string;
    lastDay: string;
}

export interface PublicSlots {
    timeZone: string;
    duration: number;
    days: { date: string; slots: { start: string; token: string }[] }[];
    firstDay: string;
    lastDay: string;
    prevFrom: string | null;
    nextFrom: string | null;
}

export interface PublicBookPayload {
    token: string;
    name: string;
    email: string;
    phone?: string;
    company?: string;
    message?: string;
    /** Honeypot: hidden from people, must stay empty. */
    website?: string;
}

export interface BookingConfirmation {
    booking: {
        id: string;
        title: string;
        typeLabel: string;
        ownerName: string;
        start: string;
        end: string;
        durationMinutes: number;
        timeZone: string;
        location: string;
    };
    /** The meeting's video link: joinUrl only when it was already ready, else the organiser sends it. Null = none. */
    video: { provider: BookingVideoProvider; label: string; joinUrl: string | null } | null;
    /** iCalendar text for "Add to my calendar". */
    ics: string;
}

/** "30 min", "1 h", "1 h 30 min". */
export function durationLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}
