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
    mustChangePassword: true,
    lastLoginAt: null,
    passwordChangedAt: new Date('2026-11-01T10:00:00.000Z'),
    createdAt: new Date('2026-11-26T09:00:00.000Z'),
    createdBy: 'admin',
    deactivatedAt: null,
    photo: { id: 'p-1' },
    reportsTo: { id: 3, fullName: 'Rahul Mehta', username: 'rahul', isActive: false },
    _count: { directReports: 4 },
};
const emailRule = { duplicates: new Set<string>(), companyDomains: ['nandiniinfosys.com'] };

describe('toAdminUserDto', () => {
    it('maps every field, with role access, the manager and ISO dates', () => {
        assert.deepEqual(toAdminUserDto(row, emailRule), {
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
            mustChangePassword: true,
            lastLoginAt: null,
            passwordChangedAt: '2026-11-01T10:00:00.000Z',
            createdAt: '2026-11-26T09:00:00.000Z',
            createdBy: 'admin',
            deactivatedAt: null,
            emailIssue: null,
        });
    });
    it('never exposes a password hash or the raw reportsToId', () => {
        const dto = toAdminUserDto({ ...row, passwordHash: 'x' } as AdminUserRow, emailRule) as unknown as Record<string, unknown>;
        assert.equal('passwordHash' in dto, false);
        assert.equal('reportsToId' in dto, false);
        assert.equal('_count' in dto, false);
    });
    it('flags email issues only for users who hold an address', () => {
        assert.equal(toAdminUserDto({ ...row, email: null }, emailRule).emailIssue, 'missing');
        assert.equal(toAdminUserDto({ ...row, email: 'asha@gmail.com' }, emailRule).emailIssue, 'not_company');
        assert.equal(toAdminUserDto(row, { ...emailRule, duplicates: new Set(['asha@nandiniinfosys.com']) }).emailIssue, 'duplicate');
        assert.equal(toAdminUserDto({ ...row, email: null, isActive: false }, emailRule).emailIssue, null);
        assert.equal(toAdminUserDto({ ...row, email: null, isGroupUser: true }, emailRule).emailIssue, null);
    });
    it('splits a stale or missing name from fullName and falls back to the manager username', () => {
        const dto = toAdminUserDto({ ...row, firstName: null, lastName: null, reportsTo: { id: 3, fullName: '', username: 'rahul', isActive: true } }, emailRule);
        assert.equal(dto.firstName, 'Asha');
        assert.equal(dto.lastName, 'Kapoor');
        assert.deepEqual(dto.reportsTo, { id: 3, name: 'rahul', isActive: true });
        assert.equal(toAdminUserDto({ ...row, reportsTo: null }, emailRule).reportsTo, null);
        assert.equal(toAdminUserDto({ ...row, role: 'Super Admin' }, emailRule).roleAccess, 'admin');
    });
});

describe('adminUserAuditSnapshot', () => {
    it('has no key the audit log would redact (so diffs stay readable) and no secret', () => {
        const snapshot = adminUserAuditSnapshot(row);
        for (const key of Object.keys(snapshot)) assert.equal(isSensitiveKey(key), false, key);
        assert.equal(snapshot.passwordChangeRequired, true);
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
