import { addDays } from '../../utils/zonedTime.js';
import { ALL_DAY_REMINDER_OFFSET_MINUTES, CRM_SOURCE_MARKER, MAX_REMINDER_MINUTES, ZERO_LENGTH_EVENT_MINUTES } from './sync.constants.js';
import type { CrmShape, CrmWhen, FieldGroup, ProviderAttendee } from './sync.shapes.js';
import { googleConferenceBody, type ConferenceWrite } from './conference.rules.js';

/**
 * CRM → Google Calendar v3 request bodies (Calendar Phase 2 spec §9.2, §8.14). Pure.
 * - Timed: `start/end.dateTime` (RFC 3339, UTC) + `timeZone` = the activity's zone for new events, else the zone the
 *   Google event already has (the organizer's display zone isn't rewritten). Zero-length → a 15-minute block.
 * - All-day: `start/end.date`, the stored exclusive end as is (no + 1: Google's end date is exclusive too [V]).
 * - Private by default (D42), `transparency: 'opaque'`, `guestsCanModify: false`, the CRM marker in
 *   `extendedProperties.private` and `source` (creator-only [U]).
 * - Never `iCalUID` (Google takes one of `id` / `iCalUID` [V]), never remarks / customer response / custom fields.
 * - Video meeting (P3-1): `conferenceData.createRequest` (hangoutsMeet) or `conferenceData: null`, sent only with
 *   `conferenceDataVersion=1` on the URL (`googleConferenceQuery`); other writes leave the conference untouched.
 */

/** `&conferenceDataVersion=1` when the write carries conference data, else ''. */
export const googleConferenceQuery = (conference: ConferenceWrite | null | undefined) => (conference && conference.kind !== 'teams' ? '&conferenceDataVersion=1' : '');

/** What the push knows beyond the CrmShape. */
export interface EventContext {
    activityId: string;
    /** Zone the event is shown in (Activity.timeZone for new events, the provider event's own zone afterwards). */
    timeZone: string;
    /** Company setting `eventVisibility` (D42). */
    visibility: 'private' | 'default';
    /** `<APP_PUBLIC_URL>/calendar?activity=<id>` (creator-only link). */
    crmUrl: string;
    /** `Nandini CRM · LD-0012` (or `Nandini CRM`). */
    crmLabel: string;
}

const MINUTE_MS = 60_000;

/** Timed end sent to providers: a zero-length activity becomes a 15-minute block. */
export function providerTimedEnd(when: CrmWhen): string {
    const start = Date.parse(when.start);
    const end = Date.parse(when.end);
    if (!Number.isNaN(start) && (Number.isNaN(end) || end <= start)) return new Date(start + ZERO_LENGTH_EVENT_MINUTES * MINUTE_MS).toISOString();
    return new Date(end).toISOString();
}

/** All-day end day: a span whose end isn't after its start becomes one day. */
export function providerAllDayEnd(when: CrmWhen): string {
    return when.end > when.start ? when.end : addDays(when.start, 1);
}

const rfc3339 = (value: string) => new Date(value).toISOString().replace('.000Z', 'Z');

export function googleTimes(when: CrmWhen, timeZone: string) {
    if (when.allDay) return { start: { date: when.start }, end: { date: providerAllDayEnd(when) } };
    return {
        start: { dateTime: rfc3339(when.start), timeZone },
        end: { dateTime: rfc3339(providerTimedEnd(when)), timeZone },
    };
}

/**
 * Minutes before the provider event's start for a CRM reminder of `minutes` (§8.14): timed → as is; all-day → the CRM
 * reminds at 09:00 minus R, i.e. R − 540 minutes before midnight, which only exists when R ≥ 540 (else null).
 */
export function providerReminderMinutes(minutes: number | null, allDay: boolean): number | null {
    if (minutes === null) return null;
    const value = allDay ? minutes - ALL_DAY_REMINDER_OFFSET_MINUTES : minutes;
    if (value < 0) return null;
    return Math.min(value, MAX_REMINDER_MINUTES);
}

export function googleReminders(minutes: number | null, allDay: boolean) {
    const value = providerReminderMinutes(minutes, allDay);
    return value === null ? { useDefault: true } : { useDefault: false, overrides: [{ method: 'popup', minutes: value }] };
}

const RESPONSE_TO_GOOGLE: Readonly<Record<string, string>> = { needsAction: 'needsAction', accepted: 'accepted', tentative: 'tentative', declined: 'declined' };

/** Google `attendees[]` from a provider-side attendee map (rooms, optional flags and replies kept as they are). */
export function googleAttendees(attendees: Record<string, ProviderAttendee>) {
    return Object.entries(attendees).map(([email, a]) => ({
        email,
        ...(a.name ? { displayName: a.name } : {}),
        ...(a.optional ? { optional: true } : {}),
        ...(a.resource ? { resource: true } : {}),
        responseStatus: RESPONSE_TO_GOOGLE[a.response] ?? 'needsAction',
    }));
}

/** CRM attendees as a provider-side map (new invitations: no reply yet). */
export function invitationsOf(crm: CrmShape): Record<string, ProviderAttendee> {
    return Object.fromEntries(
        Object.entries(crm.attendees).map(([email, a]) => [email, { response: 'needsAction' as const, optional: false, resource: false, ...(a.name ? { name: a.name } : {}) }]),
    );
}

/** `events.insert` body. `attendees` = who is invited (empty on a private copy). */
export function toGoogleEvent(crm: CrmShape, ctx: EventContext & { requestedId: string; attendees: Record<string, ProviderAttendee>; conference?: ConferenceWrite | null }) {
    const people = googleAttendees(ctx.attendees);
    return {
        id: ctx.requestedId,
        summary: crm.subject,
        ...googleTimes(crm.when, ctx.timeZone),
        location: crm.location,
        description: crm.description,
        ...(people.length > 0 ? { attendees: people } : {}),
        reminders: googleReminders(crm.reminderMinutes, crm.when.allDay),
        transparency: 'opaque',
        guestsCanModify: false,
        ...(ctx.visibility === 'private' ? { visibility: 'private' } : {}),
        extendedProperties: { private: { crmActivityId: ctx.activityId, crmSource: CRM_SOURCE_MARKER } },
        source: { title: ctx.crmLabel, url: ctx.crmUrl },
        ...googleConferenceBody(ctx.conference),
    };
}

/**
 * `events.patch` body with only the changed groups. `attendees` (when the group changed) is the full list the event
 * should end up with (`patchAttendees`), so rooms and replies already in Google are kept.
 */
export function toGooglePatch(
    groups: readonly FieldGroup[],
    crm: CrmShape,
    ctx: Pick<EventContext, 'timeZone'> & { attendees?: Record<string, ProviderAttendee>; description?: string; conference?: ConferenceWrite | null },
): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (groups.includes('subject')) body.summary = crm.subject;
    if (groups.includes('when')) Object.assign(body, googleTimes(crm.when, ctx.timeZone));
    if (groups.includes('location')) body.location = crm.location;
    if (groups.includes('attendees') && ctx.attendees) body.attendees = googleAttendees(ctx.attendees);
    // An all-day ↔ timed switch moves the reminder anchor, so it is re-sent with the schedule.
    if (groups.includes('reminder') || groups.includes('when')) body.reminders = googleReminders(crm.reminderMinutes, crm.when.allDay);
    if (ctx.description !== undefined) body.description = ctx.description;
    if (groups.includes('conference')) Object.assign(body, googleConferenceBody(ctx.conference));
    return body;
}
