import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toCrmUserDto, type CrmUserRow } from './lookup.service.js';

const row: CrmUserRow = {
    id: 7,
    username: 'palak',
    fullName: 'Palak Sharma',
    department: null,
    role: 'Sales Executive',
    email: null,
    isActive: true,
    isGroupUser: false,
    onLeave: false,
    photo: { id: 'p-7' },
    preference: null,
};

describe('toCrmUserDto', () => {
    it('maps the directory fields; no preferences row = not out of office', () => {
        assert.deepEqual(toCrmUserDto(row, '2026-11-26'), {
            id: '7',
            name: 'Palak Sharma',
            username: 'palak',
            department: '',
            role: 'Sales Executive',
            email: '',
            status: 'Active',
            isGroupUser: false,
            onLeave: false,
            photoUrl: '/api/user-photos/p-7',
            outOfOffice: null,
        });
    });

    it('carries the out-of-office dates until their last day (the client decides whether it is active)', () => {
        const preference = { outOfOfficeFrom: new Date('2026-12-01T00:00:00.000Z'), outOfOfficeTo: new Date('2026-12-05T00:00:00.000Z'), outOfOfficeMessage: null };
        const expected = { from: '2026-12-01', to: '2026-12-05', message: null };
        assert.deepEqual(toCrmUserDto({ ...row, preference }, '2026-11-26').outOfOffice, expected);
        assert.deepEqual(toCrmUserDto({ ...row, preference }, '2026-12-05').outOfOffice, expected);
        assert.equal(toCrmUserDto({ ...row, preference }, '2026-12-06').outOfOffice, null);
    });
});
