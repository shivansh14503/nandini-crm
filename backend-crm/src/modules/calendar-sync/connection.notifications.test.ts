import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOTIFICATION_KINDS } from '../notifications/notification.producer.js';
import { isoWeekKey, reconnectDedupeKey, reconnectNotification } from './connection.notifications.js';

/** `calendar_reconnect` notifications: texts, dedupe keys and where they point. Pure. */

describe('calendar_reconnect notifications', () => {
    const connectedAt = new Date('2026-11-20T09:30:00.000Z');
    const row = { id: 'conn-1', username: 'asha', provider: 'google', connectedAt };
    const now = new Date('2026-11-26T06:00:00.000Z');
    const grant = `calendar_reconnect:conn-1:${connectedAt.getTime()}`;

    it('is a known notification kind', () => {
        assert.ok((NOTIFICATION_KINDS as readonly string[]).includes('calendar_reconnect'));
    });

    it('ISO week keys (UTC), including the year boundary', () => {
        assert.equal(isoWeekKey(now), '2026-W48');
        assert.equal(isoWeekKey(new Date('2027-01-01T12:00:00Z')), '2026-W53');
        assert.equal(isoWeekKey(new Date('2025-12-29T00:00:00Z')), '2026-W01');
    });

    it('one per grant and week for a refused sign-in; one per grant for the access-ends warning', () => {
        assert.equal(reconnectDedupeKey(row, 'invalid_grant', now), `${grant}:2026-W48`);
        assert.equal(reconnectDedupeKey(row, 'client_changed', now), `${grant}:2026-W48`);
        assert.equal(reconnectDedupeKey(row, 'expiring', now), `${grant}:expiring`);
        // A reconnect of the same account keeps the row id but sets connectedAt again: the keys re-arm.
        const reconnected = { ...row, connectedAt: new Date('2026-11-26T05:00:00.000Z') };
        assert.notEqual(reconnectDedupeKey(reconnected, 'invalid_grant', now), reconnectDedupeKey(row, 'invalid_grant', now));
        assert.notEqual(reconnectDedupeKey(reconnected, 'expiring', now), reconnectDedupeKey(row, 'expiring', now));
        assert.ok(reconnectDedupeKey({ id: 'x'.repeat(50), connectedAt }, 'invalid_grant', now).length <= 200, 'fits Notification.dedupeKey');
    });

    it('names the provider, points at the connection, comes from the system, and carries no account address or token', () => {
        const n = reconnectNotification(row, 'invalid_grant', now);
        assert.equal(n.kind, 'calendar_reconnect');
        assert.equal(n.username, 'asha');
        assert.equal(n.title, 'Reconnect your Google Calendar');
        assert.equal(n.entityModule, 'calendar-connections');
        assert.equal(n.entityId, 'conn-1');
        assert.equal(n.actor, 'system');
        const expiring = reconnectNotification({ ...row, provider: 'microsoft' }, 'expiring', now, new Date('2026-11-28T00:00:00Z'));
        assert.equal(expiring.title, 'Your Microsoft 365 (Outlook) access ends soon');
        assert.equal(expiring.dedupeKey, `${grant}:expiring`);
    });
});
