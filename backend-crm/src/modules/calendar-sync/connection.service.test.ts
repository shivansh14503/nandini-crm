import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { configureSecretBox } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { connectionService, hasActiveCalendarConnection, runCalendarConnectionNightly } from './connection.service.js';
import { setCheckSchedulerForTests } from './enrolment.js';
import { resetFakeProvider } from './providers/fake.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { blankConnection, googleProviderRow, installConnectionDouble, restoreConnectionDouble, useTestSecretBox, type ConnectionRowState, type DoubleState, type UserRow } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/** The employee's own read-only status (GET /api/calendar-connections), the nightly steps, hasActiveCalendarConnection. */

const now = new Date('2026-11-26T06:00:00.000Z');
const user = (id: number, username: string, over: Partial<UserRow> = {}): UserRow => ({ id, username, fullName: username, email: `${username}@nandiniinfosys.com`, isActive: true, isGroupUser: false, ...over });
const authOf = (row: UserRow): AuthUser => ({ id: row.id, username: row.username, role: 'Sales' });
const fakeRow = (id: string, username: string, over: Partial<ConnectionRowState> = {}) =>
    blankConnection({ id, username, provider: 'fake', accountEmail: `${username}@nandiniinfosys.com`, ...over }, now);

let state: DoubleState;

beforeEach(() => {
    resetFakeProvider();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
    setCheckSchedulerForTests(() => undefined);
});

afterEach(() => {
    restoreConnectionDouble();
    setFakeProviderEnabledForTests(null);
    setCheckSchedulerForTests(null);
    configureSecretBox(null);
});

describe('getOwn', () => {
    it('a live row: provider label, mailbox, status, since, last synced; never an error code or provider text', async () => {
        const asha = user(1, 'asha');
        state = installConnectionDouble({
            users: [asha],
            connections: [
                fakeRow('c1', 'asha', { status: 'error', statusReason: 'calendar_unavailable', lastErrorMessage: 'Provider words', lastPushedAt: new Date(now.getTime() - 5000), lastPulledAt: new Date(now.getTime() - 1000) }),
                fakeRow('old', 'asha', { status: 'stopped', statusReason: 'email_changed' }),
            ],
        });
        const own = await connectionService.getOwn(authOf(asha));
        assert.equal(own.ready, true);
        assert.equal(own.reason, null);
        assert.deepEqual(own.calendar, {
            provider: 'fake',
            providerLabel: 'Test calendar (development only)',
            accountEmail: 'asha@nandiniinfosys.com',
            status: 'error',
            since: now.toISOString(),
            lastSyncedAt: new Date(now.getTime() - 1000).toISOString(),
        });
        const text = JSON.stringify(own);
        assert.ok(!text.includes('calendar_unavailable') && !text.includes('Provider words'));
    });

    it('paused while the provider is off or unhealthy', async () => {
        const asha = user(1, 'asha');
        state = installConnectionDouble({ users: [asha], connections: [fakeRow('c1', 'asha', { status: 'ok' })] });
        setFakeHealth('error', 'delegation_missing');
        assert.equal((await connectionService.getOwn(authOf(asha))).calendar?.status, 'paused');
        setFakeHealth('ok', null);
        setFakeProviderEnabledForTests(false);
        const own = await connectionService.getOwn(authOf(asha));
        assert.equal(own.calendar?.status, 'paused');
        assert.equal(own.ready, false);
    });

    it('no live row: the reason (no_email, not_company, excluded, no_provider, group); a target without a row yet has none', async () => {
        const people = [user(1, 'a', { email: null }), user(2, 'b', { email: 'b@gmail.com' }), user(3, 'c'), user(4, 'd', { isGroupUser: true }), user(5, 'e')];
        state = installConnectionDouble({ users: people, syncUsers: [{ username: 'c', excluded: true }] });
        const reasons = await Promise.all(people.map(async (p) => (await connectionService.getOwn(authOf(p))).reason));
        assert.deepEqual(reasons, ['no_email', 'not_company', 'excluded', 'group', null]);
        setFakeProviderEnabledForTests(false);
        assert.equal((await connectionService.getOwn(authOf(people[4]))).reason, 'no_provider');
    });

    it('a real provider counts as ready only with the encryption key', async () => {
        useTestSecretBox();
        const asha = user(1, 'asha');
        state = installConnectionDouble({ users: [asha], providers: [googleProviderRow()] });
        setFakeProviderEnabledForTests(false);
        assert.equal((await connectionService.getOwn(authOf(asha))).ready, true);
        configureSecretBox(null);
        restoreConnectionDouble();
        state = installConnectionDouble({ users: [asha], providers: [{ provider: 'google', enabled: true, clientId: '1', secretsEnc: null, settingsJson: '{"domains":["nandiniinfosys.com"]}' }] });
        assert.equal((await connectionService.getOwn(authOf(asha))).ready, false);
    });
});

describe('hasActiveCalendarConnection', () => {
    it('a live ok / pending row of an active user only', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha'), user(2, 'ravi', { isActive: false })], connections: [fakeRow('c1', 'asha', { status: 'ok' }), fakeRow('c2', 'ravi', { status: 'ok' })] });
        assert.equal(await hasActiveCalendarConnection('asha'), true);
        assert.equal(await hasActiveCalendarConnection('ravi'), false, 'inactive user');
        assert.equal(await hasActiveCalendarConnection('nobody'), false);
        state.connections[0].status = 'pending';
        assert.equal(await hasActiveCalendarConnection('asha'), true);
        state.connections[0].status = 'error';
        assert.equal(await hasActiveCalendarConnection('asha'), false);
    });
});

describe('runCalendarConnectionNightly', () => {
    it('reconciles everyone, runs the due checks, and sends admins one digest a day when someone went to error', async () => {
        state = installConnectionDouble({
            users: [user(1, 'asha'), user(2, 'ravi'), user(3, 'gone', { isActive: false }), user(9, 'admin', { role: 'Admin' })],
            connections: [
                fakeRow('r', 'ravi', { status: 'error', statusReason: 'calendar_unavailable', lastErrorAt: new Date(now.getTime() - 3_600_000), nextCheckAt: new Date(now.getTime() + 3_600_000) }),
                fakeRow('g', 'gone', { status: 'ok' }),
            ],
        });
        const result = await runCalendarConnectionNightly(now);
        // asha + admin enrolled, gone stopped.
        assert.equal(result.changed, 3);
        assert.equal(result.checked, 2, 'the two new pending rows');
        assert.equal(result.problems, 1);
        assert.equal(state.connections.find((c) => c.id === 'g')?.statusReason, 'user_inactive');
        assert.deepEqual(
            state.notifications.map((n) => [n.username, n.kind, n.entityId, n.title]),
            [['admin', 'calendar_sync_issue', 'people:calendar_problem', "1 person's calendar isn't syncing"]],
        );
        await runCalendarConnectionNightly(now);
        assert.equal(state.notifications.length, 1, 'once per business day');
    });
});
