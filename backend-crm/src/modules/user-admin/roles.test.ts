import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasGlobalAccess } from '../shared/accessControl.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { canonicalRoleName, hasGlobalAccessRole, isAdminAccessRole, normalizeRole, roleAccess, roleOptionsFrom } from './roles.js';

describe('role access classification', () => {
    it('admin panel roles first, then global access, else own records', () => {
        assert.equal(roleAccess('Admin'), 'admin');
        assert.equal(roleAccess('super admin'), 'admin');
        assert.equal(roleAccess('ADMINISTRATOR'), 'admin');
        assert.equal(roleAccess('Sales Manager'), 'all-records');
        assert.equal(roleAccess('Director - Operations'), 'all-records');
        assert.equal(roleAccess('Sales Executive'), 'own-records');
        assert.equal(roleAccess(''), 'own-records');
    });

    it('admin matches exactly as requireRole does (case-insensitive only)', () => {
        for (const role of FORM_CONFIG_ADMIN_ROLES) assert.equal(isAdminAccessRole(role.toUpperCase()), true, role);
        assert.equal(isAdminAccessRole('Super  Admin'), false);
        assert.equal(isAdminAccessRole(' Admin'), false);
        assert.equal(isAdminAccessRole(null), false);
    });

    it('"sees all records" is the same test as hasGlobalAccess', () => {
        const roles = ['Admin', 'Administrator', 'Super Admin', 'Sales Manager', 'sales  manager', 'Director – Operations', 'Director - Operations', 'DIRECTOR — OPERATIONS', 'Sales Executive', ''];
        for (const role of roles) assert.equal(hasGlobalAccessRole(role), hasGlobalAccess({ role }), role);
        // Administrator and Super Admin open the admin panel but see only their own records today.
        assert.equal(hasGlobalAccessRole('Administrator'), false);
    });

    it('normalizeRole folds case, dashes and spaces', () => {
        assert.equal(normalizeRole(' Director  –  Operations '), 'director - operations');
        assert.equal(normalizeRole('Director - Operations'), normalizeRole('Director – Operations'));
        assert.equal(normalizeRole('Director − Operations'), normalizeRole('director ‒ operations'));
    });
});

describe('roleOptionsFrom', () => {
    it('groups stored roles case-insensitively, keeps the most used spelling and adds unused access roles', () => {
        const options = roleOptionsFrom([
            { role: 'Sales Executive', count: 7 },
            { role: 'sales executive', count: 2 },
            { role: 'Director - Operations', count: 1 },
            { role: 'Admin', count: 1 },
            { role: 'Intern', count: 0, inactiveCount: 2 },
            { role: '  ', count: 3 },
        ]);
        const byName = Object.fromEntries(options.map((o) => [o.name, o]));
        assert.equal(byName['Sales Executive']?.userCount, 9);
        assert.equal(byName['sales executive'], undefined);
        // The stored hyphen spelling stands for the seeded en-dash role; it isn't listed twice.
        assert.equal(byName['Director - Operations']?.access, 'all-records');
        assert.equal(byName['Director – Operations'], undefined);
        assert.deepEqual(byName['Super Admin'], { name: 'Super Admin', access: 'admin', adminPanel: true, allRecords: false, userCount: 0, inactiveUserCount: 0 });
        assert.deepEqual(byName.Admin, { name: 'Admin', access: 'admin', adminPanel: true, allRecords: true, userCount: 1, inactiveUserCount: 0 });
        // Held only by deactivated users: still listed, so the Inactive / All lists can be filtered by it.
        assert.equal(byName.Intern?.userCount, 0);
        assert.equal(byName.Intern?.inactiveUserCount, 2);
        assert.equal(byName['Sales Manager']?.userCount, 0);
        assert.deepEqual(
            options.map((o) => o.name),
            [...options.map((o) => o.name)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
        );
    });
});

describe('canonicalRoleName', () => {
    const known = ['Sales Executive', 'Director – Operations', 'Admin'];
    it('snaps to an existing spelling', () => {
        assert.equal(canonicalRoleName('sales executive', known), 'Sales Executive');
        assert.equal(canonicalRoleName('  Director - Operations ', known), 'Director – Operations');
        assert.equal(canonicalRoleName('ADMIN', known), 'Admin');
    });
    it('keeps a new role as typed, tidied', () => {
        assert.equal(canonicalRoleName('  Field   Engineer ', known), 'Field Engineer');
    });
});
