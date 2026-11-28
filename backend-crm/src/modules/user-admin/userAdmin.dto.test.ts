import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSensitiveKey } from '../../services/auditCatalog.js';
import { adminUserAuditSnapshot, canonicalDepartment, departmentOptionsFrom, toAdminUserDto, type AdminUserRow } from './userAdmin.dto.js';
import { listWhere } from './userAdmin.service.js';

const row: AdminUserRow = {
    id: 12,
    username: 'asha.k',
    fullName: 'Asha Kapoor',
    firstName: 'Asha',
    lastName: 'Kapoor',
    email: 'asha@nandiniinfosys.com',
    role: 'Sales Manager',
    department: 'Sales',
    jobTitle: 'Regional Lead',
    reportsToId: 3,
    phone: '+919811234567',
    officePhone: null,
    isActive: true,
    isGroupUser: false,
    onLeave: false,
    invitePending: true,
    lastLoginAt: null,
    passwordChangedAt: new Date('2026-11-01T10:00:00.000Z'),
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date('2026-11-26T09:00:00.000Z'),
    createdBy: 'admin',
    deactivatedAt: null,
    photo: { id: 'p-1' },
    preference: null,
    reportsTo: { id: 3, fullName: 'Rahul Mehta', username: 'rahul', isActive: false },
    invites: [{ purpose: 'invite', createdAt: new Date('2026-11-26T09:00:00.000Z'), expiresAt: new Date('2026-11-29T09:00:00.000Z') }],
    _count: { directReports: 4 },
};
const now = new Date('2026-11-26T12:00:00.000Z');
const emailRule = { duplicates: new Set<string>(), companyDomains: ['nandiniinfosys.com'] };
const today = '2026-11-26';

describe('toAdminUserDto', () => {
    it('maps every field, with role access, the manager and ISO dates', () => {
        assert.deepEqual(toAdminUserDto(row, emailRule, today, now), {
            id: 12,
            username: 'asha.k',
            fullName: 'Asha Kapoor',
            firstName: 'Asha',
            lastName: 'Kapoor',
            email: 'asha@nandiniinfosys.com',
            role: 'Sales Manager',
            roleAccess: 'all-records',
            department: 'Sales',
            jobTitle: 'Regional Lead',
            reportsTo: { id: 3, name: 'Rahul Mehta', isActive: false },
            directReportsCount: 4,
            mobile: '+919811234567',
            officePhone: null,
            photoUrl: '/api/user-photos/p-1',
            isActive: true,
            isGroupUser: false,
            onLeave: false,
            outOfOffice: null,
            invitePending: true,
            invite: { purpose: 'invite', sentAt: '2026-11-26T09:00:00.000Z', expiresAt: '2026-11-29T09:00:00.000Z', expired: false },
            lastLoginAt: null,
            passwordChangedAt: '2026-11-01T10:00:00.000Z',
            lockedUntil: null,
            failedLoginCount: 0,
            createdAt: '2026-11-26T09:00:00.000Z',
            createdBy: 'admin',
            deactivatedAt: null,
            emailIssue: null,
        });
    });
    it('marks a link past its expiry, and shows none when every link is used or revoked', () => {
        assert.equal(toAdminUserDto(row, emailRule, today, new Date('2026-11-29T09:00:00.000Z')).invite?.expired, true);
        assert.equal(toAdminUserDto({ ...row, invites: [] }, emailRule, today, now).invite, null);
        const reset = { purpose: 'reset', createdAt: new Date('2026-11-26T09:00:00.000Z'), expiresAt: new Date('2026-11-29T09:00:00.000Z') };
        assert.equal(toAdminUserDto({ ...row, invitePending: false, invites: [reset] }, emailRule, today, now).invite?.purpose, 'reset');
    });
    it('shows a lock only while it lasts', () => {
        const lockedUntil = new Date(now.getTime() + 10 * 60_000);
        assert.equal(toAdminUserDto({ ...row, lockedUntil }, emailRule, today, now).lockedUntil, lockedUntil.toISOString());
        assert.equal(toAdminUserDto({ ...row, lockedUntil: new Date(now.getTime() - 1000) }, emailRule, today, now).lockedUntil, null);
    });
    it('never exposes a password hash or the raw reportsToId', () => {
        const dto = toAdminUserDto({ ...row, passwordHash: 'x' } as AdminUserRow, emailRule, today) as unknown as Record<string, unknown>;
        assert.equal('passwordHash' in dto, false);
        assert.equal('reportsToId' in dto, false);
        assert.equal('_count' in dto, false);
    });
    it('flags email issues only for users who hold an address', () => {
        assert.equal(toAdminUserDto({ ...row, email: null }, emailRule, today).emailIssue, 'missing');
        assert.equal(toAdminUserDto({ ...row, email: 'asha@gmail.com' }, emailRule, today).emailIssue, 'not_company');
        assert.equal(toAdminUserDto(row, { ...emailRule, duplicates: new Set(['asha@nandiniinfosys.com']) }, today).emailIssue, 'duplicate');
        assert.equal(toAdminUserDto({ ...row, email: null, isActive: false }, emailRule, today).emailIssue, null);
        assert.equal(toAdminUserDto({ ...row, email: null, isGroupUser: true }, emailRule, today).emailIssue, null);
    });
    it('splits a stale or missing name from fullName and falls back to the manager username', () => {
        const dto = toAdminUserDto({ ...row, firstName: null, lastName: null, reportsTo: { id: 3, fullName: '', username: 'rahul', isActive: true } }, emailRule, today);
        assert.equal(dto.firstName, 'Asha');
        assert.equal(dto.lastName, 'Kapoor');
        assert.deepEqual(dto.reportsTo, { id: 3, name: 'rahul', isActive: true });
        assert.equal(toAdminUserDto({ ...row, reportsTo: null }, emailRule, today).reportsTo, null);
        assert.equal(toAdminUserDto({ ...row, role: 'Super Admin' }, emailRule, today).roleAccess, 'admin');
    });
    it('shows the user’s out-of-office until its last day, then null', () => {
        const preference = {
            outOfOfficeFrom: new Date('2026-12-01T00:00:00.000Z'),
            outOfOfficeTo: new Date('2026-12-05T00:00:00.000Z'),
            outOfOfficeMessage: 'At the Pune office',
        };
        const expected = { from: '2026-12-01', to: '2026-12-05', message: 'At the Pune office' };
        assert.deepEqual(toAdminUserDto({ ...row, preference }, emailRule, today).outOfOffice, expected);
        assert.deepEqual(toAdminUserDto({ ...row, preference }, emailRule, '2026-12-05').outOfOffice, expected);
        assert.equal(toAdminUserDto({ ...row, preference }, emailRule, '2026-12-06').outOfOffice, null);
        assert.equal(toAdminUserDto({ ...row, preference: { outOfOfficeFrom: null, outOfOfficeTo: null, outOfOfficeMessage: null } }, emailRule, today).outOfOffice, null);
    });
});

describe('adminUserAuditSnapshot', () => {
    it('has no key the audit log would redact (so diffs stay readable) and no secret', () => {
        const snapshot = adminUserAuditSnapshot(row);
        for (const key of Object.keys(snapshot)) assert.equal(isSensitiveKey(key), false, key);
        assert.equal(snapshot.invitePending, true);
        assert.equal(snapshot.mobile, '+919811234567');
        assert.equal('passwordHash' in snapshot, false);
    });
});

describe('departments', () => {
    it('groups case-insensitively, keeps the most used spelling and skips blanks', () => {
        assert.deepEqual(
            departmentOptionsFrom([
                { department: 'sales', count: 1 },
                { department: 'Sales', count: 5 },
                { department: null, count: 9 },
                { department: ' ', count: 2 },
                { department: 'Accounts', count: 0 },
            ]),
            [
                { name: 'Accounts', userCount: 0 },
                { name: 'Sales', userCount: 6 },
            ],
        );
    });
    it('snaps a typed department to an existing spelling', () => {
        assert.equal(canonicalDepartment('sales', ['Sales', 'Accounts']), 'Sales');
        assert.equal(canonicalDepartment('Field Service', ['Sales']), 'Field Service');
    });
});

describe('listWhere', () => {
    it('filters status, role, department and searches several columns', () => {
        assert.deepEqual(listWhere({ status: 'all' }), {});
        assert.deepEqual(listWhere({ status: 'inactive' }), { AND: [{ isActive: false }] });
        const where = listWhere({ status: 'active', role: 'Admin', department: 'Sales', search: 'asha' }) as { AND: Record<string, unknown>[] };
        assert.deepEqual(where.AND.slice(0, 3), [{ isActive: true }, { role: 'Admin' }, { department: 'Sales' }]);
        assert.equal((where.AND[3].OR as unknown[]).length, 6);
    });
});
