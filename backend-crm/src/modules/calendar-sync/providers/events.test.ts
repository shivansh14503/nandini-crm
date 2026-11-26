import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_CALENDAR_API, GRAPH_API } from '../../integrations/integration.constants.js';
import { GRAPH_MARKER_PROPERTY_ID } from '../sync.constants.js';
import type { CrmShape } from '../sync.shapes.js';
import { fakeFetch, route } from '../testing/fakeFetch.js';
import { createGoogleAdapter } from './google.js';
import { RequestedIdTakenError } from './http.js';
import { createMicrosoftAdapter } from './microsoft.js';
import type { CallCtx, CreateEventInput } from './types.js';

/**
 * Event operations of the Google and Graph adapters (Calendar Phase 2 spec §7.4, §7.5, §9.2, §9.4; admin-managed:
 * Graph `/users/{mailbox}`), against hand-written answers in the providers' documented shapes (no network: §21.2).
 */

const ctx = (over: Partial<CallCtx> = {}): CallCtx => ({ accessToken: 'tok', calendarId: 'primary', accountEmail: 'asha@nandiniinfosys.com', mailbox: 'asha@nandiniinfosys.com', ...over });

const crm: CrmShape = {
    subject: 'Demo with ACME',
    when: { allDay: false, start: '2026-12-01T04:30:00.000Z', end: '2026-12-01T05:30:00.000Z' },
    location: 'ACME HQ',
    status: 'active',
    attendees: { 'guest@acme.com': { response: 'needsAction', name: 'Guest' } },
    reminderMinutes: 15,
    description: '',
};

const input = (over: Partial<CreateEventInput> = {}): CreateEventInput => ({
    crm,
    event: { activityId: 'act-1', timeZone: 'Asia/Kolkata', visibility: 'private', crmUrl: 'https://crm.test/calendar?activity=act-1', crmLabel: 'Nandini CRM' },
    requestedId: 'crm0123456789abcdef0123456789abcdef01234567',
    attendees: { 'guest@acme.com': { response: 'needsAction', optional: false, resource: false, name: 'Guest' } },
    sendUpdates: true,
    ...over,
});

const googleEvent = (over: Record<string, unknown> = {}) => ({
    id: 'crm0123456789abcdef0123456789abcdef01234567',
    iCalUID: 'crm0123456789abcdef0123456789abcdef01234567@google.com',
    etag: '"3181161784712000"',
    updated: '2026-11-26T06:00:00.000Z',
    status: 'confirmed',
    htmlLink: 'https://www.google.com/calendar/event?eid=x',
    summary: 'Demo with ACME',
    start: { dateTime: '2026-12-01T10:00:00+05:30', timeZone: 'Asia/Kolkata' },
    end: { dateTime: '2026-12-01T11:00:00+05:30', timeZone: 'Asia/Kolkata' },
    organizer: { email: 'asha@nandiniinfosys.com', self: true },
    attendees: [{ email: 'guest@acme.com', responseStatus: 'needsAction' }],
    extendedProperties: { private: { crmActivityId: 'act-1', crmSource: 'nandini-crm' } },
    ...over,
});

const eventsUrl = `${GOOGLE_CALENDAR_API}/calendars/primary/events`;

describe('Google event operations', () => {
    it('create: POST with our id, sendUpdates, private visibility, the marker; normalized answer', async () => {
        const { fetchImpl, calls } = fakeFetch([route(eventsUrl, () => ({ status: 200, body: googleEvent() }), 'POST')]);
        const event = await createGoogleAdapter({ fetchImpl }).createEvent(ctx(), input());
        assert.equal(calls[0].url, `${eventsUrl}?sendUpdates=all`);
        assert.equal(calls[0].headers.authorization, 'Bearer tok');
        const body = calls[0].json as Record<string, unknown>;
        assert.equal(body.id, input().requestedId);
        assert.equal(body.visibility, 'private');
        assert.equal(body.iCalUID, undefined, 'never iCalUID');
        assert.deepEqual(body.extendedProperties, { private: { crmActivityId: 'act-1', crmSource: 'nandini-crm' } });
        assert.equal(event.isOrganizerCopy, true);
        assert.equal(event.crmActivityId, 'act-1');
        assert.equal(event.shape.when.start, '2026-12-01T04:30:00.000Z');
    });

    it('create 409: our own earlier copy is adopted (re-written in place); someone else’s id → RequestedIdTakenError', async () => {
        const mine = fakeFetch([
            route(eventsUrl + '?', () => ({ status: 409, body: { error: { code: 409, message: 'The requested identifier already exists.', errors: [{ reason: 'duplicate' }] } } }), 'POST'),
            route(`${eventsUrl}/${input().requestedId}`, () => ({ status: 200, body: googleEvent({ status: 'cancelled' }) }), 'GET'),
            route(`${eventsUrl}/${input().requestedId}?`, () => ({ status: 200, body: googleEvent() }), 'PATCH'),
        ]);
        const adopted = await createGoogleAdapter({ fetchImpl: mine.fetchImpl }).createEvent(ctx(), input());
        assert.equal(adopted.status, 'active');
        assert.equal((mine.calls[2].json as Record<string, unknown>).status, 'confirmed');

        const theirs = fakeFetch([
            route(eventsUrl + '?', () => ({ status: 409, body: { error: { code: 409, message: 'exists' } } }), 'POST'),
            route(`${eventsUrl}/${input().requestedId}`, () => ({ status: 200, body: googleEvent({ extendedProperties: { private: { crmActivityId: 'other' } } }) }), 'GET'),
        ]);
        await assert.rejects(createGoogleAdapter({ fetchImpl: theirs.fetchImpl }).createEvent(ctx(), input()), RequestedIdTakenError);
    });

    it('undelete re-writes the event with status confirmed and always names the attendee list ([] on a private copy, D41)', async () => {
        const { fetchImpl, calls } = fakeFetch([route(`${eventsUrl}/evt1?`, () => ({ status: 200, body: googleEvent({ id: 'evt1', attendees: undefined }) }), 'PATCH')]);
        const adapter = createGoogleAdapter({ fetchImpl });
        await adapter.undeleteEvent?.(ctx(), 'evt1', input({ attendees: {}, sendUpdates: false }));
        assert.equal(calls[0].url, `${eventsUrl}/evt1?sendUpdates=none`);
        const body = calls[0].json as Record<string, unknown>;
        assert.equal(body.status, 'confirmed');
        assert.deepEqual(body.attendees, [], 'the old guests are cleared, not kept by the PATCH');
    });

    it('Meet (P3-1): create asks with conferenceDataVersion=1 and the createRequest; the answer carries the link', async () => {
        const meet = {
            conferenceData: {
                conferenceId: 'abc-defg-hij',
                conferenceSolution: { key: { type: 'hangoutsMeet' } },
                entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }],
                createRequest: { requestId: 'rq-c1', status: { statusCode: 'success' } },
            },
            hangoutLink: 'https://meet.google.com/abc-defg-hij',
        };
        const { fetchImpl, calls } = fakeFetch([
            route(eventsUrl, () => ({ status: 200, body: googleEvent(meet) }), 'POST'),
            route(`${eventsUrl}/evt1?`, () => ({ status: 200, body: googleEvent({ id: 'evt1' }) }), 'PATCH'),
        ]);
        const adapter = createGoogleAdapter({ fetchImpl });
        const event = await adapter.createEvent(ctx(), input({ conference: { kind: 'meet', requestId: 'rq-c1' } }));
        assert.equal(calls[0].url, `${eventsUrl}?sendUpdates=all&conferenceDataVersion=1`);
        assert.deepEqual((calls[0].json as Record<string, unknown>).conferenceData, { createRequest: { requestId: 'rq-c1', conferenceSolutionKey: { type: 'hangoutsMeet' } } });
        assert.equal(event.conference?.status, 'ready');
        assert.equal(event.conference?.joinUrl, 'https://meet.google.com/abc-defg-hij');
        await adapter.patchEvent(ctx(), 'evt1', { groups: ['conference'], crm, timeZone: 'Asia/Kolkata', sendUpdates: false, conference: { kind: 'remove' } });
        assert.equal(calls[1].url, `${eventsUrl}/evt1?sendUpdates=none&conferenceDataVersion=1`);
        assert.deepEqual(calls[1].json, { conferenceData: null });
    });

    it('patch sends only the changed groups with If-Match; cancel answers gone on 410; get answers null on 404', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${eventsUrl}/evt1?`, () => ({ status: 200, body: googleEvent({ id: 'evt1' }) }), 'PATCH'),
            route(`${eventsUrl}/gone?`, () => ({ status: 410, body: { error: { code: 410, message: 'Resource has been deleted' } } }), 'DELETE'),
            route(`${eventsUrl}/missing`, () => ({ status: 404, body: { error: { code: 404, message: 'Not Found' } } }), 'GET'),
        ]);
        const adapter = createGoogleAdapter({ fetchImpl });
        await adapter.patchEvent(ctx(), 'evt1', { groups: ['subject'], crm, timeZone: 'Asia/Kolkata', etag: '"e1"', sendUpdates: false });
        assert.equal(calls[0].url, `${eventsUrl}/evt1?sendUpdates=none`);
        assert.equal(calls[0].headers['if-match'], '"e1"');
        assert.deepEqual(calls[0].json, { summary: 'Demo with ACME' });
        assert.equal(await adapter.cancelEvent(ctx(), 'gone', { sendUpdates: true }), 'gone');
        assert.equal(await adapter.getEvent(ctx(), 'missing'), null);
    });
});

const graphEvent = (over: Record<string, unknown> = {}) => ({
    id: 'AAMkAD=',
    iCalUId: '040000008200E00074C5B7101A82E008',
    '@odata.etag': 'W/"DwAAABYAAAA="',
    lastModifiedDateTime: '2026-11-26T06:00:00Z',
    isOrganizer: true,
    isAllDay: false,
    type: 'singleInstance',
    sensitivity: 'private',
    webLink: 'https://outlook.office365.com/owa/?itemid=x',
    subject: 'Demo with ACME',
    body: { contentType: 'html', content: '<html><body></body></html>' },
    start: { dateTime: '2026-12-01T10:00:00.0000000', timeZone: 'India Standard Time' },
    end: { dateTime: '2026-12-01T11:00:00.0000000', timeZone: 'India Standard Time' },
    originalStartTimeZone: 'India Standard Time',
    location: { displayName: 'ACME HQ' },
    organizer: { emailAddress: { address: 'asha@nandiniinfosys.com', name: 'Asha' } },
    attendees: [{ type: 'required', status: { response: 'none' }, emailAddress: { address: 'guest@acme.com', name: 'Guest' } }],
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
    singleValueExtendedProperties: [{ id: GRAPH_MARKER_PROPERTY_ID, value: 'act-1' }],
    ...over,
});

describe('Graph event operations (app-only: /users/{mailbox})', () => {
    const mailboxUrl = `${GRAPH_API}/users/asha%40nandiniinfosys.com/events`;

    it('create: POST /users/{mailbox}/events with transactionId, UTC times, private sensitivity, the marker; Prefer header', async () => {
        const { fetchImpl, calls } = fakeFetch([route(mailboxUrl, () => ({ status: 201, body: graphEvent() }), 'POST')]);
        const event = await createMicrosoftAdapter({ fetchImpl }).createEvent(ctx({ calendarId: '' }), input());
        assert.equal(calls[0].url, mailboxUrl);
        assert.match(calls[0].headers.prefer, /IdType="ImmutableId"/);
        assert.match(calls[0].headers.prefer, /outlook\.timezone="India Standard Time"/);
        const body = calls[0].json as Record<string, unknown>;
        assert.equal(body.transactionId, input().requestedId);
        assert.equal(body.sensitivity, 'private');
        assert.deepEqual(body.start, { dateTime: '2026-12-01T04:30:00', timeZone: 'UTC' });
        assert.deepEqual(body.singleValueExtendedProperties, [{ id: GRAPH_MARKER_PROPERTY_ID, value: 'act-1' }]);
        assert.equal(event.shape.when.start, '2026-12-01T04:30:00.000Z');
        assert.equal(event.crmActivityId, 'act-1');
        assert.equal(event.etag, 'W/"DwAAABYAAAA="');
    });

    it('Teams (P3-1): create sets isOnlineMeeting / teamsForBusiness; onlineMeeting.joinUrl is read', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(mailboxUrl, () => ({ status: 201, body: graphEvent({ isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting' } }) }), 'POST'),
        ]);
        const event = await createMicrosoftAdapter({ fetchImpl }).createEvent(ctx({ calendarId: '' }), input({ conference: { kind: 'teams' } }));
        const body = calls[0].json as Record<string, unknown>;
        assert.equal(body.isOnlineMeeting, true);
        assert.equal(body.onlineMeetingProvider, 'teamsForBusiness');
        assert.equal(event.conference?.provider, 'teams');
        assert.equal(event.conference?.joinUrl, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting');
    });

    it('patch / get / delete use the mailbox path; no /me anywhere', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${mailboxUrl}/AAMkAD%3D?`, () => ({ status: 200, body: graphEvent() }), 'PATCH'),
            route(`${mailboxUrl}/AAMkAD%3D?`, () => ({ status: 200, body: graphEvent() }), 'GET'),
            route(`${mailboxUrl}/AAMkAD%3D`, () => ({ status: 204 }), 'DELETE'),
        ]);
        const adapter = createMicrosoftAdapter({ fetchImpl });
        await adapter.patchEvent(ctx(), 'AAMkAD=', { groups: ['location', 'reminder'], crm, timeZone: 'Asia/Kolkata', etag: 'W/"x"', sendUpdates: true });
        assert.deepEqual(calls[0].json, { location: { displayName: 'ACME HQ' } }, 'reminders are written on create only');
        assert.equal(calls[0].headers['if-match'], 'W/"x"');
        assert.ok(await adapter.getEvent(ctx(), 'AAMkAD='));
        assert.equal(await adapter.cancelEvent(ctx(), 'AAMkAD=', { sendUpdates: true }), 'cancelled');
        assert.ok(calls.every((c) => !c.url.includes('/me/')));
        assert.equal(adapter.undeleteEvent, undefined);
    });
});
