import { ACTIVITY_REMINDER_MINUTES, isActivityReminder } from '../activities/activity.schedule.js';
import { zonedDayOf, zonedStartOfDay } from '../../utils/zonedTime.js';
import { GRAPH_MARKER_PROPERTY_ID } from './sync.constants.js';
import { graphAllDayDay, graphInstant } from './sync.timezones.js';
import type { GoogleEventWire, GraphEventWire } from './providers/wire.js';

/**
 * The two representations the push engine compares (Calendar Phase 2 spec §8.1, D13). Pure.
 *
 * - `CrmShape`: what the CRM says the event is, derived from the Activity now.
 * - `ProviderShape`: what the provider says, normalized from its API answer.
 * - The link's base (`baseJson`) keeps both, as last agreed: a display transform on the provider side (a 15-minute
 *   block for a zero-length activity, a trimmed subject) is then never mistaken for an edit, because each side is only
 *   ever compared with its own earlier value.
 *
 * Field groups: subject, when (one unit), location, status, attendees (per email), reminder and description
 * (push-only).
 */

export type AttendeeResponse = 'needsAction' | 'accepted' | 'tentative' | 'declined';

export interface CrmWhen {
    allDay: boolean;
    /** Timed: ISO instant. All-day: `YYYY-MM-DD` of the first day in the activity's zone. */
    start: string;
    /** Timed: ISO instant. All-day: `YYYY-MM-DD` of the day after the last (exclusive end, Google's convention). */
    end: string;
}

export interface ProviderWhen extends CrmWhen {
    /** The zone the provider event is displayed in (Google `start.timeZone`, Graph `originalStartTimeZone`). */
    timeZone?: string;
}

export interface CrmAttendee {
    response: AttendeeResponse;
    /** Display name sent with the invitation (never compared). */
    name?: string;
}

export interface CrmShape {
    subject: string;
    when: CrmWhen;
    location: string;
    status: 'active' | 'cancelled';
    /** Invitable attendees by lower-cased email; the owner (organizer) is never listed. */
    attendees: Record<string, CrmAttendee>;
    reminderMinutes: number | null;
    /** The internal-only description (D15), '' when any attendee is external. */
    description: string;
}

export interface ProviderAttendee {
    response: AttendeeResponse;
    optional: boolean;
    /** A room / resource (kept on patches, never mapped to the CRM). */
    resource: boolean;
    name?: string;
}

export interface ProviderShape {
    subject: string;
    when: ProviderWhen;
    location: string;
    status: 'active' | 'cancelled';
    /** Every attendee but the organizer, by lower-cased email (resources included). */
    attendees: Record<string, ProviderAttendee>;
    /** Raw provider minutes (null = calendar default / off). Push-only: never applied to the CRM. */
    reminderMinutes: number | null;
    description: string;
    organizerEmail: string;
}

export interface SyncBase {
    crm: CrmShape;
    provider: ProviderShape;
}

export const FIELD_GROUPS = ['subject', 'when', 'location', 'status', 'attendees', 'reminder', 'description'] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

/** A provider event, normalized (spec §7.2 `ProviderEvent`). */
export interface ProviderEvent {
    id: string;
    iCalUid: string;
    etag: string;
    /** ISO instant of the provider's last change ('' when not given). */
    updated: string;
    status: 'active' | 'cancelled';
    isOrganizerCopy: boolean;
    organizerEmail: string;
    organizerName?: string;
    shape: ProviderShape;
    /** Our private marker (activity id) when the provider returned it. */
    crmActivityId?: string;
    /** A series master, occurrence or exception. */
    recurring: boolean;
    eventType: string;
    isPrivate: boolean;
    htmlLink?: string;
}

// ── CRM side ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The Activity columns a CrmShape is built from. */
export interface ActivityShapeSource {
    subject: string;
    status: string;
    isDeleted: boolean;
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
    timeZone: string;
    location: string | null;
    reminder: string | null;
}

/** Reminder minutes of an activity's `reminder` label; null for none. */
export function reminderMinutesOf(reminder: string | null | undefined): number | null {
    return isActivityReminder(reminder) ? ACTIVITY_REMINDER_MINUTES[reminder] : null;
}

/** The activity's schedule as a CrmWhen (empty strings when it has none: notes, never pushed). */
export function crmWhenOf(row: Pick<ActivityShapeSource, 'startAt' | 'endAt' | 'allDay' | 'timeZone'>): CrmWhen {
    if (!row.startAt) return { allDay: row.allDay, start: '', end: '' };
    const endAt = row.endAt ?? row.startAt;
    if (row.allDay) return { allDay: true, start: zonedDayOf(row.startAt, row.timeZone), end: zonedDayOf(endAt, row.timeZone) };
    return { allDay: false, start: row.startAt.toISOString(), end: endAt.toISOString() };
}

export function crmShapeOf(row: ActivityShapeSource, attendees: Record<string, CrmAttendee>, description: string): CrmShape {
    return {
        subject: row.subject,
        when: crmWhenOf(row),
        location: (row.location ?? '').trim(),
        status: row.isDeleted || row.status === 'Cancelled' ? 'cancelled' : 'active',
        attendees,
        reminderMinutes: reminderMinutesOf(row.reminder),
        description,
    };
}

/** Lower-cased domain of an email ('' when none). */
export const emailDomain = (email: string) => email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();

/** An address in one of the company domains (subdomains count). */
export function isCompanyAddress(email: string, companyDomains: readonly string[]): boolean {
    const domain = emailDomain(email);
    return companyDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Every listed address is a company address (no attendees counts as internal). */
export function allInternal(emails: Iterable<string>, companyDomains: readonly string[]): boolean {
    for (const email of emails) if (!isCompanyAddress(email, companyDomains)) return false;
    return true;
}

/**
 * The event description (D15): `"<Type> · <code>\nOpen in Nandini CRM: <app>/calendar?activity=<id>"` while every
 * attendee on the event is internal, else ''. Never the related record's name, remarks or custom fields.
 */
export function internalDescription(input: { followupType: string; relatedCode: string | null; activityId: string; appUrl: string }): string {
    const head = input.relatedCode ? `${input.followupType} · ${input.relatedCode}` : input.followupType;
    return `${head}\nOpen in Nandini CRM: ${crmActivityUrl(input.appUrl, input.activityId)}`;
}

export const crmActivityUrl = (appUrl: string, activityId: string) => `${appUrl.replace(/\/+$/, '')}/calendar?activity=${encodeURIComponent(activityId)}`;

// ── Comparison ────────────────────────────────────────────────────────────────────────────────────────────────

const instantKey = (value: string) => {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? value : String(ms);
};

/** Same schedule (instants compared by time, days as written; the display zone is ignored). */
export function sameWhen(a: CrmWhen, b: CrmWhen): boolean {
    if (a.allDay !== b.allDay) return false;
    if (a.allDay) return a.start === b.start && a.end === b.end;
    return instantKey(a.start) === instantKey(b.start) && instantKey(a.end) === instantKey(b.end);
}

const sortedKeys = (record: Record<string, unknown>) => Object.keys(record).sort();
const sameKeys = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(sortedKeys(a)) === JSON.stringify(sortedKeys(b));

/** Groups where the CRM now differs from the base's CRM side (attendees: the set of addresses; replies aren't pushed). */
export function crmChangedGroups(now: CrmShape, base: CrmShape): FieldGroup[] {
    const groups: FieldGroup[] = [];
    if (now.subject !== base.subject) groups.push('subject');
    if (!sameWhen(now.when, base.when)) groups.push('when');
    if (now.location !== base.location) groups.push('location');
    if (now.status !== base.status) groups.push('status');
    if (!sameKeys(now.attendees, base.attendees)) groups.push('attendees');
    if (now.reminderMinutes !== base.reminderMinutes) groups.push('reminder');
    if (now.description !== base.description) groups.push('description');
    return groups;
}

/** Non-resource attendees of a provider shape. */
export function peopleOf(attendees: Record<string, ProviderAttendee>): Record<string, ProviderAttendee> {
    return Object.fromEntries(Object.entries(attendees).filter(([, a]) => !a.resource));
}

/** Groups where the provider now differs from the base's provider side (attendees: addresses and replies). */
export function providerChangedGroups(now: ProviderShape, base: ProviderShape): FieldGroup[] {
    const groups: FieldGroup[] = [];
    if (now.subject !== base.subject) groups.push('subject');
    if (!sameWhen(now.when, base.when)) groups.push('when');
    if (now.location !== base.location) groups.push('location');
    if (now.status !== base.status) groups.push('status');
    const a = peopleOf(now.attendees);
    const b = peopleOf(base.attendees);
    if (!sameKeys(a, b) || Object.entries(a).some(([email, row]) => b[email]?.response !== row.response)) groups.push('attendees');
    return groups;
}

// ── Provider side (normalization) ──────────────────────────────────────────────────────────────────────────────

const lc = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const GOOGLE_RESPONSES: Readonly<Record<string, AttendeeResponse>> = {
    needsAction: 'needsAction',
    accepted: 'accepted',
    tentative: 'tentative',
    declined: 'declined',
};

/** Google `responseStatus` → CRM reply (§8.10). */
export const googleResponse = (value: string | null | undefined): AttendeeResponse => GOOGLE_RESPONSES[value ?? ''] ?? 'needsAction';

const GRAPH_RESPONSES: Readonly<Record<string, AttendeeResponse>> = {
    none: 'needsAction',
    notresponded: 'needsAction',
    accepted: 'accepted',
    tentativelyaccepted: 'tentative',
    declined: 'declined',
    organizer: 'accepted',
};

/** Graph `status.response` → CRM reply (§8.10; compared lower-cased). */
export const graphResponse = (value: string | null | undefined): AttendeeResponse => GRAPH_RESPONSES[lc(value)] ?? 'needsAction';

const iso = (value: string | null | undefined): string => {
    const ms = Date.parse(value ?? '');
    return Number.isNaN(ms) ? '' : new Date(ms).toISOString();
};

/** A Google event as the engine compares it. `accountEmail` identifies the organizer copy when `self` is missing. */
export function normalizeGoogle(raw: GoogleEventWire, accountEmail: string): ProviderEvent {
    const allDay = Boolean(raw.start?.date);
    const when: ProviderWhen = allDay
        ? { allDay: true, start: raw.start?.date ?? '', end: raw.end?.date ?? raw.start?.date ?? '' }
        : { allDay: false, start: iso(raw.start?.dateTime), end: iso(raw.end?.dateTime ?? raw.start?.dateTime) };
    if (raw.start?.timeZone) when.timeZone = raw.start.timeZone;

    const organizerEmail = lc(raw.organizer?.email);
    const attendees: Record<string, ProviderAttendee> = {};
    for (const a of raw.attendees ?? []) {
        const email = lc(a.email);
        if (!email || a.organizer || (a.self && email === organizerEmail)) continue;
        attendees[email] = {
            response: googleResponse(a.responseStatus),
            optional: Boolean(a.optional),
            resource: Boolean(a.resource),
            ...(a.displayName ? { name: a.displayName } : {}),
        };
    }
    const override = raw.reminders?.overrides?.find((o) => typeof o.minutes === 'number');
    const status = raw.status === 'cancelled' ? 'cancelled' : 'active';
    const shape: ProviderShape = {
        subject: raw.summary ?? '',
        when,
        location: (raw.location ?? '').trim(),
        status,
        attendees,
        reminderMinutes: raw.reminders?.useDefault || !override ? null : (override.minutes ?? null),
        description: raw.description ?? '',
        organizerEmail,
    };
    const marker = raw.extendedProperties?.private?.crmActivityId;
    return {
        id: raw.id,
        iCalUid: raw.iCalUID ?? '',
        etag: raw.etag ?? '',
        updated: iso(raw.updated),
        status,
        isOrganizerCopy: raw.organizer?.self === true || (organizerEmail !== '' && organizerEmail === lc(accountEmail)),
        organizerEmail,
        ...(raw.organizer?.displayName ? { organizerName: raw.organizer.displayName } : {}),
        shape,
        ...(marker ? { crmActivityId: marker } : {}),
        recurring: Boolean(raw.recurrence?.length) || Boolean(raw.recurringEventId),
        eventType: raw.eventType || 'default',
        isPrivate: raw.visibility === 'private' || raw.visibility === 'confidential',
        ...(raw.htmlLink ? { htmlLink: raw.htmlLink } : {}),
    };
}

/** Plain text of a Graph body (Outlook stores HTML even when text was sent): tags dropped, whitespace collapsed. */
export function graphBodyText(body: GraphEventWire['body']): string {
    const content = body?.content ?? '';
    if (lc(body?.contentType) !== 'html') return content.trim();
    return content
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t\r\f\v]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
}

/** A Graph event as the engine compares it (read with `Prefer: outlook.timezone="<business Windows zone>"`). */
export function normalizeGraph(raw: GraphEventWire): ProviderEvent {
    const allDay = Boolean(raw.isAllDay);
    let when: ProviderWhen;
    if (!raw.start) when = { allDay, start: '', end: '' };
    else if (allDay) {
        const start = graphAllDayDay(raw.start, raw.originalStartTimeZone);
        when = { allDay: true, start, end: raw.end ? graphAllDayDay(raw.end, raw.originalEndTimeZone ?? raw.originalStartTimeZone) : start };
    } else {
        when = { allDay: false, start: graphInstant(raw.start).toISOString(), end: graphInstant(raw.end ?? raw.start).toISOString() };
    }
    if (raw.originalStartTimeZone) when.timeZone = raw.originalStartTimeZone;

    const organizerEmail = lc(raw.organizer?.emailAddress?.address);
    const attendees: Record<string, ProviderAttendee> = {};
    for (const a of raw.attendees ?? []) {
        const email = lc(a.emailAddress?.address);
        if (!email || email === organizerEmail) continue;
        attendees[email] = {
            response: graphResponse(a.status?.response),
            optional: lc(a.type) === 'optional',
            resource: lc(a.type) === 'resource',
            ...(a.emailAddress?.name ? { name: a.emailAddress.name } : {}),
        };
    }
    const status = raw.isCancelled ? 'cancelled' : 'active';
    const shape: ProviderShape = {
        subject: raw.subject ?? '',
        when,
        location: (raw.location?.displayName ?? '').trim(),
        status,
        attendees,
        reminderMinutes: raw.isReminderOn ? (raw.reminderMinutesBeforeStart ?? null) : null,
        description: graphBodyText(raw.body),
        organizerEmail,
    };
    const marker = raw.singleValueExtendedProperties?.find((p) => p.id.toLowerCase() === GRAPH_MARKER_PROPERTY_ID.toLowerCase())?.value;
    return {
        id: raw.id,
        iCalUid: raw.iCalUId ?? '',
        etag: raw['@odata.etag'] ?? raw.changeKey ?? '',
        updated: iso(raw.lastModifiedDateTime),
        status,
        isOrganizerCopy: raw.isOrganizer === true,
        organizerEmail,
        ...(raw.organizer?.emailAddress?.name ? { organizerName: raw.organizer.emailAddress.name } : {}),
        shape,
        ...(marker ? { crmActivityId: marker } : {}),
        recurring: Boolean(raw.type) && raw.type !== 'singleInstance',
        eventType: 'default',
        isPrivate: Boolean(raw.sensitivity) && lc(raw.sensitivity) !== 'normal',
        ...(raw.webLink ? { htmlLink: raw.webLink } : {}),
    };
}

/** The CRM-side reading of a provider shape (what an inbound apply would write): resources and the organizer left out. */
export function crmViewOfProvider(provider: ProviderShape, base: CrmShape): CrmShape {
    const attendees: Record<string, CrmAttendee> = {};
    for (const [email, a] of Object.entries(peopleOf(provider.attendees))) attendees[email] = { response: a.response, ...(a.name ? { name: a.name } : {}) };
    return {
        subject: provider.subject,
        when: { allDay: provider.when.allDay, start: provider.when.start, end: provider.when.end },
        location: provider.location,
        status: provider.status,
        attendees,
        // Push-only groups stay as the CRM has them.
        reminderMinutes: base.reminderMinutes,
        description: base.description,
    };
}

/** All-day `YYYY-MM-DD` (exclusive end) → stored instants in `timeZone` (business-tz midnights, §8.14). */
export function allDayInstants(when: CrmWhen, timeZone: string): { startAt: Date; endAt: Date } {
    return { startAt: zonedStartOfDay(when.start, timeZone), endAt: zonedStartOfDay(when.end, timeZone) };
}
