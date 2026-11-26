import { GRAPH_MARKER_PROPERTY_ID } from './sync.constants.js';
import { providerAllDayEnd, providerReminderMinutes, providerTimedEnd, type EventContext } from './sync.mapping.google.js';
import type { CrmShape, CrmWhen, FieldGroup, ProviderAttendee } from './sync.shapes.js';
import { graphUtcDateTime, windowsZone } from './sync.timezones.js';
import { graphConferenceBody, type ConferenceWrite } from './conference.rules.js';

/**
 * CRM → Microsoft Graph v1.0 request bodies (Calendar Phase 2 spec §9.4, §8.14). Pure.
 * - Timed: UTC wall clock + `timeZone: 'UTC'`. All-day: `isAllDay` with midnights in the Windows name of the
 *   activity's zone (`India Standard Time`), the stored exclusive end as is (no + 1).
 * - `sensitivity: 'private'` by default (D42), `showAs: 'busy'`, `transactionId` = the requested id (dedupes a
 *   retried POST [V]), the CRM marker as a single-value extended property [U].
 * - Reminders are set on create only (Graph has no "don't notify" switch, §8.6); the description is plain text.
 * - Video meeting (P3-1): `isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness'`; a Teams link can't be
 *   removed or changed once set [V], so nothing is ever sent to take it off.
 */

export function graphTimes(when: CrmWhen, timeZone: string) {
    if (when.allDay) {
        const zone = windowsZone(timeZone);
        return {
            isAllDay: true,
            start: { dateTime: `${when.start}T00:00:00`, timeZone: zone },
            end: { dateTime: `${providerAllDayEnd(when)}T00:00:00`, timeZone: zone },
        };
    }
    return { isAllDay: false, start: graphUtcDateTime(new Date(when.start)), end: graphUtcDateTime(new Date(providerTimedEnd(when))) };
}

/** Graph `attendees[]` (rooms as `resource`, optional ones as `optional`; replies can't be written, Graph keeps them). */
export function graphAttendees(attendees: Record<string, ProviderAttendee>) {
    return Object.entries(attendees).map(([email, a]) => ({
        emailAddress: { address: email, ...(a.name ? { name: a.name } : {}) },
        type: a.resource ? 'resource' : a.optional ? 'optional' : 'required',
    }));
}

export function graphReminder(minutes: number | null, allDay: boolean) {
    const value = providerReminderMinutes(minutes, allDay);
    return value === null ? { isReminderOn: false } : { isReminderOn: true, reminderMinutesBeforeStart: value };
}

/** `POST /users/{mailbox}/events` body. */
export function toGraphEvent(crm: CrmShape, ctx: EventContext & { requestedId: string; attendees: Record<string, ProviderAttendee>; conference?: ConferenceWrite | null }) {
    return {
        subject: crm.subject,
        ...graphTimes(crm.when, ctx.timeZone),
        location: { displayName: crm.location },
        body: { contentType: 'text', content: crm.description },
        attendees: graphAttendees(ctx.attendees),
        ...graphReminder(crm.reminderMinutes, crm.when.allDay),
        showAs: 'busy',
        sensitivity: ctx.visibility === 'private' ? 'private' : 'normal',
        responseRequested: true,
        transactionId: ctx.requestedId,
        singleValueExtendedProperties: [{ id: GRAPH_MARKER_PROPERTY_ID, value: ctx.activityId }],
        ...graphConferenceBody(ctx.conference),
    };
}

/** `PATCH /users/{mailbox}/events/{id}` body with only the changed groups (no reminder: create only). */
export function toGraphPatch(
    groups: readonly FieldGroup[],
    crm: CrmShape,
    ctx: Pick<EventContext, 'timeZone'> & { attendees?: Record<string, ProviderAttendee>; description?: string; conference?: ConferenceWrite | null },
): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (groups.includes('subject')) body.subject = crm.subject;
    if (groups.includes('when')) Object.assign(body, graphTimes(crm.when, ctx.timeZone));
    if (groups.includes('location')) body.location = { displayName: crm.location };
    if (groups.includes('attendees') && ctx.attendees) body.attendees = graphAttendees(ctx.attendees);
    if (ctx.description !== undefined) body.body = { contentType: 'text', content: ctx.description };
    if (groups.includes('conference')) Object.assign(body, graphConferenceBody(ctx.conference));
    return body;
}
