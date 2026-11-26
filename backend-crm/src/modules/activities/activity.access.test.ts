import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthUser } from '../../types/user.types.js';
import { activityLocks, activityScopeWhere, canEditActivity, canViewActivity, EXTERNAL_EVENT_LOCKED, lockedFieldsFor, myResponseOf } from './activity.access.js';

const user = (role: string, username = 'palak'): AuthUser => ({ id: 1, username, role });
const exec = user('Sales Executive');
const row = {
    assignedTo: 'ravi',
    createdBy: 'meera',
    attendees: [
        { username: 'Palak', responseStatus: 'tentative' },
        { username: null, responseStatus: 'accepted' },
    ],
};

describe('activityScopeWhere', () => {
    it('is empty for global roles', () => {
        assert.deepEqual(activityScopeWhere(user('Admin')), {});
        assert.deepEqual(activityScopeWhere(user('Director - Operations')), {});
    });

    it('limits others to owned, created and attended activities', () => {
        assert.deepEqual(activityScopeWhere(exec), {
            OR: [{ assignedTo: 'palak' }, { createdBy: 'palak' }, { attendees: { some: { username: 'palak' } } }],
        });
    });
});

describe('canViewActivity / canEditActivity', () => {
    it('lets owners, creators and global roles see and change it', () => {
        for (const viewer of [user('Sales Executive', 'ravi'), user('Sales Executive', 'MEERA'), user('Director – Operations', 'x'), user('director - operations', 'x')]) {
            assert.equal(canViewActivity(viewer, row), true, viewer.username);
            assert.equal(canEditActivity(viewer, row), true, viewer.username);
        }
    });

    it('lets an invited colleague see it (any case) but not change it', () => {
        assert.equal(canViewActivity(exec, row), true);
        assert.equal(canEditActivity(exec, row), false);
    });

    it('refuses everyone else', () => {
        const other = user('Sales Executive', 'arjun');
        assert.equal(canViewActivity(other, row), false);
        assert.equal(canEditActivity(other, row), false);
        assert.equal(canViewActivity(other, { assignedTo: 'ravi', createdBy: 'meera' }), false);
    });
});

describe('myResponseOf', () => {
    it("returns the caller's reply, or null when not invited", () => {
        assert.equal(myResponseOf(exec, row), 'tentative');
        assert.equal(myResponseOf(user('Sales Executive', 'arjun'), row), null);
        assert.equal(myResponseOf(exec, { assignedTo: 'palak' }), null);
    });
});

describe('locks (spec §8.13)', () => {
    const lockRow = { origin: 'calendar', status: 'Planned', relatedModule: null, relatedCode: null };

    it('P2-8: a meeting organized outside the CRM locks title, time, place, attendees and owner; deleting it is allowed', () => {
        const lock = activityLocks.lockFor({ ...lockRow, externalOrganizer: true, organizerEmail: 'ravi@acme.com' });
        assert.equal(lock?.code, EXTERNAL_EVENT_LOCKED);
        assert.deepEqual(lock?.fields, ['subject', 'startAt', 'endAt', 'allDay', 'location', 'attendees', 'assignedTo']);
        assert.match(lock?.message ?? '', /Organized by ravi@acme\.com/);
        assert.equal(lock?.deleteRefusedReason, null);
    });

    it('an imported meeting the person organizes, and rows read without the column, are not locked', () => {
        assert.deepEqual(lockedFieldsFor({ ...lockRow, externalOrganizer: false }), []);
        assert.deepEqual(lockedFieldsFor(lockRow), []);
    });

    it('a follow-up activity keeps its own lock', () => {
        assert.equal(activityLocks.lockFor({ ...lockRow, origin: 'followup', relatedModule: 'leads', externalOrganizer: true })?.code, 'FOLLOW_UP_ACTIVITY_LOCKED');
    });
});
