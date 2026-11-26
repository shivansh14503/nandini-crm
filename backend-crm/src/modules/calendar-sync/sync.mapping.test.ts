import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { patchAttendees, withoutHeld } from './sync.attendees.js';
import { GRAPH_MARKER_PROPERTY_ID } from './sync.constants.js';
import { googleReminders, providerReminderMinutes, toGoogleEvent, toGooglePatch, type EventContext } from './sync.mapping.google.js';
import { graphReminder, toGraphEvent, toGraphPatch } from './sync.mapping.graph.js';
import type { GoogleEventWire, GraphEventWire } from './providers/wire.js';
import {
    allDayInstants,
    allInternal,
    crmChangedGroups,
    crmShapeOf,
    internalDescription,
    normalizeGoogle,
    normalizeGraph,
    providerChangedGroups,
    type ActivityShapeSource,
    type CrmShape,
} from './sync.shapes.js';

/** CRM → Google / Graph bodies and back (spec §8.1, §8.14, §9.2, §9.4): all-day round trips, zero-length, reminders. */

const IST = 'Asia/Kolkata';
const ctx: EventContext = { activityId: 'act-1', timeZone: IST, visibility: 'private', crmUrl: 'https://crm.test/calendar?activity=act-1', crmLabel: 'Nandini CRM · LD-0012' };

const source = (over: Partial<ActivityShapeSource> = {}): ActivityShapeSource => ({
    subject: 'Demo with ACME',
    status: 'Planned',
    isDeleted: false,
    startAt: new Date('2026-11-27T04:30:00.000Z'),
    endAt: new Date('2026-11-27T05:30:00.000Z'),
    allDay: false,
    timeZone: IST,
    location: ' Office ',
    reminder: '15 minutes before',
    ...over,
});

/** What Google answers for a body we sent (the fields it echoes). */
function googleEcho(body: ReturnType<typeof toGoogleEvent>, over: Partial<GoogleEventWire> = {}): GoogleEventWire {
    return {
        ...(body as unknown as GoogleEventWire),
        iCalUID: `${body.id}@google.com`,
        etag: '"1"',
        updated: '2026-11-26T06:00:00.000Z',
        status: 'confirmed',
        organizer: { email: 'asha@nandiniinfosys.com', self: true },
        htmlLink: 'https://calendar.google.com/event?eid=x',
        ...over,
    };
}

describe('CrmShape', () => {
    it('timed: instants, trimmed location, reminder minutes; deleted / Cancelled → cancelled', () => {
        const crm = crmShapeOf(source(), {}, '');
        assert.deepEqual(crm.when, { allDay: false, start: '2026-11-27T04:30:00.000Z', end: '2026-11-27T05:30:00.000Z' });
        assert.equal(crm.location, 'Office');
        assert.equal(crm.reminderMinutes, 15);
        assert.equal(crm.status, 'active');
        assert.equal(crmShapeOf(source({ status: 'Cancelled' }), {}, '').status, 'cancelled');
        assert.equal(crmShapeOf(source({ isDeleted: true }), {}, '').status, 'cancelled');
    });

    it('internal description (D15): type · code and the CRM link only; empty while any guest is external', () => {
        const text = internalDescription({ followupType: 'Meeting', relatedCode: 'LD-0012', activityId: 'act-1', appUrl: 'https://crm.test/' });
        assert.equal(text, 'Meeting · LD-0012\nOpen in Nandini CRM: https://crm.test/calendar?activity=act-1');
        assert.equal(internalDescription({ followupType: 'Call', relatedCode: null, activityId: 'a', appUrl: 'https://crm.test' }).split('\n')[0], 'Call');
        assert.equal(allInternal(['ravi@nandiniinfosys.com', 'x@mail.nandiniinfosys.com'], ['nandiniinfosys.com']), true);
        assert.equal(allInternal(['ravi@nandiniinfosys.com', 'buyer@acme.com'], ['nandiniinfosys.com']), false);
        assert.equal(allInternal([], ['nandiniinfosys.com']), true);
    });
});

describe('Google mapping', () => {
    it('insert body: our id, private, opaque, no guest edits, marker + source, popup reminder; never iCalUID', () => {
        const crm = crmShapeOf(source(), { 'buyer@acme.com': { response: 'needsAction', name: 'Buyer' } }, '');
        const body = toGoogleEvent(crm, { ...ctx, requestedId: 'crmabc', attendees: { 'buyer@acme.com': { response: 'needsAction', optional: false, resource: false, name: 'Buyer' } } });
        assert.equal(body.id, 'crmabc');
        assert.equal(body.summary, 'Demo with ACME');
        assert.deepEqual(body.start, { dateTime: '2026-11-27T04:30:00Z', timeZone: IST });
        assert.equal(body.visibility, 'private');
        assert.equal(body.transparency, 'opaque');
        assert.equal(body.guestsCanModify, false);
        assert.deepEqual(body.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] });
        assert.deepEqual(body.extendedProperties.private, { crmActivityId: 'act-1', crmSource: 'nandini-crm' });
        assert.deepEqual(body.source, { title: 'Nandini CRM · LD-0012', url: ctx.crmUrl });
        assert.deepEqual(body.attendees, [{ email: 'buyer@acme.com', displayName: 'Buyer', responseStatus: 'needsAction' }]);
        assert.ok(!('iCalUID' in body));
        assert.ok(!('visibility' in toGoogleEvent(crm, { ...ctx, visibility: 'default', requestedId: 'x', attendees: {} })), "'default' leaves the calendar's own visibility");
        assert.ok(!('attendees' in toGoogleEvent(crm, { ...ctx, requestedId: 'x', attendees: {} })), 'a private copy lists nobody');
    });

    it('all-day round trip: [27 Nov, 28 Nov) IST → date 27 / 28 (no + 1) → back unchanged; 3 days → 27 → 30', () => {
        for (const [start, end, endDate] of [
            ['2026-11-26T18:30:00.000Z', '2026-11-27T18:30:00.000Z', '2026-11-28'],
            ['2026-11-26T18:30:00.000Z', '2026-11-29T18:30:00.000Z', '2026-11-30'],
        ] as const) {
            const row = source({ allDay: true, startAt: new Date(start), endAt: new Date(end) });
            const crm = crmShapeOf(row, {}, '');
            const body = toGoogleEvent(crm, { ...ctx, requestedId: 'crmx', attendees: {} });
            assert.deepEqual(body.start, { date: '2026-11-27' });
            assert.deepEqual(body.end, { date: endDate });
            const back = normalizeGoogle(googleEcho(body), 'asha@nandiniinfosys.com');
            assert.deepEqual({ allDay: back.shape.when.allDay, start: back.shape.when.start, end: back.shape.when.end }, crm.when);
            const instants = allDayInstants(back.shape.when, IST);
            assert.equal(instants.startAt.toISOString(), start);
            assert.equal(instants.endAt.toISOString(), end);
        }
    });

    it('zero-length → a 15-minute block; the two-sided base never sees it as an edit', () => {
        const crm = crmShapeOf(source({ endAt: new Date('2026-11-27T04:30:00.000Z') }), {}, '');
        const body = toGoogleEvent(crm, { ...ctx, requestedId: 'crmx', attendees: {} });
        assert.equal((body.end as { dateTime: string }).dateTime, '2026-11-27T04:45:00Z');
        const provider = normalizeGoogle(googleEcho(body), 'asha@nandiniinfosys.com').shape;
        assert.deepEqual(crmChangedGroups(crm, crm), []);
        assert.deepEqual(providerChangedGroups(provider, provider), []);
    });

    it('reminders (§8.14): timed as is; all-day R − 540, below → calendar default; capped at 40320', () => {
        assert.equal(providerReminderMinutes(15, false), 15);
        assert.equal(providerReminderMinutes(1440, true), 900);
        assert.equal(providerReminderMinutes(0, true), null);
        assert.equal(providerReminderMinutes(99_999, false), 40_320);
        assert.deepEqual(googleReminders(null, false), { useDefault: true });
        assert.deepEqual(googleReminders(30, true), { useDefault: true });
    });

    it('patch body: only changed groups; reminders re-sent with a schedule change; description when given (also "")', () => {
        const crm = crmShapeOf(source(), {}, '');
        assert.deepEqual(toGooglePatch(['subject'], crm, { timeZone: IST }), { summary: 'Demo with ACME' });
        const moved = toGooglePatch(['when'], crm, { timeZone: 'Europe/London' });
        assert.deepEqual(moved.start, { dateTime: '2026-11-27T04:30:00Z', timeZone: 'Europe/London' });
        assert.deepEqual(moved.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] });
        assert.deepEqual(toGooglePatch(['attendees', 'description'], crm, { timeZone: IST, attendees: {}, description: '' }), { attendees: [], description: '' });
    });

    it('normalize: organizer copy, replies, rooms kept as resources, our marker, recurring / private flags', () => {
        const event = normalizeGoogle(
            {
                id: 'e1',
                status: 'confirmed',
                organizer: { email: 'Asha@NandiniInfosys.com' },
                attendees: [
                    { email: 'asha@nandiniinfosys.com', organizer: true, responseStatus: 'accepted' },
                    { email: 'Buyer@Acme.com', responseStatus: 'tentative' },
                    { email: 'room-1@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
                ],
                start: { dateTime: '2026-11-27T10:00:00+05:30', timeZone: IST },
                end: { dateTime: '2026-11-27T11:00:00+05:30' },
                extendedProperties: { private: { crmActivityId: 'act-1' } },
                recurringEventId: 'series',
                visibility: 'private',
            },
            'asha@nandiniinfosys.com',
        );
        assert.equal(event.isOrganizerCopy, true);
        assert.deepEqual(Object.keys(event.shape.attendees), ['buyer@acme.com', 'room-1@resource.calendar.google.com']);
        assert.equal(event.shape.attendees['buyer@acme.com'].response, 'tentative');
        assert.equal(event.shape.when.start, '2026-11-27T04:30:00.000Z');
        assert.equal(event.shape.when.timeZone, IST);
        assert.equal(event.crmActivityId, 'act-1');
        assert.equal(event.recurring, true);
        assert.equal(event.isPrivate, true);
    });
});

describe('Graph mapping', () => {
    it('create body: UTC times, private, busy, text body, transactionId, marker property; reminder on create only', () => {
        const crm = crmShapeOf(source(), {}, 'Meeting · LD-0012');
        const body = toGraphEvent(crm, { ...ctx, requestedId: 'crmabc', attendees: { 'buyer@acme.com': { response: 'needsAction', optional: false, resource: false } } });
        assert.deepEqual(body.start, { dateTime: '2026-11-27T04:30:00', timeZone: 'UTC' });
        assert.equal(body.isAllDay, false);
        assert.equal(body.sensitivity, 'private');
        assert.equal(body.showAs, 'busy');
        assert.equal(body.transactionId, 'crmabc');
        assert.deepEqual(body.body, { contentType: 'text', content: 'Meeting · LD-0012' });
        assert.deepEqual(body.singleValueExtendedProperties, [{ id: GRAPH_MARKER_PROPERTY_ID, value: 'act-1' }]);
        assert.deepEqual(body.attendees, [{ emailAddress: { address: 'buyer@acme.com' }, type: 'required' }]);
        assert.equal(body.isReminderOn, true);
        assert.equal(toGraphEvent(crm, { ...ctx, visibility: 'default', requestedId: 'x', attendees: {} }).sensitivity, 'normal');
        assert.deepEqual(graphReminder(30, true), { isReminderOn: false });
        assert.ok(!('isReminderOn' in toGraphPatch(['reminder', 'subject'], crm, { timeZone: IST })));
    });

    it('all-day round trip: business-zone midnights (Windows name), exclusive end, back unchanged', () => {
        const row = source({ allDay: true, startAt: new Date('2026-11-26T18:30:00.000Z'), endAt: new Date('2026-11-27T18:30:00.000Z') });
        const crm = crmShapeOf(row, {}, '');
        const body = toGraphEvent(crm, { ...ctx, requestedId: 'crmx', attendees: {} });
        assert.equal(body.isAllDay, true);
        assert.deepEqual(body.start, { dateTime: '2026-11-27T00:00:00', timeZone: 'India Standard Time' });
        assert.deepEqual(body.end, { dateTime: '2026-11-28T00:00:00', timeZone: 'India Standard Time' });
        const echo: GraphEventWire = {
            id: 'AAMk1',
            isAllDay: true,
            isOrganizer: true,
            start: { dateTime: '2026-11-27T00:00:00.0000000', timeZone: 'India Standard Time' },
            end: { dateTime: '2026-11-28T00:00:00.0000000', timeZone: 'India Standard Time' },
            originalStartTimeZone: 'India Standard Time',
            type: 'singleInstance',
            sensitivity: 'private',
            '@odata.etag': 'W/"abc"',
        };
        const back = normalizeGraph(echo);
        assert.equal(back.shape.when.start, '2026-11-27');
        assert.equal(back.shape.when.end, '2026-11-28');
        assert.equal(back.etag, 'W/"abc"');
        assert.equal(back.recurring, false);
        assert.equal(back.isPrivate, true);
    });

    it('normalize: replies mapped (tentativelyAccepted → tentative, none → needsAction), the organizer left out, HTML body as text', () => {
        const event = normalizeGraph({
            id: 'AAMk2',
            isOrganizer: true,
            start: { dateTime: '2026-11-27T10:00:00.0000000', timeZone: 'India Standard Time' },
            end: { dateTime: '2026-11-27T11:00:00.0000000', timeZone: 'India Standard Time' },
            organizer: { emailAddress: { address: 'asha@nandiniinfosys.com' } },
            attendees: [
                { type: 'required', status: { response: 'tentativelyAccepted' }, emailAddress: { address: 'Buyer@acme.com', name: 'Buyer' } },
                { type: 'optional', status: { response: 'none' }, emailAddress: { address: 'ravi@nandiniinfosys.com' } },
                { type: 'required', status: { response: 'organizer' }, emailAddress: { address: 'asha@nandiniinfosys.com' } },
            ],
            body: { contentType: 'html', content: '<html><body><p>Meeting &amp; demo</p></body></html>' },
            singleValueExtendedProperties: [{ id: GRAPH_MARKER_PROPERTY_ID, value: 'act-9' }],
        });
        assert.equal(event.shape.when.start, '2026-11-27T04:30:00.000Z');
        assert.deepEqual(event.shape.attendees, {
            'buyer@acme.com': { response: 'tentative', optional: false, resource: false, name: 'Buyer' },
            'ravi@nandiniinfosys.com': { response: 'needsAction', optional: true, resource: false },
        });
        assert.equal(event.shape.description, 'Meeting & demo');
        assert.equal(event.crmActivityId, 'act-9');
    });
});

describe('attendee lists on a patch (§8.6 step 6)', () => {
    it('provider-only people and rooms and their replies stay; CRM removals drop; CRM additions join without a reply', () => {
        const baseProvider = {
            'buyer@acme.com': { response: 'accepted' as const, optional: false, resource: false },
            'room@resource.calendar.google.com': { response: 'accepted' as const, optional: false, resource: true },
            'added-in-google@acme.com': { response: 'declined' as const, optional: true, resource: false },
            'left@acme.com': { response: 'accepted' as const, optional: false, resource: false },
        };
        const baseCrm: CrmShape['attendees'] = { 'buyer@acme.com': { response: 'needsAction' }, 'left@acme.com': { response: 'needsAction' } };
        const now: CrmShape['attendees'] = { 'buyer@acme.com': { response: 'needsAction' }, 'new@acme.com': { response: 'accepted', name: 'New' } };
        const out = patchAttendees(baseProvider, baseCrm, now);
        assert.deepEqual(Object.keys(out).sort(), ['added-in-google@acme.com', 'buyer@acme.com', 'new@acme.com', 'room@resource.calendar.google.com']);
        assert.equal(out['buyer@acme.com'].response, 'accepted', "the provider's reply stays (CRM replies are never pushed)");
        assert.deepEqual(out['new@acme.com'], { response: 'needsAction', optional: false, resource: false, name: 'New' });
    });

    it('held addresses (D41) are left out of what is sent', () => {
        assert.deepEqual(Object.keys(withoutHeld({ 'a@x.com': { response: 'needsAction' }, 'b@x.com': { response: 'needsAction' } }, ['b@x.com'])), ['a@x.com']);
    });
});
