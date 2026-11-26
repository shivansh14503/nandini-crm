import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REDACTED } from '../../services/auditCatalog.js';
import { buildUndoPatch, CALENDAR_CHANGE_REASON, entryActions, fieldValue, FOLLOW_UP_LOCK_REASON, planUndo, sameValue, undoBlockFor } from './auditUndo.js';

describe('sameValue', () => {
    it('treats every blank spelling alike', () => {
        assert.equal(sameValue(undefined, null), true);
        assert.equal(sameValue('', null), true);
        assert.equal(sameValue([], undefined), true);
        assert.equal(sameValue('', 'x'), false);
        assert.equal(sameValue(0, null), false);
        assert.equal(sameValue(false, null), false);
    });

    it('ignores object key order but not array order', () => {
        assert.equal(sameValue({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true);
        assert.equal(sameValue([1, 2], [2, 1]), false);
        assert.equal(sameValue([{ email: 'a@b.in', isPrimary: true }], [{ isPrimary: true, email: 'a@b.in' }]), true);
    });

    it('compares values of different types as different', () => {
        assert.equal(sameValue('1', 1), false);
        assert.equal(sameValue('Open', 'open'), false);
    });
});

describe('fieldValue', () => {
    it('reads top-level fields and custom fields', () => {
        const record = { status: 'Open', customFields: { po_number: 'PO-1' } };
        assert.equal(fieldValue(record, 'status'), 'Open');
        assert.equal(fieldValue(record, 'customFields.po_number'), 'PO-1');
        assert.equal(fieldValue(record, 'customFields.missing'), undefined);
        assert.equal(fieldValue({ customFields: null }, 'customFields.po_number'), undefined);
    });
});

describe('planUndo', () => {
    const record = { assignedTo: 'asha', status: 'Won', mobile: '+919800000003', tradeName: '', customFields: { po_number: 'PO-2', region: 'North' } };

    it('marks each changed field ready, conflict, already or blocked', () => {
        const changes = {
            assignedTo: { from: 'ravi', to: 'asha' },
            status: { from: 'Open', to: 'Contacted' },
            mobile: { from: '+919800000003', to: '+919800000002' },
            secret: { from: REDACTED, to: REDACTED },
            gone: { from: 'a', to: 'b' },
            _meta: { from: 'x', to: 'y' },
            followUp: { scheduled: true },
        };
        const plans = planUndo(changes, record);
        assert.deepEqual(
            plans.map((plan) => [plan.key, plan.status]),
            [
                ['assignedTo', 'ready'],
                ['status', 'conflict'],
                ['mobile', 'already'],
                ['secret', 'blocked'],
                ['gone', 'blocked'],
            ],
        );
        assert.equal(plans[1].current, 'Won');
    });

    it('expands custom field diffs and reads one-sided pairs', () => {
        const changes = {
            customFields: { from: { po_number: 'PO-1' }, to: { po_number: 'PO-2', region: 'North' } },
            tradeName: { to: '' },
        };
        const plans = planUndo(changes, record);
        assert.deepEqual(
            plans.map((plan) => [plan.key, plan.from, plan.status]),
            [
                ['customFields.po_number', 'PO-1', 'ready'],
                ['customFields.region', undefined, 'ready'],
                ['tradeName', undefined, 'already'],
            ],
        );
    });

    it('accepts a field set to blank that is still blank', () => {
        const plans = planUndo({ tradeName: { from: 'KIRAN PHARMA', to: null } }, record);
        assert.equal(plans[0].status, 'ready');
    });
});

describe('buildUndoPatch', () => {
    const record = { assignedTo: 'asha', customFields: { po_number: 'PO-2', region: 'North', keep: 'yes' } };
    const plans = planUndo(
        {
            assignedTo: { from: 'ravi', to: 'asha' },
            tradeName: { from: 'Old', to: 'New' },
            customFields: { from: { po_number: 'PO-1' }, to: { po_number: 'PO-2', region: 'North' } },
        },
        { ...record, tradeName: 'Newer' },
    );

    it('puts back ready fields only, custom fields merged into the current bag', () => {
        assert.deepEqual(buildUndoPatch(plans, record), {
            assignedTo: 'ravi',
            customFields: { po_number: 'PO-1', keep: 'yes' },
        });
    });

    it('limits the patch to the chosen keys', () => {
        assert.deepEqual(buildUndoPatch(plans, record, ['customFields.region']), { customFields: { po_number: 'PO-2', keep: 'yes' } });
        assert.deepEqual(buildUndoPatch(plans, record, ['tradeName']), {});
    });

    it('writes a missing earlier value as null', () => {
        const added = planUndo({ designation: { to: 'Manager' } }, { designation: 'Manager' });
        assert.deepEqual(buildUndoPatch(added, {}), { designation: null });
    });
});

describe('entryActions', () => {
    const diff = { status: { from: 'Open', to: 'Won' } };

    it('offers restore on the delete of a deleted CRM record, once', () => {
        assert.deepEqual(entryActions({ action: 'DELETE', entityType: 'Lead' }, null, 'deleted', false), { undo: null, restore: { available: true } });
        assert.equal(entryActions({ action: 'DELETE', entityType: 'Lead' }, null, 'deleted', true).restore?.available, false);
        assert.equal(entryActions({ action: 'DELETE', entityType: 'Lead' }, null, 'live', false).restore?.available, false);
        assert.equal(entryActions({ action: 'DELETE', entityType: 'Lead' }, null, 'missing', false).restore?.available, false);
        assert.deepEqual(entryActions({ action: 'DELETE', entityType: 'Contract' }, null, 'deleted', false), { undo: null, restore: { available: true } });
        assert.deepEqual(entryActions({ action: 'DELETE', entityType: 'Activity' }, null, 'deleted', false), { undo: null, restore: { available: true } });
    });

    it('offers undo on field and status changes of a live CRM record, once', () => {
        assert.deepEqual(entryActions({ action: 'UPDATE', entityType: 'Contact' }, diff, 'live', false), { undo: { available: true }, restore: null });
        assert.equal(entryActions({ action: 'STATUS_CHANGE', entityType: 'Organization' }, diff, 'live', false).undo?.available, true);
        assert.equal(entryActions({ action: 'UPDATE', entityType: 'Activity' }, diff, 'live', false).undo?.available, true);
        assert.equal(entryActions({ action: 'UPDATE', entityType: 'Contact' }, diff, 'live', true).undo?.available, false);
        assert.match(entryActions({ action: 'UPDATE', entityType: 'Contact' }, diff, 'deleted', false).undo?.reason ?? '', /Restore it first/);
        assert.equal(entryActions({ action: 'UPDATE', entityType: 'Contact' }, { reordered: 3 }, 'live', false).undo?.available, false);
    });

    it('offers nothing for conversions, imports, follow-ups, settings and sign-ins', () => {
        const none = { undo: null, restore: null };
        assert.deepEqual(entryActions({ action: 'CONVERT', entityType: 'Lead' }, diff, 'live', false), none);
        assert.deepEqual(entryActions({ action: 'FOLLOW_UP', entityType: 'Lead' }, diff, 'live', false), none);
        // A colleague's reply: the update path can't set it back.
        assert.deepEqual(entryActions({ action: 'RSVP', entityType: 'Activity' }, { attendees: { from: [], to: [] } }, 'live', false), none);
        assert.deepEqual(entryActions({ action: 'IMPORT', entityType: 'Import' }, null, null, false), none);
        assert.deepEqual(entryActions({ action: 'UPDATE', entityType: 'FormField' }, diff, null, false), none);
        assert.deepEqual(entryActions({ action: 'DELETE', entityType: 'DropdownOption' }, null, null, false), none);
        assert.deepEqual(entryActions({ action: 'LOGIN', entityType: 'User' }, null, null, false), none);
    });
});

describe('undo of locked fields (P2-4 follow-up activities, P2-5 calendar changes)', () => {
    const FOLLOW_UP_FIELDS = ['followupType', 'startAt', 'endAt', 'allDay', 'status', 'assignedTo', 'relatedModule', 'relatedId', 'relatedTo'];
    const activity = { subject: 'Call follow-up: LD-0012 Sunrise', startAt: '2026-12-03T05:30:00.000Z', startDay: null, status: 'Planned', remarks: 'x', lockedFields: FOLLOW_UP_FIELDS };

    it('blocks the locked fields of a follow-up activity (with their companions), and nothing of an ordinary one', () => {
        const block = undoBlockFor({ entityType: 'Activity', route: '/api/activities/a1' }, activity);
        assert.ok(block && block.fields !== 'all');
        assert.equal(block.reason, FOLLOW_UP_LOCK_REASON);
        assert.equal(block.fields.has('startAt'), true);
        assert.equal(block.fields.has('startDay'), true);
        assert.equal(block.fields.has('relatedCode'), true);
        assert.equal(block.fields.has('subject'), false);
        assert.equal(undoBlockFor({ entityType: 'Activity', route: 'job:calendar-sync:google' }, { ...activity, lockedFields: [] }), null);
        assert.equal(undoBlockFor({ entityType: 'Lead', route: '/api/leads/l1' }, {}), null);
    });

    it('plans locked fields as blocked with the reason; the rest stays undoable', () => {
        const block = undoBlockFor({ entityType: 'Activity' }, activity);
        const plan = planUndo(
            { startAt: { from: '2026-12-02T05:30:00.000Z', to: '2026-12-03T05:30:00.000Z' }, subject: { from: 'Old', to: 'Call follow-up: LD-0012 Sunrise' } },
            activity,
            block,
        );
        const byKey = Object.fromEntries(plan.map((field) => [field.key, field]));
        assert.equal(byKey.startAt.status, 'blocked');
        assert.equal(byKey.startAt.reason, FOLLOW_UP_LOCK_REASON);
        assert.equal(byKey.subject.status, 'ready');
        assert.equal(byKey.subject.reason, undefined);
    });

    it('blocks every field of a lead / opportunity change written by calendar sync', () => {
        const block = undoBlockFor({ entityType: 'Opportunity', route: 'job:calendar-sync:outlook' }, {});
        assert.deepEqual(block, { fields: 'all', reason: CALENDAR_CHANGE_REASON });
        const plan = planUndo({ nextFollowupDate: { from: '2026-12-02', to: '2026-12-03' } }, { nextFollowupDate: '2026-12-03' }, block);
        assert.equal(plan[0].status, 'blocked');
    });
});
