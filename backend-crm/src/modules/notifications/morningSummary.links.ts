import { addDays, zonedDayOf } from '../../utils/zonedTime.js';

/**
 * Links in the morning summary email: CRM record pages and Google Calendar's public "add event" template, which needs
 * no API access or sign-in. The template makes a one-time copy: moving the activity in the CRM doesn't move it (the
 * email says so; real sync is Phase 2).
 */

const GOOGLE_TEMPLATE_URL = 'https://calendar.google.com/calendar/render';
/** Length given to an event that has no end (or a zero-length one: an Email, a Task). */
export const DEFAULT_EVENT_MINUTES = 30;
/** Remarks put in the event's description, at most. */
export const DETAILS_REMARKS_MAX = 500;

/** A CRM path (`/leads/<id>`) as an absolute URL of the web app. */
export function crmUrl(appUrl: string, path: string): string {
    return `${appUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Record page of a CRM module's record. */
export function recordPath(module: 'activities' | 'leads' | 'opportunities' | 'contracts', id: string): string {
    return `/${module}/${encodeURIComponent(id)}`;
}

/** `2026-11-25T05:00:00.000Z` → `20261125T050000Z` (Google's UTC basic format). */
export function utcBasic(instant: Date): string {
    return instant.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

export interface GoogleCalendarEvent {
    title: string;
    start: Date;
    /** Timed: the end instant (none or zero length → start + 30 min). All-day: business-timezone midnight after the last day. */
    end: Date | null;
    allDay: boolean;
    timeZone: string;
    details?: string;
    location?: string | null;
}

/**
 * `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&details=…&location=…&ctz=…`.
 * Timed events use UTC (`YYYYMMDDTHHMMSSZ/…`); all-day events use days with the exclusive end day
 * (`YYYYMMDD/YYYYMMDD`, as the CRM stores them). Every value is encodeURIComponent-encoded.
 */
export function googleCalendarLink(event: GoogleCalendarEvent): string {
    let dates: string;
    if (event.allDay) {
        const startDay = zonedDayOf(event.start, event.timeZone);
        const endDay = event.end && event.end.getTime() > event.start.getTime() ? zonedDayOf(event.end, event.timeZone) : addDays(startDay, 1);
        dates = `${startDay.replace(/-/g, '')}/${(endDay > startDay ? endDay : addDays(startDay, 1)).replace(/-/g, '')}`;
    } else {
        const end = event.end && event.end.getTime() > event.start.getTime() ? event.end : new Date(event.start.getTime() + DEFAULT_EVENT_MINUTES * 60_000);
        dates = `${utcBasic(event.start)}/${utcBasic(end)}`;
    }
    const params: [string, string][] = [
        ['action', 'TEMPLATE'],
        ['text', event.title],
        ['dates', dates],
    ];
    if (event.details) params.push(['details', event.details]);
    if (event.location) params.push(['location', event.location]);
    params.push(['ctz', event.timeZone]);
    return `${GOOGLE_TEMPLATE_URL}?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

/** The event description: what it is related to, the remarks (cut to ~500 characters) and the CRM link. */
export function googleCalendarDetails(parts: { related?: string; remarks?: string | null; crmLink: string }): string {
    const remarks = parts.remarks?.trim() ?? '';
    const cut = remarks.length > DETAILS_REMARKS_MAX ? `${remarks.slice(0, DETAILS_REMARKS_MAX - 1).trimEnd()}…` : remarks;
    return [parts.related ? `Related to: ${parts.related}` : '', cut, `Open in Nandini CRM: ${parts.crmLink}`].filter(Boolean).join('\n\n');
}
