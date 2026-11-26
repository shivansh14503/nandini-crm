import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { notificationHref } from './notification.service.js';
import { formatNotificationCursor, notificationListQuerySchema, parseNotificationCursor } from './notification.validator.js';

describe('notificationListQuerySchema', () => {
    it('defaults to 20 rows, all notifications, the newest page', () => {
        const parsed = notificationListQuerySchema.parse({});
        assert.equal(parsed.limit, 20);
        assert.equal(parsed.unreadOnly, undefined);
        assert.equal(parsed.before, undefined);
        assert.equal(notificationListQuerySchema.parse({ limit: '' }).limit, 20);
    });

    it('accepts a limit from 1 to 50 and refuses anything else', () => {
        assert.equal(notificationListQuerySchema.parse({ limit: '50' }).limit, 50);
        assert.equal(notificationListQuerySchema.parse({ limit: '1' }).limit, 1);
        for (const limit of ['0', '51', 'abc', '2.5']) {
            const parsed = notificationListQuerySchema.safeParse({ limit });
            assert.equal(parsed.success, false, limit);
            assert.equal(parsed.error?.issues[0].message, 'limit must be a whole number from 1 to 50.');
        }
    });

    it('reads unreadOnly as a boolean flag', () => {
        assert.equal(notificationListQuerySchema.parse({ unreadOnly: 'true' }).unreadOnly, true);
        assert.equal(notificationListQuerySchema.parse({ unreadOnly: '0' }).unreadOnly, false);
        assert.equal(notificationListQuerySchema.safeParse({ unreadOnly: 'yes' }).success, false);
    });

    it('parses the before cursor and refuses a malformed one', () => {
        const cursor = notificationListQuerySchema.parse({ before: '2026-11-25T04:30:00.000Z|n1' }).before;
        assert.equal(cursor?.createdAt.toISOString(), '2026-11-25T04:30:00.000Z');
        assert.equal(cursor?.id, 'n1');
        for (const before of ['n1', '2026-11-25|n1', '2026-11-25T04:30:00.000Z|', 'not a date|n1', '2026-13-45T99:99:99Z|n1']) {
            assert.equal(notificationListQuerySchema.safeParse({ before }).success, false, before);
        }
    });
});

describe('cursor round trip', () => {
    it('formats nextCursor so it parses back to the same row', () => {
        const row = { createdAt: new Date('2026-11-25T04:30:00.123Z'), id: '6f1c2a3e-0000-4000-8000-000000000001' };
        assert.deepEqual(parseNotificationCursor(formatNotificationCursor(row)), row);
    });
});

describe('notificationHref', () => {
    it('opens activities in the calendar drawer and contracts on their page', () => {
        assert.equal(notificationHref('activities', 'a1'), '/calendar?activity=a1');
        assert.equal(notificationHref('contracts', 'c1'), '/contracts/c1');
        assert.equal(notificationHref('leads', 'l1'), '');
        assert.equal(notificationHref('activities', null), '');
    });

    it('opens calendar_reconnect notifications on My Profile › Connected accounts (whatever the connection id)', () => {
        assert.equal(notificationHref('calendar-connections', 'conn-1'), '/profile?tab=connected-accounts');
        assert.equal(notificationHref('calendar-connections', null), '/profile?tab=connected-accounts');
    });
});
