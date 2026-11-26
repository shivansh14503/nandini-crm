import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOTIFICATION_KINDS } from '../notifications/notification.producer.js';
import { isoWeekKey, reconnectDedupeKey, reconnectNotification } from './connection.notifications.js';

/** `calendar_reconnect` notifications: texts, dedupe keys and where they point. Pure. */

describe('calendar_reconnect notifications', () => {
    const row = { id: 'conn-1', username: 'asha', provider: 'google' };
    const now = new Date('2026-11-26T06:00:00.000Z');

    it('is a known notification kind', () => {
        assert.ok((NOTIFICATION_KINDS as readonly string[]).includes('calendar_reconnect'));
    });

    it('ISO week keys (UTC), including the year boundary', () => {
        assert.equal(isoWeekKey(now), '2026-W48');
        assert.equal(isoWeekKey(new Date('2027-01-01T12:00:00Z')), '2026-W53');
        assert.equal(isoWeekKey(new Date('2025-12-29T00:00:00Z')), '2026-W01');
    });

    it('one per connection and week for a refused sign-in; one per connection for the access-ends warning', () => {
        assert.equal(reconnectDedupeKey('conn-1', 'invalid_grant', now), 'calendar_reconnect:conn-1:2026-W48');
        assert.equal(reconnectDedupeKey('conn-1', 'client_changed', now), 'calendar_reconnect:conn-1:2026-W48');
        assert.equal(reconnectDedupeKey('conn-1', 'expiring', now), 'calendar_reconnect:conn-1:expiring');
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
        assert.equal(expiring.dedupeKey, 'calendar_reconnect:conn-1:expiring');
    });
});
