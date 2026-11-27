import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adminGuardIssue, fullNameLengthIssue, losesAdminAccess, managerIssue, MAX_MANAGER_DEPTH, superAdminOnly } from './userAdmin.rules.js';

describe('managerIssue (reports-to cycles)', () => {
    // 2 → 1, 3 → 2, 4 → 3 ; 5 reports to nobody.
    const chain = new Map<number, number | null>([
        [1, null],
        [2, 1],
        [3, 2],
        [4, 3],
        [5, null],
    ]);
    it('refuses the user themselves', () => assert.equal(managerIssue(3, 3, chain), 'self'));
    it('refuses someone below the user (directly or not)', () => {
        assert.equal(managerIssue(2, 3, chain), 'cycle');
        assert.equal(managerIssue(1, 4, chain), 'cycle');
    });
    it('allows someone above or beside', () => {
        assert.equal(managerIssue(4, 1, chain), null);
        assert.equal(managerIssue(5, 4, chain), null);
        assert.equal(managerIssue(1, 5, chain), null);
    });
    it('a new user (null) can report to anyone', () => assert.equal(managerIssue(null, 4, chain), null));
    it('stops on an existing loop and on chains deeper than the limit', () => {
        const looped = new Map<number, number | null>([
            [1, 2],
            [2, 1],
        ]);
        assert.equal(managerIssue(9, 1, looped), 'cycle');
        const deep = new Map<number, number | null>(Array.from({ length: MAX_MANAGER_DEPTH + 5 }, (_, i) => [i + 1, i + 2] as [number, number]));
        assert.equal(managerIssue(1000, 1, deep), 'cycle');
        const shallow = new Map<number, number | null>(Array.from({ length: MAX_MANAGER_DEPTH - 1 }, (_, i) => [i + 1, i + 2 < MAX_MANAGER_DEPTH ? i + 2 : null] as [number, number | null]));
        assert.equal(managerIssue(1000, 1, shallow), null);
    });
});

describe('adminGuardIssue', () => {
    const admin = { id: 2, role: 'Admin', isActive: true };
    it('lets admins change anyone while another admin remains', () => {
        assert.equal(adminGuardIssue({ actorId: 1, target: admin, next: { role: 'Sales Manager', isActive: true }, activeAdminCount: 2 }), null);
        assert.equal(adminGuardIssue({ actorId: 1, target: admin, next: { role: 'Admin', isActive: false }, activeAdminCount: 2 }), null);
    });
    it('refuses removing your own admin access', () => {
        assert.equal(adminGuardIssue({ actorId: 2, target: admin, next: { role: 'Sales Manager', isActive: true }, activeAdminCount: 5 }), 'SELF_LOCKOUT');
        assert.equal(adminGuardIssue({ actorId: 2, target: admin, next: { role: 'Admin', isActive: false }, activeAdminCount: 5 }), 'SELF_LOCKOUT');
    });
    it('refuses taking it from the last active admin', () => {
        assert.equal(adminGuardIssue({ actorId: 1, target: admin, next: { role: 'Sales Executive', isActive: true }, activeAdminCount: 1 }), 'LAST_ADMIN');
    });
    it('ignores changes that keep admin access or never had it', () => {
        assert.equal(adminGuardIssue({ actorId: 2, target: admin, next: { role: 'super admin', isActive: true }, activeAdminCount: 1 }), null);
        assert.equal(adminGuardIssue({ actorId: 1, target: { id: 3, role: 'Sales Executive', isActive: true }, next: { role: 'Field', isActive: false }, activeAdminCount: 1 }), null);
        assert.equal(losesAdminAccess({ role: 'Admin', isActive: false }, { role: 'Sales', isActive: false }), false);
    });
});

describe('fullNameLengthIssue', () => {
    it('matches My Profile', () => {
        assert.equal(fullNameLengthIssue('a'.repeat(100)), null);
        assert.equal(fullNameLengthIssue('a'.repeat(101)), 'First and last name together cannot exceed 99 characters.');
    });
});

describe('superAdminOnly', () => {
    it('lets a Super Admin manage anyone, including Super Admins', () => {
        assert.equal(superAdminOnly('Super Admin', 'Super Admin', null), false);
        assert.equal(superAdminOnly('super admin', null, 'Super Admin'), false);
        assert.equal(superAdminOnly('Super Admin', 'Sales Executive', 'Admin'), false);
    });
    it('stops other admins from creating, promoting to, demoting or editing a Super Admin', () => {
        assert.equal(superAdminOnly('Admin', null, 'Super Admin'), true);
        assert.equal(superAdminOnly('Admin', 'Sales Executive', 'super  admin'), true);
        assert.equal(superAdminOnly('Administrator', 'Super Admin', 'Admin'), true);
        assert.equal(superAdminOnly('Admin', 'Super Admin', null), true);
    });
    it('leaves every other change to any admin', () => {
        assert.equal(superAdminOnly('Admin', 'Sales Executive', 'Sales Manager'), false);
        assert.equal(superAdminOnly('Administrator', null, 'Admin'), false);
    });
});
