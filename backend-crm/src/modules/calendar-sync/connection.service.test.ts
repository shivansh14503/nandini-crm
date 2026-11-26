import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { configureSecretBox, parseKeyRing } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { connectionService, hasActiveCalendarConnection, runCalendarConnectionNightly } from './connection.service.js';
import { sealTokenColumns } from './connectionTokens.js';
import { createFakeAdapter, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { setAdapterForTests, setFakeProviderEnabledForTests } from './providers/registry.js';
import { blankConnection, installConnectionDouble, restoreConnectionDouble, type ConnectionRowState, type DoubleState, type UserRow } from './testing/connectionDouble.js';

/** Admin list / disconnect, the nightly steps, and hasActiveCalendarConnection (connection.service.ts). */

const now = new Date('2026-11-26T06:00:00.000Z');
const DAY = 86_400_000;
const asha: UserRow = { id: 1, username: 'asha', fullName: 'Asha Rao', email: 'asha@nandiniinfosys.com', isActive: true, isGroupUser: false };
const ravi: UserRow = { id: 2, username: 'ravi', fullName: 'Ravi Kumar', email: 'ravi@nandiniinfosys.com', isActive: false, isGroupUser: false };
const desk: UserRow = { id: 3, username: 'support', fullName: 'Support Desk', email: 'support@nandiniinfosys.com', isActive: true, isGroupUser: true };
const admin: AuthUser = { id: 9, username: 'admin', role: 'Admin' };

let state: DoubleState;

function liveFake(id: string, username: string, over: Partial<ConnectionRowState> = {}): ConnectionRowState {
    const refreshToken = `rt-${id}`;
    fakeProviderState.refreshTokens.set(refreshToken, { email: `${username}@nandiniinfosys.com`, revoked: false });
    const sealed = sealTokenColumns(id, { accessToken: `at-${id}`, refreshToken, expiresAt: new Date(now.getTime() + 3_600_000), scope: 'fake.calendar' });
    return blankConnection({ id, username, provider: 'fake', accountId: `fake:${username}@nandiniinfosys.com`, accountEmail: `${username}@nandiniinfosys.com`, ...sealed, ...over }, now);
}

beforeEach(() => {
    configureSecretBox(parseKeyRing(`k1:${randomBytes(32).toString('base64')}`));
    resetFakeProvider();
    setFakeProviderEnabledForTests(true);
    setAdapterForTests('fake', createFakeAdapter({ now: () => now }));
});

afterEach(() => {
    restoreConnectionDouble();
    configureSecretBox(null);
    setFakeProviderEnabledForTests(null);
    setAdapterForTests('fake', null);
});

describe('admin connections', () => {
    beforeEach(() => {
        state = installConnectionDouble({
            users: [asha, ravi, desk],
            connections: [
                liveFake('c1', 'asha'),
                liveFake('c2', 'ravi', { status: 'reauth_required', statusReason: 'invalid_grant' }),
                blankConnection({ id: 'c0', username: 'asha', provider: 'fake', accountId: 'fake:old', accountEmail: 'old@nandiniinfosys.com', status: 'disconnected' }, now),
            ],
        });
    });

    it('lists live connections by default with the user name, never a token; status/search filters', async () => {
        const live = await connectionService.adminList({});
        assert.deepEqual(live.map((c) => c.id).sort(), ['c1', 'c2']);
        const c1 = live.find((c) => c.id === 'c1')!;
        assert.equal(c1.fullName, 'Asha Rao');
        assert.equal(c1.webhook, null);
        const text = JSON.stringify(live);
        assert.ok(!text.includes('enc:v1'), 'no sealed value');
        assert.ok(!/accessToken"|refreshToken"/.test(text), 'no token field');

        assert.deepEqual((await connectionService.adminList({ status: 'all' })).map((c) => c.id).sort(), ['c0', 'c1', 'c2']);
        assert.deepEqual((await connectionService.adminList({ status: 'disconnected' })).map((c) => c.id), ['c0']);
        assert.deepEqual((await connectionService.adminList({ search: 'kumar' })).map((c) => c.id), ['c2']);
        assert.deepEqual((await connectionService.adminList({ provider: 'google' })).length, 0);
        // Unknown filter values fall back to the default instead of failing the page.
        assert.equal((await connectionService.adminList({ status: 'weird', provider: 'zoom' })).length, 2);
    });

    it('admin disconnect: tokens dropped, grant revoked, audited with the admin and the note; unknown id → 404', async () => {
        await connectionService.adminDisconnect('c1', { reason: 'Left the sales team' }, admin);
        const row = state.connections.find((c) => c.id === 'c1')!;
        assert.equal(row.status, 'disconnected');
        assert.equal(row.statusReason, 'by_admin');
        assert.equal(row.disconnectedBy, 'admin');
        assert.equal(row.refreshTokenEnc, null);
        assert.deepEqual(fakeProviderState.revoked, ['rt-c1']);
        assert.deepEqual(state.audits.at(-1)!.changes, { provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', by: 'admin', reason: 'by_admin', note: 'Left the sales team' });
        assert.equal(state.audits.at(-1)!.changedBy, 'admin');

        await assert.rejects(connectionService.adminDisconnect('nope', {}, admin), (err: unknown) => err instanceof HttpError && err.statusCode === 404);
        await assert.rejects(connectionService.adminDisconnect('c2', { reason: 'x'.repeat(201) }, admin));
        await assert.rejects(connectionService.adminDisconnect('c2', { other: 1 }, admin), 'unknown body fields are refused');
    });

    it('a failing provider revoke never fails the disconnect', async () => {
        const fake = createFakeAdapter({ now: () => now });
        setAdapterForTests('fake', { ...fake, revoke: async () => Promise.reject(new Error('provider down')) });
        await connectionService.adminDisconnect('c1', {}, admin);
        assert.equal(state.connections.find((c) => c.id === 'c1')!.status, 'disconnected');
    });
});

describe('nightly steps', () => {
    it('disconnects live connections of inactive users and group logins (system, user_inactive); keeps the rest', async () => {
        state = installConnectionDouble({
            users: [asha, ravi, desk],
            connections: [liveFake('c1', 'asha'), liveFake('c2', 'ravi'), liveFake('c3', 'support'), liveFake('c4', 'gone-user', { status: 'error', statusReason: 'key_error' })],
        });
        const result = await runCalendarConnectionNightly(now);
        assert.equal(result.disconnected, 3);
        const byId = Object.fromEntries(state.connections.map((c) => [c.id, c]));
        assert.equal(byId.c1.status, 'active');
        for (const id of ['c2', 'c3', 'c4']) {
            assert.equal(byId[id].status, 'disconnected', id);
            assert.equal(byId[id].statusReason, 'user_inactive', id);
            assert.equal(byId[id].disconnectedBy, 'system', id);
        }
        // Running again finds nothing more to do.
        assert.equal((await runCalendarConnectionNightly(now)).disconnected, 0);
    });

    it('warns once, 3 days before a time-limited grant ends', async () => {
        state = installConnectionDouble({
            users: [asha, ravi],
            connections: [
                liveFake('soon', 'asha', { refreshTokenExpiresAt: new Date(now.getTime() + 2 * DAY) }),
                liveFake('later', 'asha', { refreshTokenExpiresAt: new Date(now.getTime() + 10 * DAY), kind: 'calendar2', accountId: 'x2' }),
                liveFake('past', 'asha', { refreshTokenExpiresAt: new Date(now.getTime() - DAY), accountId: 'x3', kind: 'calendar3' }),
                liveFake('never', 'asha', { accountId: 'x4', kind: 'calendar4' }),
            ],
        });
        assert.equal(await connectionService.notifyExpiringGrants(now), 1);
        assert.deepEqual(
            state.notifications.map((n) => [n.username, n.entityId, n.dedupeKey, n.title]),
            [['asha', 'soon', `calendar_reconnect:soon:${now.getTime()}:expiring`, 'Your Test calendar (development only) access ends soon']],
        );
        assert.equal(await connectionService.notifyExpiringGrants(new Date(now.getTime() + DAY)), 0, 'deduped');
    });

    it('warns again after a reconnect gives a new time-limited grant (same row, new connectedAt)', async () => {
        state = installConnectionDouble({ users: [asha], connections: [liveFake('soon', 'asha', { refreshTokenExpiresAt: new Date(now.getTime() + 2 * DAY) })] });
        assert.equal(await connectionService.notifyExpiringGrants(now), 1);
        // A week later the user reconnects the same account: saveConnection re-activates this row with connectedAt = now.
        const reconnectedAt = new Date(now.getTime() + 7 * DAY);
        Object.assign(state.connections[0], { connectedAt: reconnectedAt, refreshTokenExpiresAt: new Date(reconnectedAt.getTime() + 7 * DAY) });
        const warnAt = new Date(reconnectedAt.getTime() + 5 * DAY);
        assert.equal(await connectionService.notifyExpiringGrants(warnAt), 1, 'the new grant is warned about too');
        assert.deepEqual(
            state.notifications.map((n) => n.dedupeKey),
            [`calendar_reconnect:soon:${now.getTime()}:expiring`, `calendar_reconnect:soon:${reconnectedAt.getTime()}:expiring`],
        );
        assert.equal(await connectionService.notifyExpiringGrants(new Date(warnAt.getTime() + DAY)), 0, 'still once per grant');
    });

    it('hasActiveCalendarConnection: an active connection of an active user only', async () => {
        state = installConnectionDouble({ users: [asha, ravi], connections: [liveFake('c1', 'asha'), liveFake('c2', 'ravi')] });
        assert.equal(await hasActiveCalendarConnection('asha'), true);
        assert.equal(await hasActiveCalendarConnection('ravi'), false, 'inactive user');
        assert.equal(await hasActiveCalendarConnection('nobody'), false);
        state.connections[0].status = 'reauth_required';
        assert.equal(await hasActiveCalendarConnection('asha'), false);
    });
});
