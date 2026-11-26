import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { configureSecretBox } from '../../services/secretBox.js';
import { GRAPH_API } from '../integrations/integration.constants.js';
import { checkConnection, ConnectionUnavailableError, onConnectionReady, withCalendarAccess } from './calendarAccess.js';
import { CHECK_BACKOFF_MS } from './connection.constants.js';
import { fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { resetProviderPauses } from './providers/http.js';
import { createMicrosoftAdapter } from './providers/microsoft.js';
import { setAdapterForTests, setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { ADMIN_ERROR_MESSAGES } from './syncErrors.js';
import { blankConnection, installConnectionDouble, microsoftProviderRow, restoreConnectionDouble, useTestSecretBox, type ConnectionRowState, type DoubleState, type UserRow } from './testing/connectionDouble.js';
import { fakeFetch, route } from './testing/fakeFetch.js';
import { createTokenSource, setTokenSourceForTests } from './tokenSource.js';

/** withCalendarAccess / checkConnection (addendum §2.2): gates, 401 retry, user vs app failures, health, notifications. */

const now = new Date('2026-11-26T06:00:00.000Z');
const clock = () => now;
const user = (id: number, username: string, over: Partial<UserRow> = {}): UserRow => ({ id, username, fullName: username, email: `${username}@nandiniinfosys.com`, isActive: true, isGroupUser: false, ...over });
const admin = user(9, 'admin', { role: 'Admin' });
const fakeRow = (id: string, username: string, over: Partial<ConnectionRowState> = {}) =>
    blankConnection({ id, username, provider: 'fake', accountEmail: `${username}@nandiniinfosys.com`, ...over }, now);

let state: DoubleState;

beforeEach(() => {
    resetFakeProvider();
    resetProviderPauses();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
});

afterEach(() => {
    restoreConnectionDouble();
    setFakeProviderEnabledForTests(null);
    setTokenSourceForTests(null);
    setAdapterForTests('microsoft', null);
    configureSecretBox(null);
});

describe('withCalendarAccess (fake provider)', () => {
    it('success: pending → ok once, the ready listener runs once, the call gets the mailbox and a fresh token', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha')], connections: [fakeRow('c1', 'asha')] });
        const ready: string[] = [];
        const off = onConnectionReady((row) => {
            ready.push(row.id);
        });
        try {
            const seen = await withCalendarAccess('c1', async (ctx) => ctx, { clock });
            assert.equal(seen.mailbox, 'asha@nandiniinfosys.com');
            assert.match(seen.accessToken, /^fake-at-/);
            const row = state.connections[0];
            assert.equal(row.status, 'ok');
            assert.equal(row.lastSuccessAt?.getTime(), now.getTime());
            await withCalendarAccess('c1', async () => undefined, { clock });
            assert.deepEqual(ready, ['c1']);
            assert.equal(fakeProviderState.mints.length, 1, 'the second call reuses the cached grant');
        } finally {
            off();
        }
    });

    it('a 401 drops the grant, mints once more and retries once', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha')], connections: [fakeRow('c1', 'asha', { status: 'ok' })] });
        fakeProviderState.revokeOnce.add('asha@nandiniinfosys.com');
        assert.equal(await checkConnection('c1', clock), 'ok');
        assert.equal(fakeProviderState.mints.length, 2);
        assert.equal(fakeProviderState.probes.length, 2);
    });

    it('a user-level failure marks the row error with the admin sentence and a 15-minute backoff; others keep working', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha'), user(2, 'ravi')], connections: [fakeRow('c1', 'asha', { status: 'ok' }), fakeRow('c2', 'ravi')] });
        fakeProviderState.probeFailures.set('asha@nandiniinfosys.com', 403);
        assert.equal(await checkConnection('c1', clock), 'user_error');
        const row = state.connections.find((c) => c.id === 'c1')!;
        assert.equal(row.status, 'error');
        assert.equal(row.statusReason, 'calendar_unavailable');
        assert.ok(row.lastErrorMessage?.startsWith(ADMIN_ERROR_MESSAGES.calendar_unavailable));
        assert.equal(row.nextCheckAt?.getTime(), now.getTime() + CHECK_BACKOFF_MS[0]);
        assert.equal(row.consecutiveFailures, 1);
        assert.equal(await checkConnection('c2', clock), 'ok');
        assert.equal(state.notifications.length, 0, 'user-level problems are not notified one by one');

        // Fixed: the next check clears the error.
        fakeProviderState.probeFailures.clear();
        assert.equal(await checkConnection('c1', clock), 'ok');
        assert.equal(row.status, 'ok');
        assert.equal(row.lastErrorMessage, null);
        assert.equal(row.consecutiveFailures, 0);
    });

    it('a token failure of one person (user_not_found) is user-level too', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha')], connections: [fakeRow('c1', 'asha')] });
        fakeProviderState.userFailures.set('asha@nandiniinfosys.com', { level: 'user', code: 'user_not_found' });
        await assert.rejects(withCalendarAccess('c1', async () => undefined, { clock }), (err: unknown) => err instanceof ConnectionUnavailableError && err.reason === 'user_error' && err.failure?.code === 'user_not_found');
        assert.equal(state.connections[0].statusReason, 'user_not_found');
    });

    it('an app-level failure leaves rows alone, marks the provider unhealthy, notifies admins once a day and blocks further calls', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha'), user(2, 'ravi'), admin], connections: [fakeRow('c1', 'asha', { status: 'ok' }), fakeRow('c2', 'ravi', { status: 'ok' })] });
        fakeProviderState.appFailure = { level: 'app', code: 'delegation_missing' };
        assert.equal(await checkConnection('c1', clock), 'provider_unhealthy');
        assert.equal(state.connections[0].status, 'ok');
        assert.equal(state.notifications.length, 1);
        assert.equal(state.notifications[0].username, 'admin');
        assert.equal(state.notifications[0].kind, 'calendar_sync_issue');
        assert.equal(state.notifications[0].entityModule, 'admin-integrations');
        // The second person is blocked by the 5-minute app negative cache: no second token call, no second notification.
        await assert.rejects(withCalendarAccess('c2', async () => undefined, { clock }), (err: unknown) => err instanceof ConnectionUnavailableError && err.reason === 'provider_unhealthy');
        assert.equal(fakeProviderState.mints.length, 1);
        assert.equal(state.notifications.length, 1);
    });

    it('transient failures are rethrown untouched (nothing marked)', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha')], connections: [fakeRow('c1', 'asha', { status: 'ok' })] });
        fakeProviderState.probeFailures.set('asha@nandiniinfosys.com', 503);
        // The fake's 503 is a bad-request class without a probe meaning: classifyApiError returns null → rethrown.
        assert.equal(await checkConnection('c1', clock), 'transient');
        assert.equal(state.connections[0].status, 'ok');
    });

    it('gates: not_found, not_active, user_inactive (group logins too), provider_disabled', async () => {
        state = installConnectionDouble({
            users: [user(1, 'asha'), user(2, 'ravi', { isActive: false }), user(3, 'desk', { isGroupUser: true })],
            connections: [fakeRow('stopped', 'asha', { status: 'stopped', statusReason: 'excluded' }), fakeRow('r', 'ravi'), fakeRow('d', 'desk'), fakeRow('a', 'asha', { status: 'ok' })],
        });
        const reason = async (id: string) => {
            try {
                await withCalendarAccess(id, async () => undefined, { clock });
                return 'ok';
            } catch (err) {
                return (err as ConnectionUnavailableError).reason;
            }
        };
        assert.equal(await reason('missing'), 'not_found');
        assert.equal(await reason('stopped'), 'not_active');
        assert.equal(await reason('r'), 'user_inactive');
        assert.equal(await reason('d'), 'user_inactive');
        setFakeProviderEnabledForTests(false);
        assert.equal(await reason('a'), 'provider_disabled');
        assert.equal(await checkConnection('a', clock), 'skipped');
        assert.equal(fakeProviderState.mints.length, 0);
    });

    it('a real provider needs the encryption key (key_missing)', async () => {
        state = installConnectionDouble({ users: [user(1, 'asha')], connections: [blankConnection({ id: 'g', username: 'asha', provider: 'google', accountEmail: 'asha@nandiniinfosys.com' }, now)] });
        await assert.rejects(withCalendarAccess('g', async () => undefined, { clock }), (err: unknown) => err instanceof ConnectionUnavailableError && err.reason === 'key_missing');
    });
});

describe('Microsoft: 403 ErrorAccessDenied', () => {
    const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const msRow = (id: string, username: string, over: Partial<ConnectionRowState> = {}) =>
        blankConnection({ id, username, provider: 'microsoft', calendarId: '', accountEmail: `${username}@nandiniinfosys.com`, ...over }, now);

    function wire() {
        const { fetchImpl, calls } = fakeFetch([
            route(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, () => ({ status: 200, body: { access_token: 'app-token', expires_in: 3600 } })),
            route(GRAPH_API, () => ({ status: 403, body: { error: { code: 'ErrorAccessDenied', message: 'Access is denied. Check credentials and try again.' } } })),
        ]);
        setTokenSourceForTests(createTokenSource({ fetchImpl }));
        setAdapterForTests('microsoft', createMicrosoftAdapter({ fetchImpl }));
        return calls;
    }

    it('one person outside the app’s scope → their row is error mailbox_out_of_scope', async () => {
        useTestSecretBox();
        state = installConnectionDouble({ users: [user(1, 'asha'), admin], providers: [microsoftProviderRow()], connections: [msRow('m1', 'asha')] });
        const calls = wire();
        assert.equal(await checkConnection('m1', clock), 'user_error');
        assert.equal(state.connections[0].statusReason, 'mailbox_out_of_scope');
        assert.ok(calls.some((c) => c.url.startsWith(`${GRAPH_API}/users/asha%40nandiniinfosys.com/events`)));
        assert.equal(state.providers.get('microsoft')?.healthStatus, 'unknown');
    });

    it('when the other recent checks all failed the same way, it is the app: no_application_permission, provider unhealthy', async () => {
        useTestSecretBox();
        const failed = (id: string, username: string) =>
            msRow(id, username, { status: 'error', statusReason: 'mailbox_out_of_scope', lastErrorCode: 'mailbox_out_of_scope', lastCheckedAt: new Date(now.getTime() - 60_000) });
        state = installConnectionDouble({
            users: [user(1, 'asha'), user(2, 'b'), user(3, 'c'), user(4, 'd'), admin],
            providers: [microsoftProviderRow()],
            connections: [msRow('m1', 'asha'), failed('m2', 'b'), failed('m3', 'c'), failed('m4', 'd')],
        });
        wire();
        assert.equal(await checkConnection('m1', clock), 'provider_unhealthy');
        assert.equal(state.connections[0].status, 'pending', 'the row is not blamed');
        const provider = state.providers.get('microsoft')!;
        assert.equal(provider.healthStatus, 'error');
        assert.equal(provider.healthCode, 'no_application_permission');
        assert.equal(state.notifications.length, 1);
    });

    it('RBAC-scoped tenant: 12 people outside the scope next to synced people never read as the whole app (nightly re-checks)', async () => {
        useTestSecretBox();
        const outside = Array.from({ length: 12 }, (_, i) => `out${i}`);
        const inside = ['in1', 'in2'];
        state = installConnectionDouble({
            users: [...[...outside, ...inside].map((name, i) => user(i + 20, name)), admin],
            providers: [microsoftProviderRow()],
            connections: [
                ...outside.map((name, i) =>
                    msRow(`o${i}`, name, {
                        status: 'error',
                        statusReason: 'mailbox_out_of_scope',
                        lastErrorCode: 'mailbox_out_of_scope',
                        consecutiveFailures: 4,
                        // Checked last night; the ok rows were last checked when they first synced, days ago.
                        lastCheckedAt: new Date(now.getTime() - 3_600_000 + i),
                        nextCheckAt: new Date(now.getTime() - 1000),
                    }),
                ),
                ...inside.map((name, i) => msRow(`i${i}`, name, { status: 'ok', lastSuccessAt: new Date(now.getTime() - 5 * 86_400_000), lastCheckedAt: new Date(now.getTime() - 5 * 86_400_000) })),
            ],
        });
        wire();
        // The nightly run re-checks every due out-of-scope row, one after another.
        for (let i = 0; i < outside.length; i++) assert.equal(await checkConnection(`o${i}`, clock), 'user_error', `row o${i}`);
        assert.equal(state.providers.get('microsoft')?.healthStatus, 'unknown');
        assert.equal(state.notifications.length, 0);
        assert.ok(state.connections.filter((c) => c.id.startsWith('i')).every((c) => c.status === 'ok'));
    });

    it('stopped rows and their old errors do not count towards the app rule', async () => {
        useTestSecretBox();
        const stoppedFailed = (id: string, username: string) =>
            msRow(id, username, { status: 'stopped', statusReason: 'excluded', lastErrorCode: 'mailbox_out_of_scope', lastCheckedAt: new Date(now.getTime() - 60_000) });
        state = installConnectionDouble({
            users: [user(1, 'asha'), user(2, 'b'), user(3, 'c'), user(4, 'd'), admin],
            providers: [microsoftProviderRow()],
            connections: [msRow('m1', 'asha'), stoppedFailed('m2', 'b'), stoppedFailed('m3', 'c'), stoppedFailed('m4', 'd')],
        });
        wire();
        assert.equal(await checkConnection('m1', clock), 'user_error');
        assert.equal(state.providers.get('microsoft')?.healthStatus, 'unknown');
    });
});
