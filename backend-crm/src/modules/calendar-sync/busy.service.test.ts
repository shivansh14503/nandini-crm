import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { prisma } from '../../config/prisma.js';
import { configureSecretBox } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { GRAPH_API } from '../integrations/integration.constants.js';
import { busyActivityWhere, activityBusyBlock, busyService, busyTimes, outcomeOfError, resetBusyMemo } from './busy.service.js';
import { localBusyLimit, resetLocalBusyLimit } from './busy.rateLimit.js';
import { busyQuerySchema } from './busy.validator.js';
import { ConnectionUnavailableError } from './calendarAccess.js';
import { fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { resetProviderPauses } from './providers/http.js';
import { createMicrosoftAdapter } from './providers/microsoft.js';
import { setAdapterForTests, setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { blankConnection, configsWithDomains, installConnectionDouble, microsoftProviderRow, restoreConnectionDouble, useTestSecretBox, type ConnectionRowState, type DoubleState, type UserRow } from './testing/connectionDouble.js';
import { fakeFetch, route } from './testing/fakeFetch.js';
import { createTokenSource, setTokenSourceForTests } from './tokenSource.js';

/**
 * Busy times (P2-6; spec §12, addendum §8.5): validation, CRM + calendar union, the requester's call and the
 * per-colleague fallback, statuses, exclude, suggest, cache. Calendars are the in-memory fake provider (and the real
 * Graph adapter on a replayed fetch); CRM activities are an in-memory `activity` delegate.
 */

const now = new Date('2026-12-01T02:00:00.000Z'); // 07:30 IST
const day = { from: '2026-12-01T00:00:00+05:30', to: '2026-12-02T00:00:00+05:30' };
const DOMAIN = 'nandiniinfosys.com';
const person = (id: number, username: string, over: Partial<UserRow> = {}): UserRow => ({ id, username, fullName: `${username[0].toUpperCase()}${username.slice(1)} S`, email: `${username}@${DOMAIN}`, isActive: true, isGroupUser: false, ...over });
const fakeRow = (id: string, username: string, over: Partial<ConnectionRowState> = {}) => blankConnection({ id, username, provider: 'fake', accountEmail: `${username}@${DOMAIN}`, status: 'ok', ...over }, now);
const asha: AuthUser = { id: 1, username: 'asha', role: 'Sales Executive' };
const at = (iso: string) => new Date(iso);

interface ActivityStub {
    id: string;
    followupType: string;
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
    assignedTo: string;
    createdBy: string;
    attendees: { kind: string; username: string | null; responseStatus: string }[];
}
const meeting = (id: string, owner: string, startIso: string, endIso: string, over: Partial<ActivityStub> = {}): ActivityStub => ({
    id,
    followupType: 'Meeting',
    startAt: at(startIso),
    endAt: at(endIso),
    allDay: false,
    assignedTo: owner,
    createdBy: owner,
    attendees: [],
    ...over,
});

let state: DoubleState;
let activityRows: ActivityStub[] = [];
let activityQueries = 0;
const realActivity = (prisma as unknown as Record<string, unknown>).activity;

function stubActivities(rows: ActivityStub[]): void {
    activityRows = rows;
    Object.defineProperty(prisma, 'activity', {
        configurable: true,
        writable: true,
        value: {
            findMany: async () => {
                activityQueries += 1;
                return activityRows.map((r) => ({ ...r, attendees: r.attendees.filter((a) => a.kind === 'user') }));
            },
            findFirst: async ({ where }: { where: { id: string } }) => activityRows.find((r) => r.id === where.id) ?? null,
        },
    });
}

/** Company form configuration with the seeded Site Visit (icon 'visit') among the Followup Types. */
function configsWithTypes() {
    const configs = configsWithDomains([DOMAIN]) as unknown as Record<string, unknown>;
    configs.categories = [
        {
            id: 'cat-ft',
            key: 'shared_followup_type',
            options: [
                { value: 'Meeting', meta: { durationMinutes: 60, icon: 'meeting' }, isActive: true },
                { value: 'Site Visit', meta: { durationMinutes: 120, icon: 'visit' }, isActive: true },
                { value: 'Call', meta: { durationMinutes: 15, icon: 'call' }, isActive: true },
            ],
        },
    ];
    return configs as unknown as ReturnType<typeof configsWithDomains>;
}

function install(seed: { users?: UserRow[]; connections?: ConnectionRowState[]; providers?: Record<string, unknown>[] }) {
    state = installConnectionDouble({ ...seed, configs: configsWithTypes() });
}

const query = (users: string[], extra: Record<string, unknown> = {}) => busyQuerySchema.parse({ users: users.join(','), ...day, ...extra });
const personOf = (answer: Awaited<ReturnType<typeof busyTimes>>, username: string) => answer.people.find((p) => p.username.toLowerCase() === username)!;
const blocks = (p: { busy: { start: string; end: string; kind: string }[] }) => p.busy.map((b) => `${b.kind} ${b.start.slice(11, 16)}-${b.end.slice(11, 16)}`);

beforeEach(() => {
    resetFakeProvider();
    resetProviderPauses();
    resetBusyMemo();
    resetLocalBusyLimit();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
    activityQueries = 0;
    stubActivities([]);
});

afterEach(() => {
    restoreConnectionDouble();
    Object.defineProperty(prisma, 'activity', { configurable: true, writable: true, value: realActivity });
    setFakeProviderEnabledForTests(null);
    setTokenSourceForTests(null);
    setAdapterForTests('microsoft', null);
    configureSecretBox(null);
});

describe('busyQuerySchema', () => {
    it('1–20 people (de-duplicated), instants with a zone, ≤ 31 days, suggest 5–1440', () => {
        const ok = busyQuerySchema.parse({ users: 'asha, Asha,ravi', ...day, suggest: '60', exclude: '' });
        assert.deepEqual(ok.users, ['asha', 'ravi']);
        assert.equal(ok.suggest, 60);
        assert.equal(ok.exclude, undefined);
        assert.equal(busyQuerySchema.parse({ users: 'asha', ...day, suggest: '' }).suggest, undefined);
        const fails = (input: Record<string, unknown>) => assert.equal(busyQuerySchema.safeParse(input).success, false, JSON.stringify(input));
        fails({ users: Array.from({ length: 21 }, (_, i) => `u${i}`).join(','), ...day });
        fails({ users: '', ...day });
        fails({ users: 'asha', from: '2026-12-01T00:00:00', to: day.to });
        fails({ users: 'asha', from: day.to, to: day.from });
        fails({ users: 'asha', from: '2026-12-01T00:00:00Z', to: '2027-01-02T00:00:01Z' });
        fails({ users: 'asha', ...day, suggest: '4' });
        fails({ users: 'asha', ...day, suggest: '1441' });
        fails({ users: 'asha', ...day, suggest: '12.5' });
    });

    it('the service refuses a bad query with a zod error (400 VALIDATION_ERROR)', async () => {
        await assert.rejects(busyService.busy({ users: 'asha', from: day.from }, asha), (err: Error) => err.name === 'ZodError');
    });
});

describe('CRM part', () => {
    it('activityBusyBlock: timed → busy, zero length → 15 minutes, all-day → nothing except a Site Visit (away)', () => {
        const away = new Set(['Site Visit']);
        assert.deepEqual(activityBusyBlock({ id: 'a', followupType: 'Meeting', startAt: at('2026-12-01T04:30:00Z'), endAt: at('2026-12-01T05:30:00Z'), allDay: false }, away), {
            start: Date.parse('2026-12-01T04:30:00Z'),
            end: Date.parse('2026-12-01T05:30:00Z'),
            kind: 'busy',
        });
        assert.equal(activityBusyBlock({ id: 'b', followupType: 'Email', startAt: at('2026-12-01T04:30:00Z'), endAt: at('2026-12-01T04:30:00Z'), allDay: false }, away)?.end, Date.parse('2026-12-01T04:45:00Z'));
        assert.equal(activityBusyBlock({ id: 'c', followupType: 'Call', startAt: at('2026-11-30T18:30:00Z'), endAt: at('2026-12-01T18:30:00Z'), allDay: true }, away), null);
        assert.equal(activityBusyBlock({ id: 'd', followupType: 'Site Visit', startAt: at('2026-11-30T18:30:00Z'), endAt: at('2026-12-01T18:30:00Z'), allDay: true }, away)?.kind, 'away');
    });

    it('busyActivityWhere: Planned, no Notes / Tasks, owner or a colleague who hasn’t declined, the window; switch off → no follow-up activities', () => {
        const where = busyActivityWhere(['asha'], at('2026-12-01T00:00:00Z'), at('2026-12-02T00:00:00Z'), true);
        const text = JSON.stringify(where);
        assert.ok(text.includes('"status":"Planned"'));
        assert.ok(text.includes('"notIn":["Note","Task"]'));
        assert.ok(text.includes('"responseStatus":{"not":"declined"}'));
        assert.ok(!text.includes('"origin"'));
        assert.ok(JSON.stringify(busyActivityWhere(['asha'], at('2026-12-01T00:00:00Z'), at('2026-12-02T00:00:00Z'), false)).includes('"origin":{"not":"followup"}'));
    });
});

describe('busyTimes (fake provider)', () => {
    it('unions CRM activities with calendar blocks; one call as the requester; statuses per person; times only', async () => {
        install({
            users: [person(1, 'asha'), person(2, 'ravi'), person(3, 'meena'), person(4, 'dev'), person(5, 'old', { isActive: false })],
            connections: [fakeRow('c1', 'asha'), fakeRow('c2', 'ravi', { status: 'pending' }), fakeRow('c4', 'dev', { status: 'error', statusReason: 'user_not_found' })],
        });
        stubActivities([
            meeting('a1', 'asha', '2026-12-01T04:30:00Z', '2026-12-01T05:30:00Z', { attendees: [{ kind: 'user', username: 'ravi', responseStatus: 'accepted' }, { kind: 'user', username: 'meena', responseStatus: 'declined' }] }),
            meeting('a2', 'meena', '2026-11-30T18:30:00Z', '2026-12-01T18:30:00Z', { followupType: 'Site Visit', allDay: true }),
            meeting('a3', 'dev', '2026-11-30T18:30:00Z', '2026-12-01T18:30:00Z', { followupType: 'Call', allDay: true }),
        ]);
        fakeProviderState.busy.set('asha@nandiniinfosys.com', [{ start: at('2026-12-01T09:00:00Z'), end: at('2026-12-01T10:00:00Z'), kind: 'busy' }]);
        fakeProviderState.busy.set('ravi@nandiniinfosys.com', [{ start: at('2026-12-01T05:00:00Z'), end: at('2026-12-01T06:00:00Z'), kind: 'tentative' }]);

        const answer = await busyTimes(query(['asha', 'Ravi', 'meena', 'dev', 'old', 'ghost']), asha, now);
        assert.equal(answer.timeZone, 'Asia/Kolkata');
        assert.equal(answer.from, '2026-11-30T18:30:00.000Z');
        assert.equal(answer.suggestion, undefined);
        assert.deepEqual(fakeProviderState.freeBusyCalls, [{ mailbox: 'asha@nandiniinfosys.com', emails: ['asha@nandiniinfosys.com', 'ravi@nandiniinfosys.com'] }]);

        const a = personOf(answer, 'asha');
        assert.deepEqual([a.status, a.provider, a.sources, a.name], ['ok', 'fake', ['crm', 'fake'], 'Asha S']);
        assert.deepEqual(blocks(a), ['busy 04:30-05:30', 'busy 09:00-10:00']);
        const r = personOf(answer, 'ravi');
        assert.equal(r.username, 'ravi', 'stored spelling');
        assert.deepEqual([r.status, r.sources], ['ok', ['crm', 'fake']]);
        assert.deepEqual(blocks(r), ['busy 04:30-05:30', 'tentative 05:00-06:00']);
        const m = personOf(answer, 'meena');
        assert.deepEqual([m.status, m.provider, m.sources], ['not_connected', null, ['crm']]);
        assert.deepEqual(blocks(m), ['away 18:30-18:30'], 'declined meeting not busy; all-day Site Visit = away for the whole day');
        const d = personOf(answer, 'dev');
        assert.deepEqual([d.status, d.provider, d.sources, d.busy], ['error', 'fake', ['crm'], []], 'an all-day Call is not busy; a row in error is not asked');
        assert.deepEqual(personOf(answer, 'old'), { username: 'old', name: 'old', provider: null, status: 'unknown', sources: [], busy: [] });
        assert.equal(personOf(answer, 'ghost').status, 'unknown');
        assert.ok(!JSON.stringify(answer).includes('a1'), 'no activity ids or titles leave the API');
    });

    it('a calendar the requester may not read is read as its owner', async () => {
        install({ users: [person(1, 'asha'), person(2, 'ravi')], connections: [fakeRow('c1', 'asha'), fakeRow('c2', 'ravi')] });
        fakeProviderState.freeBusyPrivate.add('ravi@nandiniinfosys.com');
        fakeProviderState.busy.set('ravi@nandiniinfosys.com', [{ start: at('2026-12-01T05:00:00Z'), end: at('2026-12-01T06:00:00Z'), kind: 'busy' }]);
        const answer = await busyTimes(query(['asha', 'ravi']), asha, now);
        assert.deepEqual(
            fakeProviderState.freeBusyCalls.map((c) => c.mailbox),
            ['asha@nandiniinfosys.com', 'ravi@nandiniinfosys.com'],
        );
        assert.deepEqual(fakeProviderState.freeBusyCalls[1].emails, ['ravi@nandiniinfosys.com']);
        assert.equal(personOf(answer, 'ravi').status, 'ok');
        assert.deepEqual(blocks(personOf(answer, 'ravi')), ['busy 05:00-06:00']);
    });

    it('requester not enrolled: each calendar is read as its owner; the requester is CRM only', async () => {
        install({ users: [person(1, 'asha', { email: null }), person(2, 'ravi'), person(3, 'meena')], connections: [fakeRow('c2', 'ravi'), fakeRow('c3', 'meena')] });
        const answer = await busyTimes(query(['asha', 'ravi', 'meena']), asha, now);
        assert.deepEqual(fakeProviderState.freeBusyCalls.map((c) => c.mailbox).sort(), ['meena@nandiniinfosys.com', 'ravi@nandiniinfosys.com']);
        assert.deepEqual(answer.people.map((p) => p.status), ['not_connected', 'ok', 'ok']);
    });

    it('the requester’s call fails (timeout / 5xx): colleagues are read as themselves, the requester is unavailable, the CRM part stays', async () => {
        install({ users: [person(1, 'asha'), person(2, 'ravi')], connections: [fakeRow('c1', 'asha'), fakeRow('c2', 'ravi')] });
        stubActivities([meeting('a1', 'asha', '2026-12-01T04:30:00Z', '2026-12-01T05:30:00Z')]);
        fakeProviderState.freeBusyFailures.set('asha@nandiniinfosys.com', 503);
        const answer = await busyTimes(query(['asha', 'ravi']), asha, now);
        assert.deepEqual(answer.people.map((p) => p.status), ['unavailable', 'ok']);
        assert.deepEqual(blocks(personOf(answer, 'asha')), ['busy 04:30-05:30']);
        assert.deepEqual(personOf(answer, 'asha').sources, ['crm']);
        assert.equal(fakeProviderState.freeBusyCalls.filter((c) => c.mailbox === 'asha@nandiniinfosys.com').length, 1, 'the failed requester is not asked again');
    });

    it('a provider-wide failure marks everyone on it error, without per-colleague calls', async () => {
        install({ users: [person(1, 'asha'), person(2, 'ravi'), person(9, 'admin', { role: 'Admin' })], connections: [fakeRow('c1', 'asha'), fakeRow('c2', 'ravi')] });
        fakeProviderState.appFailure = { level: 'app', code: 'delegation_missing' };
        const answer = await busyTimes(query(['asha', 'ravi']), asha, now);
        assert.deepEqual(answer.people.map((p) => p.status), ['error', 'error']);
        assert.equal(fakeProviderState.freeBusyCalls.length, 0);
        assert.equal(fakeProviderState.mints.length, 1, 'one token attempt; the app-level failure is remembered');
    });

    it('a user-level failure of a colleague (their token) marks only them', async () => {
        install({ users: [person(1, 'asha', { email: null }), person(2, 'ravi'), person(3, 'meena')], connections: [fakeRow('c2', 'ravi'), fakeRow('c3', 'meena')] });
        fakeProviderState.userFailures.set('meena@nandiniinfosys.com', { level: 'user', code: 'user_not_found' });
        const answer = await busyTimes(query(['ravi', 'meena']), asha, now);
        assert.deepEqual(answer.people.map((p) => p.status), ['ok', 'error']);
        assert.equal(state.connections.find((c) => c.id === 'c3')?.status, 'error', 'withCalendarAccess marks the row for the admins');
    });

    it('cached 60 s per person and window (in-process memo while Redis is down); the CRM part is read again', async () => {
        install({ users: [person(1, 'asha')], connections: [fakeRow('c1', 'asha')] });
        await busyTimes(query(['asha']), asha, now);
        await busyTimes(query(['asha']), asha, now);
        assert.equal(fakeProviderState.freeBusyCalls.length, 1);
        assert.equal(activityQueries, 2, 'no Redis in tests: the guarded CRM cache falls through to the database');
    });

    it('exclude: the moved activity’s CRM block goes, its calendar copy is cut from owner and attendees, a neighbour stays', async () => {
        install({ users: [person(1, 'asha'), person(2, 'ravi')], connections: [fakeRow('c1', 'asha'), fakeRow('c2', 'ravi')] });
        stubActivities([meeting('a1', 'asha', '2026-12-01T04:30:00Z', '2026-12-01T05:30:00Z', { attendees: [{ kind: 'user', username: 'ravi', responseStatus: 'needsAction' }] })]);
        fakeProviderState.busy.set('asha@nandiniinfosys.com', [{ start: at('2026-12-01T04:00:00Z'), end: at('2026-12-01T05:30:00Z'), kind: 'busy' }]);
        fakeProviderState.busy.set('ravi@nandiniinfosys.com', [{ start: at('2026-12-01T04:30:00Z'), end: at('2026-12-01T05:30:00Z'), kind: 'busy' }]);
        const answer = await busyTimes(query(['asha', 'ravi'], { exclude: 'a1' }), asha, now);
        assert.deepEqual(blocks(personOf(answer, 'asha')), ['busy 04:00-04:30']);
        assert.deepEqual(personOf(answer, 'ravi').busy, []);
    });

    it('exclude of an activity the caller can’t see changes nothing', async () => {
        install({ users: [person(1, 'asha'), person(2, 'ravi')], connections: [] });
        stubActivities([meeting('a9', 'ravi', '2026-12-01T04:30:00Z', '2026-12-01T05:30:00Z')]);
        const answer = await busyTimes(query(['ravi'], { exclude: 'a9' }), asha, now);
        assert.deepEqual(blocks(personOf(answer, 'ravi')), ['busy 04:30-05:30']);
    });

    it('suggest: the first common free slot in business hours, never before now; null when none fits', async () => {
        install({ users: [person(1, 'asha'), person(2, 'ravi')], connections: [fakeRow('c1', 'asha')] });
        stubActivities([meeting('a1', 'ravi', '2026-12-01T03:30:00Z', '2026-12-01T04:30:00Z')]); // 09:00–10:00 IST
        fakeProviderState.busy.set('asha@nandiniinfosys.com', [{ start: at('2026-12-01T04:30:00Z'), end: at('2026-12-01T05:00:00Z'), kind: 'tentative' }]);
        const answer = await busyTimes(query(['asha', 'ravi'], { suggest: 60 }), asha, now);
        assert.deepEqual(answer.suggestion, { start: '2026-12-01T05:00:00.000Z', end: '2026-12-01T06:00:00.000Z' }, '10:30 IST');
        const late = await busyTimes(query(['asha'], { suggest: 60 }), asha, new Date('2026-12-01T13:00:00Z'));
        assert.equal(late.suggestion, null, 'after 18:30 IST nothing fits before the window ends');
    });
});

describe('busyTimes (Microsoft getSchedule, app token)', () => {
    const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const msRow = (id: string, username: string) => blankConnection({ id, username, provider: 'microsoft', calendarId: '', accountEmail: `${username}@${DOMAIN}`, status: 'ok' }, now);

    it('requester without a Microsoft row: one getSchedule on the first colleague’s mailbox for all of them', async () => {
        useTestSecretBox();
        install({ users: [person(1, 'asha', { email: null }), person(2, 'ravi'), person(3, 'meena')], providers: [microsoftProviderRow()], connections: [msRow('m2', 'ravi'), msRow('m3', 'meena')] });
        const { fetchImpl, calls } = fakeFetch([
            route(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, () => ({ status: 200, body: { access_token: 'app-token', expires_in: 3600 } })),
            route(`${GRAPH_API}/users/`, (call) => ({
                status: 200,
                body: {
                    value: (call.json as { schedules: string[] }).schedules.map((id) => ({
                        scheduleId: id,
                        scheduleItems: id.startsWith('ravi') ? [{ status: 'Busy', start: { dateTime: '2026-12-01T05:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-12-01T06:00:00.0000000', timeZone: 'UTC' } }] : [],
                    })),
                },
            })),
        ]);
        setTokenSourceForTests(createTokenSource({ fetchImpl }));
        setAdapterForTests('microsoft', createMicrosoftAdapter({ fetchImpl }));
        const answer = await busyTimes(query(['ravi', 'meena']), asha, now);
        const graphCalls = calls.filter((c) => c.url.startsWith(GRAPH_API));
        assert.equal(graphCalls.length, 1);
        assert.equal(graphCalls[0].url, `${GRAPH_API}/users/ravi%40nandiniinfosys.com/calendar/getSchedule`);
        assert.deepEqual(answer.people.map((p) => [p.status, p.provider]), [['ok', 'microsoft'], ['ok', 'microsoft']]);
        assert.deepEqual(blocks(personOf(answer, 'ravi')), ['busy 05:00-06:00']);
    });
});

describe('helpers', () => {
    it('outcomeOfError: no usable row → not_connected; row / provider problems → error; anything else → unavailable', () => {
        assert.equal(outcomeOfError(new ConnectionUnavailableError('provider_disabled')), 'not_connected');
        assert.equal(outcomeOfError(new ConnectionUnavailableError('user_inactive')), 'not_connected');
        assert.equal(outcomeOfError(new ConnectionUnavailableError('user_error')), 'error');
        assert.equal(outcomeOfError(new ConnectionUnavailableError('provider_unhealthy')), 'error');
        assert.equal(outcomeOfError(new Error('timeout')), 'unavailable');
    });

    it('rate limit fallback: 60 per minute per user while Redis can’t count', () => {
        const t0 = Date.parse('2026-12-01T00:00:00Z');
        for (let i = 0; i < 60; i += 1) assert.equal(localBusyLimit('user:1', t0).allowed, true);
        const refused = localBusyLimit('user:1', t0 + 1_000);
        assert.equal(refused.allowed, false);
        assert.equal(refused.retryAfterSeconds, 59);
        assert.equal(localBusyLimit('user:2', t0).allowed, true, 'per user');
        assert.equal(localBusyLimit('user:1', t0 + 61_000).allowed, true, 'a new window');
    });
});
