import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActivityDto } from './activity.mapper.js';
import { mergeActivityPatch } from './activity.service.js';

const before: ActivityDto = {
    id: 'a1',
    followupType: 'Meeting',
    subject: 'Kick-off',
    status: 'Planned',
    assignedTo: 'palak',
    relatedModule: 'opportunities',
    relatedId: 'o1',
    relatedTo: 'CRM rollout',
    relatedCode: 'OPP-0001',
    organizationName: 'ACME',
    organizationId: 'org1',
    contact: 'Asha',
    contactId: 'c1',
    startAt: '2026-11-26T04:30:00.000Z',
    endAt: '2026-11-26T05:30:00.000Z',
    allDay: false,
    startDay: '',
    endDay: '',
    timeZone: 'Asia/Kolkata',
    location: '',
    reminder: '15 minutes before',
    customerResponse: '',
    remarks: '',
    attendees: [],
    completedAt: '',
    completedBy: '',
    customFields: {},
    origin: 'crm',
    createdBy: 'palak',
    updatedBy: '',
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
};

describe('mergeActivityPatch', () => {
    it('keeps the stored links for an unrelated change', () => {
        const merged = mergeActivityPatch(before, { subject: 'Kick-off call' });
        assert.equal(merged.organizationId, 'org1');
        assert.equal(merged.contactId, 'c1');
        assert.equal(merged.relatedId, 'o1');
    });

    it('drops an id whose name was retyped', () => {
        const merged = mergeActivityPatch(before, { organizationName: 'Globex', contact: 'asha' });
        assert.equal('organizationId' in merged, false);
        assert.equal(merged.contactId, 'c1'); // same name, other case
        const cleared = mergeActivityPatch(before, { relatedTo: '' });
        assert.equal('relatedId' in cleared || 'relatedModule' in cleared, false);
    });

    it('lets a newly picked record fill the organization and contact', () => {
        const merged = mergeActivityPatch(before, { relatedModule: 'leads', relatedId: 'l1', relatedTo: 'Ravi' });
        for (const key of ['organizationId', 'organizationName', 'contactId', 'contact']) assert.equal(key in merged, false, key);
        const explicit = mergeActivityPatch(before, { relatedModule: 'leads', relatedId: 'l1', organizationId: 'org2' });
        assert.equal(explicit.organizationId, 'org2');
        const same = mergeActivityPatch(before, { relatedModule: 'opportunities', relatedId: 'o1' });
        assert.equal(same.organizationId, 'org1');
    });

    it('keeps the organization and contact when the related record is cleared', () => {
        const stored = { organizationId: 'org1', organizationName: 'ACME', contactId: 'c1', contact: 'Asha' };
        for (const patch of [
            { relatedModule: null, relatedId: null, relatedTo: null },
            { relatedModule: '', relatedId: '', relatedTo: '' },
            { relatedModule: null, relatedId: null },
        ]) {
            const merged = mergeActivityPatch(before, patch);
            assert.deepEqual(
                { organizationId: merged.organizationId, organizationName: merged.organizationName, contactId: merged.contactId, contact: merged.contact },
                stored,
                JSON.stringify(patch),
            );
            assert.equal(merged.relatedId ?? null, patch.relatedId);
        }
        // Clearing it while retyping the organization still drops only the organization's id.
        const retyped = mergeActivityPatch(before, { relatedModule: null, relatedId: null, organizationName: 'Globex' });
        assert.equal('organizationId' in retyped, false);
        assert.equal(retyped.contactId, 'c1');
    });

    it('switches between timed and all-day', () => {
        const allDay = { ...before, allDay: true, startDay: '2026-11-26', endDay: '2026-11-27' };
        const timed = mergeActivityPatch(allDay, { allDay: false, startAt: '2026-11-26T04:30:00.000Z' });
        assert.equal('startDay' in timed || 'endDay' in timed, false);
        const toAllDay = mergeActivityPatch(before, { allDay: true });
        assert.equal('startDay' in toAllDay, false);
        assert.equal(toAllDay.startAt, before.startAt);
        const moved = mergeActivityPatch(allDay, { allDay: true, startDay: '2026-12-01', endDay: '2026-12-01' });
        assert.equal(moved.startDay, '2026-12-01');
    });
});
