import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { configureSecretBox, parseKeyRing, secretBox } from '../../services/secretBox.js';
import {
    ACCESS_REFRESH_LEEWAY_MS,
    ConnectionUnavailableError,
    openToken,
    sealTokenColumns,
    tokenAad,
    usableConnection,
    withAccessToken,
} from './connectionTokens.js';
import { createFakeAdapter, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { ProviderAuthError, ProviderClientError } from './providers/http.js';
import { setAdapterForTests, setFakeProviderEnabledForTests } from './providers/registry.js';
import type { CalendarProviderAdapter } from './providers/types.js';
import { blankConnection, installConnectionDouble, restoreConnectionDouble, type DoubleState, type UserRow } from './testing/connectionDouble.js';

/**
 * Access tokens of a stored connection (connectionTokens.ts): the gates, refresh with compare-and-set on tokenVersion,
 * the 401 retry, and what a refused refresh does (reauth + one notification) or does not do (invalid_client).
 */

const now = new Date('2026-11-26T06:00:00.000Z');
const asha: UserRow = { id: 1, username: 'asha', fullName: 'Asha Rao', email: 'asha@nandiniinfosys.com', isActive: true, isGroupUser: false };
const ID = 'conn-1';

let state: DoubleState;
let fake: CalendarProviderAdapter;

/** An active fake connection whose refresh token the fake provider knows. */
function seedConnection(over: Record<string, unknown> = {}, accessExpiresAt = new Date(now.getTime() + 30 * 60_000)) {
    fakeProviderState.refreshTokens.set('rt-1', { email: asha.email!, revoked: false });
    fakeProviderState.accessTokens.set('at-1', { email: asha.email!, nonce: '', expiresAt: accessExpiresAt });
    const sealed = sealTokenColumns(ID, { accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: accessExpiresAt, scope: 'fake.calendar' });
    return blankConnection({ id: ID, username: 'asha', provider: 'fake', accountId: 'fake:asha@nandiniinfosys.com', accountEmail: asha.email!, ...sealed, ...over }, now);
}

beforeEach(() => {
    configureSecretBox(parseKeyRing(`k1:${randomBytes(32).toString('base64')}`));
    resetFakeProvider();
    setFakeProviderEnabledForTests(true);
    fake = createFakeAdapter({ now: () => now });
    setAdapterForTests('fake', fake);
});

afterEach(() => {
    restoreConnectionDouble();
    configureSecretBox(null);
    setFakeProviderEnabledForTests(null);
    setAdapterForTests('fake', null);
});

const unavailable = (reason: string) => (err: unknown) => {
    assert.ok(err instanceof ConnectionUnavailableError, `expected ConnectionUnavailableError, got ${String(err)}`);
    assert.equal(err.reason, reason);
    return true;
};

describe('sealed token columns', () => {
    it('binds each token to its row and column (AAD), and keeps the stored refresh token when none is returned', () => {
        const first = sealTokenColumns(ID, { accessToken: 'a1', refreshToken: 'r1', expiresAt: now, scope: null, refreshTokenExpiresAt: new Date(now.getTime() + 86_400_000) });
        assert.equal(openToken({ id: ID, ...first }, 'accessToken'), 'a1');
        assert.equal(openToken({ id: ID, ...first }, 'refreshToken'), 'r1');
        assert.throws(() => openToken({ id: 'other', ...first }, 'accessToken'), 'copied to another row: does not open');
        assert.throws(() => secretBox.open(first.accessTokenEnc!, tokenAad(ID, 'refreshToken')), 'copied to the other column: does not open');

        const second = sealTokenColumns(ID, { accessToken: 'a2', expiresAt: now, scope: null }, first);
        assert.equal(second.refreshTokenEnc, first.refreshTokenEnc);
        assert.equal(second.refreshTokenExpiresAt, first.refreshTokenExpiresAt);
        assert.equal(second.keyId, 'k1');
        assert.equal(openToken({ id: ID, ...second }, 'accessToken'), 'a2');
    });
});

describe('usableConnection gates', () => {
    it('no key → key_missing; unknown id → not_found; reauth_required / disconnected rows are not used', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection()] });
        configureSecretBox(null);
        await assert.rejects(usableConnection(ID, now), unavailable('key_missing'));
        configureSecretBox(parseKeyRing(`k1:${randomBytes(32).toString('base64')}`));
        await assert.rejects(usableConnection('nope', now), unavailable('not_found'));
        state.connections[0].status = 'reauth_required';
        await assert.rejects(usableConnection(ID, now), unavailable('reauth_required'));
        state.connections[0].status = 'disconnected';
        await assert.rejects(usableConnection(ID, now), unavailable('not_active'));
    });

    it('an inactive or shared CRM login is not used (D43); a provider switched off is not used', async () => {
        state = installConnectionDouble({ users: [{ ...asha, isActive: false }], connections: [seedConnection()] });
        await assert.rejects(usableConnection(ID, now), unavailable('user_inactive'));
        state.users[0].isActive = true;
        state.users[0].isGroupUser = true;
        await assert.rejects(usableConnection(ID, now), unavailable('user_inactive'));
        state.users[0].isGroupUser = false;
        setFakeProviderEnabledForTests(false);
        await assert.rejects(usableConnection(ID, now), unavailable('provider_disabled'));
        assert.equal(state.connections[0].status, 'active', 'none of these change the row');
        assert.equal(state.notifications.length, 0);
    });

    it('another company app version → reauth_required (client_changed) with one notification a week', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection({ clientVersion: 7 })] });
        await assert.rejects(usableConnection(ID, now), unavailable('client_changed'));
        assert.equal(state.connections[0].status, 'reauth_required');
        assert.equal(state.connections[0].statusReason, 'client_changed');
        assert.deepEqual(
            state.notifications.map((n) => [n.username, n.kind, n.entityModule, n.entityId, n.dedupeKey]),
            [['asha', 'calendar_reconnect', 'calendar-connections', ID, `calendar_reconnect:${ID}:2026-W48`]],
        );
        // The row is no longer active: a second use neither marks nor notifies again.
        await assert.rejects(usableConnection(ID, now), unavailable('reauth_required'));
        assert.equal(state.notifications.length, 1);
    });

    it('a time-limited grant that ended → reauth_required (grant_expired)', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection({ refreshTokenExpiresAt: new Date(now.getTime() - 1000) })] });
        await assert.rejects(usableConnection(ID, now), unavailable('grant_expired'));
        assert.equal(state.connections[0].statusReason, 'grant_expired');
        assert.equal(state.notifications.length, 1);
    });
});

describe('withAccessToken', () => {
    it('uses a fresh token as it is; refreshes first inside the 5-minute window', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection()] });
        assert.equal(await withAccessToken(ID, async (t) => t, () => now), 'at-1');
        assert.equal(fakeProviderState.refreshCalls, 0);

        state.connections[0].accessTokenExpiresAt = new Date(now.getTime() + ACCESS_REFRESH_LEEWAY_MS);
        const token = await withAccessToken(ID, async (t) => t, () => now);
        assert.notEqual(token, 'at-1');
        assert.equal(fakeProviderState.refreshCalls, 1);
        assert.equal(state.connections[0].tokenVersion, 1);
        assert.equal(openToken(state.connections[0], 'accessToken'), token);
        assert.equal(fakeProviderState.refreshTokens.get('rt-1')!.revoked, true, 'the fake rotates');
        assert.notEqual(openToken(state.connections[0], 'refreshToken'), 'rt-1', 'the rotated refresh token is stored');
    });

    it('a provider 401 on the call → one refresh, one retry with the new token', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection()] });
        const seen: string[] = [];
        const result = await withAccessToken(
            ID,
            async (t) => {
                seen.push(t);
                if (seen.length === 1) throw new ProviderAuthError({ provider: 'fake', operation: 'events', status: 401, code: 'unauthorized' });
                return 'ok';
            },
            () => now,
        );
        assert.equal(result, 'ok');
        assert.equal(seen.length, 2);
        assert.equal(seen[0], 'at-1');
        assert.notEqual(seen[1], 'at-1');
        assert.equal(fakeProviderState.refreshCalls, 1);
    });

    it('lost compare-and-set race → the stored winner token is used, nothing is overwritten', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection({}, new Date(now.getTime() + 60_000))] });
        const winner = sealTokenColumns(ID, { accessToken: 'winner-at', refreshToken: 'winner-rt', expiresAt: new Date(now.getTime() + 3_600_000), scope: null });
        setAdapterForTests('fake', {
            ...fake,
            async refresh(input) {
                const tokens = await fake.refresh(input);
                // Another process refreshed while this request was out.
                Object.assign(state.connections[0], winner, { tokenVersion: state.connections[0].tokenVersion + 1 });
                return tokens;
            },
        });
        assert.equal(await withAccessToken(ID, async (t) => t, () => now), 'winner-at');
        assert.equal(state.connections[0].tokenVersion, 1);
        assert.equal(openToken(state.connections[0], 'refreshToken'), 'winner-rt');
        assert.equal(state.connections[0].status, 'active');
    });

    it('refresh refused because another process already rotated the token → uses theirs, no reauth', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection({}, new Date(now.getTime() + 60_000))] });
        const winner = sealTokenColumns(ID, { accessToken: 'winner-at', refreshToken: 'winner-rt', expiresAt: new Date(now.getTime() + 3_600_000), scope: null });
        setAdapterForTests('fake', {
            ...fake,
            async refresh() {
                Object.assign(state.connections[0], winner, { tokenVersion: 1 });
                throw new ProviderAuthError({ provider: 'fake', operation: 'refresh', status: 400, code: 'invalid_grant' });
            },
        });
        assert.equal(await withAccessToken(ID, async (t) => t, () => now), 'winner-at');
        assert.equal(state.connections[0].status, 'active');
        assert.equal(state.notifications.length, 0);
    });

    it('invalid_grant → reauth_required, one calendar_reconnect notification, the callback is not called', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection({}, new Date(now.getTime() + 60_000))] });
        fakeProviderState.failNextRefresh = 'invalid_grant';
        let called = false;
        await assert.rejects(
            withAccessToken(ID, async () => (called = true), () => now),
            unavailable('reauth_required'),
        );
        assert.equal(called, false);
        assert.equal(state.connections[0].status, 'reauth_required');
        assert.equal(state.connections[0].statusReason, 'invalid_grant');
        assert.equal(state.connections[0].lastErrorCode, 'invalid_grant');
        assert.equal(state.notifications.length, 1);
        assert.equal(state.notifications[0].title, 'Reconnect your Test calendar (development only)');
    });

    it('invalid_client (an admin changed the secret) → the error goes back, the connection is not marked', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection({}, new Date(now.getTime() + 60_000))] });
        setAdapterForTests('fake', {
            ...fake,
            async refresh() {
                throw new ProviderClientError({ provider: 'fake', operation: 'refresh', status: 401, code: 'invalid_client' });
            },
        });
        await assert.rejects(withAccessToken(ID, async (t) => t, () => now), ProviderClientError);
        assert.equal(state.connections[0].status, 'active');
        assert.equal(state.notifications.length, 0);
    });

    it('tokens sealed with a key no longer in the ring → error / key_error (no token leaves)', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection()] });
        configureSecretBox(parseKeyRing(`k2:${randomBytes(32).toString('base64')}`));
        await assert.rejects(withAccessToken(ID, async (t) => t, () => now), unavailable('key_error'));
        assert.equal(state.connections[0].status, 'error');
        assert.equal(state.connections[0].statusReason, 'key_error');
    });

    it('a row without a refresh token → reauth_required', async () => {
        state = installConnectionDouble({ users: [asha], connections: [seedConnection({ refreshTokenEnc: null }, new Date(now.getTime() + 60_000))] });
        await assert.rejects(withAccessToken(ID, async (t) => t, () => now), unavailable('reauth_required'));
        assert.equal(state.connections[0].status, 'reauth_required');
    });
});
