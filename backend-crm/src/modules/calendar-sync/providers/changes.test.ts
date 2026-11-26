import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_CALENDAR_API, GRAPH_API } from '../../integrations/integration.constants.js';
import { fakeFetch, route } from '../testing/fakeFetch.js';
import { createGoogleAdapter } from './google.js';
import { googleListParams } from './googleChanges.js';
import { graphDeltaUrl, isGraphLink } from './graphChanges.js';
import { CursorExpiredError, resetProviderPauses } from './http.js';
import { createMicrosoftAdapter } from './microsoft.js';
import type { CallCtx } from './types.js';

/**
 * The pull's list calls (Calendar Phase 2 spec §7.4, §7.5, §8.7; P2-5): Google `events.list` with a sync token and
 * Graph `calendarView/delta`, against hand-written answers in the providers' documented shapes (no network: §21.2).
 */

const ctx = (over: Partial<CallCtx> = {}): CallCtx => ({ accessToken: 'tok', calendarId: 'primary', accountEmail: 'asha@nandiniinfosys.com', mailbox: 'asha@nandiniinfosys.com', ...over });
const window = { start: new Date('2026-11-19T00:00:00Z'), end: new Date('2027-12-24T00:00:00Z') };

const googleItem = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    iCalUID: `${id}@google.com`,
    etag: '"1"',
    updated: '2026-11-26T06:00:00.000Z',
    status: 'confirmed',
    summary: 'Demo',
    start: { dateTime: '2026-12-01T10:00:00+05:30', timeZone: 'Asia/Kolkata' },
    end: { dateTime: '2026-12-01T11:00:00+05:30', timeZone: 'Asia/Kolkata' },
    organizer: { email: 'asha@nandiniinfosys.com', self: true },
    ...over,
});

const graphItem = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    iCalUId: `uid-${id}`,
    '@odata.etag': 'W/"1"',
    lastModifiedDateTime: '2026-11-26T06:00:00Z',
    isOrganizer: true,
    isAllDay: false,
    type: 'singleInstance',
    subject: 'Demo',
    start: { dateTime: '2026-12-01T10:00:00.0000000', timeZone: 'India Standard Time' },
    end: { dateTime: '2026-12-01T11:00:00.0000000', timeZone: 'India Standard Time' },
    organizer: { emailAddress: { address: 'asha@nandiniinfosys.com' } },
    ...over,
});

describe('Google events.list (pull)', () => {
    const eventsUrl = `${GOOGLE_CALENDAR_API}/calendars/primary/events`;

    it('parameters: a full sync bounds the window, an incremental one sends the token only; pages repeat them', () => {
        const full = googleListParams({ cursor: null, window });
        assert.equal(full.get('timeMin'), window.start.toISOString());
        assert.equal(full.get('singleEvents'), 'false');
        assert.equal(full.get('showDeleted'), 'false');
        assert.equal(full.get('maxResults'), '250');
        assert.equal(full.get('syncToken'), null);
        const incremental = googleListParams({ cursor: 'tok-1', pageToken: 'p2', window });
        assert.equal(incremental.get('syncToken'), 'tok-1');
        assert.equal(incremental.get('pageToken'), 'p2');
        assert.equal(incremental.get('timeMin'), null);
    });

    it('pages: events normalized, unreadable items counted, the sync token only on the last page', async () => {
        resetProviderPauses();
        const { fetchImpl, calls } = fakeFetch([
            route(eventsUrl, (call) =>
                call.url.includes('pageToken=p2')
                    ? { status: 200, body: { items: [googleItem('e2', { status: 'cancelled' })], nextSyncToken: 'sync-2' } }
                    : { status: 200, body: { items: [googleItem('e1'), { id: 42 }], nextPageToken: 'p2', nextSyncToken: 'ignored' } },
            ),
        ]);
        const adapter = createGoogleAdapter({ fetchImpl });
        const first = await adapter.listChanges(ctx(), { cursor: null, window });
        assert.equal(first.events.length, 1);
        assert.equal(first.events[0].id, 'e1');
        assert.equal(first.events[0].isOrganizerCopy, true);
        assert.equal(first.unreadable, 1);
        assert.equal(first.nextPageToken, 'p2');
        assert.equal(first.nextCursor, undefined);
        const second = await adapter.listChanges(ctx(), { cursor: null, pageToken: 'p2', window });
        assert.equal(second.events[0].status, 'cancelled');
        assert.equal(second.nextCursor, 'sync-2');
        assert.equal(calls[0].headers.authorization, 'Bearer tok');
    });

    it('410 on the sync token → CursorExpiredError (full resync)', async () => {
        resetProviderPauses();
        const { fetchImpl } = fakeFetch([route(eventsUrl, () => ({ status: 410, body: { error: { code: 410, message: 'Sync token is no longer valid', errors: [{ reason: 'fullSyncRequired' }] } } }))]);
        await assert.rejects(createGoogleAdapter({ fetchImpl }).listChanges(ctx(), { cursor: 'old', window }), CursorExpiredError);
    });
});

describe('Graph calendarView/delta (pull)', () => {
    const deltaUrl = `${GRAPH_API}/users/asha%40nandiniinfosys.com/calendarView/delta`;

    it('links: only https Graph v1.0 URLs are followed; the first page carries the window', () => {
        assert.equal(isGraphLink(`${GRAPH_API}/users/x/calendarView/delta?$deltatoken=abc`), true);
        assert.equal(isGraphLink('https://evil.example.com/v1.0/users/x'), false);
        assert.equal(isGraphLink('http://graph.microsoft.com/v1.0/users/x'), false);
        assert.equal(isGraphLink('https://graph.microsoft.com/beta/users/x'), false);
        assert.equal(isGraphLink('not a url'), false);
        const first = new URL(graphDeltaUrl('asha@nandiniinfosys.com', { cursor: null, window }));
        assert.equal(`${first.origin}${first.pathname}`, deltaUrl);
        assert.equal(first.searchParams.get('startDateTime'), window.start.toISOString());
        assert.equal(first.searchParams.get('endDateTime'), window.end.toISOString());
        assert.equal(graphDeltaUrl('m', { cursor: 'c', pageToken: 'p', window }), 'p');
        assert.equal(graphDeltaUrl('m', { cursor: 'c', window }), 'c');
    });

    it('pages: events, @removed ids, unreadable items; the delta link becomes the cursor; 100 per page', async () => {
        resetProviderPauses();
        const next = `${GRAPH_API}/users/asha%40nandiniinfosys.com/calendarView/delta?$skiptoken=s2`;
        const delta = `${GRAPH_API}/users/asha%40nandiniinfosys.com/calendarView/delta?$deltatoken=d1`;
        const { fetchImpl, calls } = fakeFetch([
            route(deltaUrl, (call) =>
                call.url.includes('skiptoken')
                    ? { status: 200, body: { value: [{ id: 'gone', '@removed': { reason: 'deleted' } }], '@odata.deltaLink': delta } }
                    : { status: 200, body: { value: [graphItem('g1'), { id: 7 }], '@odata.nextLink': next } },
            ),
        ]);
        const adapter = createMicrosoftAdapter({ fetchImpl });
        const first = await adapter.listChanges(ctx(), { cursor: null, window });
        assert.equal(first.events[0].id, 'g1');
        assert.equal(first.unreadable, 1);
        assert.equal(first.nextPageToken, next);
        assert.match(calls[0].headers.prefer ?? '', /odata\.maxpagesize=100/);
        const second = await adapter.listChanges(ctx(), { cursor: null, pageToken: next, window });
        assert.deepEqual(second.removedIds, ['gone']);
        assert.equal(second.nextCursor, delta);
    });

    it('a cursor or next link off Graph is refused; 410 → CursorExpiredError', async () => {
        resetProviderPauses();
        const { fetchImpl, calls } = fakeFetch([
            route(deltaUrl, () => ({ status: 200, body: { value: [], '@odata.nextLink': 'https://evil.example.com/v1.0/x' } })),
            route(`${GRAPH_API}/users/x/calendarView/delta?$deltatoken=expired`, () => ({ status: 410, body: { error: { code: 'SyncStateNotFound', message: 'gone' } } })),
        ]);
        const adapter = createMicrosoftAdapter({ fetchImpl });
        await assert.rejects(adapter.listChanges(ctx(), { cursor: 'https://evil.example.com/v1.0/x', window }), CursorExpiredError);
        assert.equal(calls.length, 0, 'never sent');
        await assert.rejects(adapter.listChanges(ctx(), { cursor: null, window }), CursorExpiredError);
        await assert.rejects(adapter.listChanges(ctx(), { cursor: `${GRAPH_API}/users/x/calendarView/delta?$deltatoken=expired`, window }), CursorExpiredError);
    });
});
