import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { GOOGLE_CALENDAR_API, GRAPH_API } from '../../integrations/integration.constants.js';
import { fakeFetch, route } from '../testing/fakeFetch.js';
import { createGoogleAdapter } from './google.js';
import { withOwnReply } from './googleRsvp.js';
import { GRAPH_RSVP_ACTIONS } from './graphRsvp.js';
import { ProviderBadRequestError, resetProviderPauses } from './http.js';
import { createMicrosoftAdapter } from './microsoft.js';
import type { CallCtx } from './types.js';

/**
 * Replies both ways at the provider edge (Calendar Phase 2 spec §13.3, P2-8): Google's attendee PATCH of the person's
 * own copy (`If-Match`, `sendUpdates=all`, only their entry changed) and Graph's accept / tentativelyAccept / decline
 * with `sendResponse: true` on `/users/{mailbox}`; both find a copy by iCalUID. Hand-written answers in the providers'
 * documented shapes (no network).
 */

const ctx = (over: Partial<CallCtx> = {}): CallCtx => ({ accessToken: 'tok', calendarId: 'primary', accountEmail: 'asha@nandiniinfosys.com', mailbox: 'asha@nandiniinfosys.com', ...over });

const googleCopy = (over: Record<string, unknown> = {}) => ({
    id: 'evt1',
    iCalUID: 'evt1@google.com',
    etag: '"7"',
    updated: '2026-11-26T06:00:00.000Z',
    status: 'confirmed',
    summary: 'Review with ACME',
    start: { dateTime: '2026-12-01T10:00:00+05:30', timeZone: 'Asia/Kolkata' },
    end: { dateTime: '2026-12-01T11:00:00+05:30', timeZone: 'Asia/Kolkata' },
    organizer: { email: 'ravi@acme.com' },
    attendees: [
        { email: 'ravi@acme.com', organizer: true, responseStatus: 'accepted' },
        { email: 'asha@nandiniinfosys.com', self: true, responseStatus: 'needsAction', comment: 'kept', additionalGuests: 1 },
        { email: 'palak@nandiniinfosys.com', responseStatus: 'tentative' },
    ],
    ...over,
});

beforeEach(() => resetProviderPauses());

describe('withOwnReply', () => {
    it('changes only the person’s own entry (self, else by address); null when they are not on the list', () => {
        const list = [{ email: 'a@x.com', responseStatus: 'accepted' }, { email: 'B@x.com', responseStatus: 'needsAction', comment: 'hi' }];
        assert.deepEqual(withOwnReply(list, 'b@x.com', 'declined'), [list[0], { email: 'B@x.com', responseStatus: 'declined', comment: 'hi' }]);
        assert.deepEqual(withOwnReply([{ email: 'other@x.com', self: true, responseStatus: 'needsAction' }, list[0]], 'a@x.com', 'tentative')?.[0].responseStatus, 'tentative');
        assert.equal(withOwnReply(list, 'nobody@x.com', 'accepted'), null);
    });
});

describe('Google replies', () => {
    const eventsUrl = `${GOOGLE_CALENDAR_API}/calendars/primary/events`;

    it('respond: reads the copy, PATCHes the attendee list with If-Match and sendUpdates=all, only the own entry changed', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${eventsUrl}/evt1?sendUpdates=all`, (call) => ({ status: 200, body: { ...googleCopy(), etag: '"8"', attendees: (call.json as { attendees: unknown[] }).attendees } }), 'PATCH'),
            route(`${eventsUrl}/evt1`, () => ({ status: 200, body: googleCopy() }), 'GET'),
        ]);
        const event = await createGoogleAdapter({ fetchImpl }).respond?.(ctx(), 'evt1', 'accepted');
        assert.equal(calls.length, 2);
        const patch = calls[1];
        assert.equal(patch.method, 'PATCH');
        assert.equal(patch.headers['if-match'], '"7"');
        const sent = (patch.json as { attendees: Record<string, unknown>[] }).attendees;
        assert.deepEqual(Object.keys(patch.json as object), ['attendees'], 'nothing but the attendee list is sent');
        assert.deepEqual(sent[1], { email: 'asha@nandiniinfosys.com', self: true, responseStatus: 'accepted', comment: 'kept', additionalGuests: 1 });
        assert.deepEqual(sent[2], { email: 'palak@nandiniinfosys.com', responseStatus: 'tentative' }, "others' entries untouched");
        assert.equal(event?.selfResponse, 'accepted');
        assert.equal(event?.etag, '"8"');
        assert.equal(event?.isOrganizerCopy, false);
    });

    it('respond: the organizer’s own copy and a copy without the person are refused before any write', async () => {
        const { fetchImpl, calls } = fakeFetch([route(`${eventsUrl}/evt1`, () => ({ status: 200, body: googleCopy({ organizer: { email: 'asha@nandiniinfosys.com', self: true } }) }), 'GET')]);
        await assert.rejects(createGoogleAdapter({ fetchImpl }).respond?.(ctx(), 'evt1', 'declined') as Promise<unknown>, (err: unknown) => err instanceof ProviderBadRequestError && err.code === 'organizer_copy');
        const other = fakeFetch([route(`${eventsUrl}/evt1`, () => ({ status: 200, body: googleCopy({ attendees: [{ email: 'ravi@acme.com', responseStatus: 'accepted' }] }) }), 'GET')]);
        await assert.rejects(createGoogleAdapter({ fetchImpl: other.fetchImpl }).respond?.(ctx(), 'evt1', 'declined') as Promise<unknown>, (err: unknown) => err instanceof ProviderBadRequestError && err.code === 'not_invited');
        assert.equal(calls.length + other.calls.length, 2, 'reads only');
    });

    it('findByICalUid: events.list?iCalUID=…, the first live single copy', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(eventsUrl, () => ({ status: 200, body: { items: [googleCopy({ id: 'gone', status: 'cancelled' }), googleCopy()] } }), 'GET'),
        ]);
        const found = await createGoogleAdapter({ fetchImpl }).findByICalUid?.(ctx(), 'evt1@google.com');
        assert.equal(found?.id, 'evt1');
        assert.equal(found?.selfResponse, 'needsAction');
        const url = new URL(calls[0].url);
        assert.equal(url.searchParams.get('iCalUID'), 'evt1@google.com');
        assert.equal(url.searchParams.get('showDeleted'), 'false');
    });
});

describe('Microsoft Graph replies', () => {
    const base = `${GRAPH_API}/users/${encodeURIComponent('asha@nandiniinfosys.com')}`;

    it('respond: POST /users/{mailbox}/events/{id}/accept | tentativelyAccept | decline with sendResponse true (202, no body)', async () => {
        for (const [reply, action] of Object.entries(GRAPH_RSVP_ACTIONS)) {
            const { fetchImpl, calls } = fakeFetch([route(`${base}/events/AAMk%3D1/${action}`, () => ({ status: 202 }), 'POST')]);
            const result = await createMicrosoftAdapter({ fetchImpl }).respond?.(ctx(), 'AAMk=1', reply as 'accepted');
            assert.equal(result, null, 'the next pull reads the copy back');
            assert.equal(calls.length, 1);
            assert.deepEqual(calls[0].json, { sendResponse: true });
            assert.equal(calls[0].headers.authorization, 'Bearer tok');
            assert.ok(!calls[0].url.includes('/me/'), 'app-only: never /me');
        }
    });

    it('findByICalUid: $filter on iCalUId (quotes doubled), the invitation copy with its responseStatus', async () => {
        const item = {
            id: 'AAMk1',
            iCalUId: "uid-o'brien",
            '@odata.etag': 'W/"3"',
            lastModifiedDateTime: '2026-11-26T06:00:00Z',
            isOrganizer: false,
            isAllDay: false,
            type: 'singleInstance',
            subject: 'Review',
            start: { dateTime: '2026-12-01T10:00:00.0000000', timeZone: 'India Standard Time' },
            end: { dateTime: '2026-12-01T11:00:00.0000000', timeZone: 'India Standard Time' },
            organizer: { emailAddress: { address: 'ravi@acme.com' } },
            responseStatus: { response: 'tentativelyAccepted', time: '2026-11-26T06:00:00Z' },
        };
        const { fetchImpl, calls } = fakeFetch([route(`${base}/events`, () => ({ status: 200, body: { value: [item] } }), 'GET')]);
        const found = await createMicrosoftAdapter({ fetchImpl }).findByICalUid?.(ctx(), "uid-o'brien");
        assert.equal(found?.id, 'AAMk1');
        assert.equal(found?.isOrganizerCopy, false);
        assert.equal(found?.selfResponse, 'tentative');
        assert.equal(new URL(calls[0].url).searchParams.get('$filter'), "iCalUId eq 'uid-o''brien'");
    });
});
