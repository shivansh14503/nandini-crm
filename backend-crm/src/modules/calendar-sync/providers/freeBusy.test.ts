import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_CALENDAR_API, GRAPH_API } from '../../integrations/integration.constants.js';
import { fakeFetch, route } from '../testing/fakeFetch.js';
import { createGoogleAdapter, googleFreeBusyResult } from './google.js';
import { ProviderAuthError, ProviderTransientError } from './http.js';
import { createMicrosoftAdapter, graphScheduleResult, graphUtcInstant } from './microsoft.js';
import type { CallCtx } from './types.js';

/**
 * `freeBusy` (P2-6): request shapes and answer readings, replayed from the documented answers of Google
 * `POST /freeBusy` and Graph `POST /users/{id}/calendar/getSchedule` (hand-written, not recorded traffic).
 */

const ctx = (mailbox: string): CallCtx => ({ accessToken: 'at-1', calendarId: 'primary', accountEmail: mailbox, mailbox });
const start = new Date('2026-12-01T00:00:00.000Z');
const end = new Date('2026-12-02T00:00:00.000Z');

describe('Google freeBusy', () => {
    it('POST /freeBusy as the impersonated person: UTC window, items = lower-cased emails, bearer token, one try', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${GOOGLE_CALENDAR_API}/freeBusy`, () => ({
                status: 200,
                body: {
                    kind: 'calendar#freeBusy',
                    timeMin: start.toISOString(),
                    timeMax: end.toISOString(),
                    calendars: {
                        'asha@nandiniinfosys.com': { busy: [{ start: '2026-12-01T04:30:00Z', end: '2026-12-01T05:30:00Z' }] },
                        'ravi@nandiniinfosys.com': { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] },
                    },
                },
            })),
        ]);
        const result = await createGoogleAdapter({ fetchImpl }).freeBusy(ctx('asha@nandiniinfosys.com'), {
            emails: ['Asha@nandiniinfosys.com', 'ravi@nandiniinfosys.com', 'meena@nandiniinfosys.com'],
            start,
            end,
        });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].method, 'POST');
        assert.equal(calls[0].headers.authorization, 'Bearer at-1');
        assert.deepEqual(calls[0].json, {
            timeMin: '2026-12-01T00:00:00.000Z',
            timeMax: '2026-12-02T00:00:00.000Z',
            timeZone: 'UTC',
            items: [{ id: 'asha@nandiniinfosys.com' }, { id: 'ravi@nandiniinfosys.com' }, { id: 'meena@nandiniinfosys.com' }],
        });
        assert.deepEqual(result.get('asha@nandiniinfosys.com'), { busy: [{ start: new Date('2026-12-01T04:30:00Z'), end: new Date('2026-12-01T05:30:00Z'), kind: 'busy' }] });
        assert.deepEqual(result.get('ravi@nandiniinfosys.com'), { error: 'notFound' });
        assert.deepEqual(result.get('meena@nandiniinfosys.com'), { error: 'missing' }, 'a calendar left out of the answer is an error');
    });

    it('a failing call rejects with a typed error and is not retried (interactive)', async () => {
        const { fetchImpl, calls } = fakeFetch([route(`${GOOGLE_CALENDAR_API}/freeBusy`, () => ({ status: 503, body: { error: { code: 503, message: 'Backend Error' } } }))]);
        await assert.rejects(createGoogleAdapter({ fetchImpl }).freeBusy(ctx('asha@nandiniinfosys.com'), { emails: ['asha@nandiniinfosys.com'], start, end }), ProviderTransientError);
        assert.equal(calls.length, 1);
        const unauthorized = fakeFetch([route(`${GOOGLE_CALENDAR_API}/freeBusy`, () => ({ status: 401, body: { error: { code: 401, message: 'Invalid Credentials' } } }))]);
        await assert.rejects(createGoogleAdapter({ fetchImpl: unauthorized.fetchImpl }).freeBusy(ctx('a@x.com'), { emails: ['a@x.com'], start, end }), ProviderAuthError);
    });

    it('googleFreeBusyResult drops unreadable or empty ranges', () => {
        assert.deepEqual(googleFreeBusyResult({ busy: [{ start: 'nonsense', end: '2026-12-01T05:30:00Z' }, { start: '2026-12-01T05:30:00Z', end: '2026-12-01T05:30:00Z' }] }), { busy: [] });
        assert.deepEqual(googleFreeBusyResult(undefined), { error: 'missing' });
    });
});

describe('Microsoft getSchedule', () => {
    const schedule = (scheduleId: string, items: unknown[], error?: unknown) => ({ scheduleId, availabilityView: '000', scheduleItems: items, ...(error ? { error } : {}) });
    const item = (status: string, s: string, e: string) => ({
        isPrivate: false,
        status,
        subject: 'Customer review: Ramesh Traders',
        location: 'Room 1',
        start: { dateTime: s, timeZone: 'UTC' },
        end: { dateTime: e, timeZone: 'UTC' },
    });

    it('POST /users/{mailbox}/calendar/getSchedule with the app token: UTC wall clock, 15-minute view, Prefer UTC', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${GRAPH_API}/users/`, () => ({
                status: 200,
                body: {
                    value: [
                        schedule('asha@nandiniinfosys.com', [
                            item('Busy', '2026-12-01T04:30:00.0000000', '2026-12-01T05:30:00.0000000'),
                            item('tentative', '2026-12-01T06:00:00.0000000', '2026-12-01T06:30:00.0000000'),
                            item('Oof', '2026-12-01T09:00:00.0000000', '2026-12-01T12:00:00.0000000'),
                            item('WorkingElsewhere', '2026-12-01T13:00:00.0000000', '2026-12-01T14:00:00.0000000'),
                            item('Free', '2026-12-01T14:00:00.0000000', '2026-12-01T15:00:00.0000000'),
                            item('unknown', '2026-12-01T15:00:00.0000000', '2026-12-01T16:00:00.0000000'),
                        ]),
                        schedule('Ravi@nandiniinfosys.com', [], { message: 'The specified object was not found in the store.', responseCode: 'ErrorMailboxStoreUnavailable' }),
                    ],
                },
            })),
        ]);
        const result = await createMicrosoftAdapter({ fetchImpl }).freeBusy(ctx('asha@nandiniinfosys.com'), { emails: ['asha@nandiniinfosys.com', 'ravi@nandiniinfosys.com'], start, end });
        assert.equal(calls[0].url, `${GRAPH_API}/users/asha%40nandiniinfosys.com/calendar/getSchedule`);
        assert.equal(calls[0].headers.prefer, 'outlook.timezone="UTC"');
        assert.deepEqual(calls[0].json, {
            schedules: ['asha@nandiniinfosys.com', 'ravi@nandiniinfosys.com'],
            startTime: { dateTime: '2026-12-01T00:00:00', timeZone: 'UTC' },
            endTime: { dateTime: '2026-12-02T00:00:00', timeZone: 'UTC' },
            availabilityViewInterval: 15,
        });
        const asha = result.get('asha@nandiniinfosys.com');
        assert.ok(asha && 'busy' in asha);
        assert.deepEqual(
            asha.busy.map((b) => [b.start.toISOString(), b.end.toISOString(), b.kind]),
            [
                ['2026-12-01T04:30:00.000Z', '2026-12-01T05:30:00.000Z', 'busy'],
                ['2026-12-01T06:00:00.000Z', '2026-12-01T06:30:00.000Z', 'tentative'],
                ['2026-12-01T09:00:00.000Z', '2026-12-01T12:00:00.000Z', 'away'],
            ],
        );
        assert.ok(!JSON.stringify(asha).includes('Ramesh'), 'subjects and locations are never kept');
        assert.deepEqual(result.get('ravi@nandiniinfosys.com'), { error: 'ErrorMailboxStoreUnavailable' });
    });

    it('graphUtcInstant reads Graph’s 7-digit fractions, refuses other zones', () => {
        assert.equal(graphUtcInstant({ dateTime: '2026-12-01T04:30:00.1234567', timeZone: 'UTC' })?.toISOString(), '2026-12-01T04:30:00.123Z');
        assert.equal(graphUtcInstant({ dateTime: '2026-12-01T04:30:00' })?.toISOString(), '2026-12-01T04:30:00.000Z');
        assert.equal(graphUtcInstant({ dateTime: '2026-12-01T04:30:00', timeZone: 'India Standard Time' }), null);
        assert.deepEqual(graphScheduleResult(undefined), { error: 'missing' });
    });
});
