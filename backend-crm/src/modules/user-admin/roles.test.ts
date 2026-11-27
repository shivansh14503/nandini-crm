import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { FULL_PERMISSIONS, OWN_RECORDS_PERMISSIONS, normalizePermissions } from '../roles/permissions.js';
import { setSnapshotForTests } from '../roles/roleRegistry.js';
import { canonicalRoleName, hasGlobalAccessRole, isAdminAccessRole, normalizeRole, roleAccess, roleOptionsFrom } from './roles.js';

describe('role access classification (before the roles table loads: the old name rules)', () => {
    it('admin panel roles first, then global access, else own records', () => {
        assert.equal(roleAccess('Admin'), 'admin');
        assert.equal(roleAccess('super admin'), 'admin');
        assert.equal(roleAccess('ADMINISTRATOR'), 'admin');
        assert.equal(roleAccess('Sales Manager'), 'all-records');
        assert.equal(roleAccess('Director - Operations'), 'all-records');
        assert.equal(roleAccess('Sales Executive'), 'own-records');
        assert.equal(roleAccess(''), 'own-records');
        assert.equal(isAdminAccessRole(null), false);
        // Administrator opens the admin panel but sees only its own records; Super Admin (the developer) sees everything.
        assert.equal(hasGlobalAccessRole('Administrator'), false);
        assert.equal(hasGlobalAccessRole('Super Admin'), true);
    });

    it('normalizeRole folds case, dashes and spaces', () => {
        assert.equal(normalizeRole(' Director  –  Operations '), 'director - operations');
        assert.equal(normalizeRole('Director - Operations'), normalizeRole('Director – Operations'));
        assert.equal(normalizeRole('Director − Operations'), normalizeRole('director ‒ operations'));
    });
});

describe('role access classification (from Admin › Roles)', () => {
    afterEach(() => setSnapshotForTests(null));

    it('reads the admin panel switch and the permissions of the saved role', () => {
        setSnapshotForTests([
            { name: 'Admin', adminPanel: false, permissions: OWN_RECORDS_PERMISSIONS },
            { name: 'Field Engineer', adminPanel: true, permissions: FULL_PERMISSIONS },
            { name: 'Viewer', adminPanel: false, permissions: { leads: { view: 'all' } } },
        ]);
        assert.equal(roleAccess('Admin'), 'own-records');
        assert.equal(roleAccess('field engineer'), 'admin');
        assert.equal(roleAccess('Viewer'), 'custom');
        assert.equal(isAdminAccessRole('Admin'), false);
        assert.equal(isAdminAccessRole('Field  Engineer'), true);
        assert.equal(hasGlobalAccessRole('Field Engineer'), true);
    });
});

describe('roleOptionsFrom', () => {
    const roles = [
        { id: 1, name: 'Sales Executive', adminPanel: false, permissions: OWN_RECORDS_PERMISSIONS },
        { id: 2, name: 'Director – Operations', adminPanel: false, permissions: FULL_PERMISSIONS },
        { id: 3, name: 'Admin', adminPanel: true, permissions: FULL_PERMISSIONS },
        { id: 4, name: 'Super Admin', adminPanel: true, permissions: FULL_PERMISSIONS },
        { id: 5, name: 'Intern', adminPanel: false, permissions: normalizePermissions({}) },
    ];

    it('lists every role with its users, matched by normalizeRole, Super Admin first', () => {
        const options = roleOptionsFrom(roles, [
            { role: 'Sales Executive', count: 7 },
            { role: 'sales executive', count: 2 },
            { role: 'Director - Operations', count: 1 },
            { role: 'Admin', count: 1 },
            { role: 'Intern', count: 0, inactiveCount: 2 },
        ]);
        const byName = Object.fromEntries(options.map((o) => [o.name, o]));
        assert.equal(options[0].name, 'Super Admin');
        assert.equal(byName['Sales Executive']?.userCount, 9);
        assert.equal(byName['Sales Executive']?.access, 'own-records');
        assert.equal(byName['Director – Operations']?.userCount, 1);
        assert.equal(byName['Director – Operations']?.access, 'all-records');
        assert.deepEqual(byName.Admin, { id: 3, name: 'Admin', access: 'admin', adminPanel: true, allRecords: true, userCount: 1, inactiveUserCount: 0 });
        assert.equal(byName.Intern?.inactiveUserCount, 2);
        assert.equal(byName.Intern?.access, 'custom');
        assert.equal(options.length, roles.length);
    });
});

describe('canonicalRoleName', () => {
    const known = ['Sales Executive', 'Director – Operations', 'Admin'];
    it('snaps to an existing spelling', () => {
        assert.equal(canonicalRoleName('sales executive', known), 'Sales Executive');
        assert.equal(canonicalRoleName('  Director - Operations ', known), 'Director – Operations');
        assert.equal(canonicalRoleName('ADMIN', known), 'Admin');
    });
    it('answers null for a role Admin › Roles does not have', () => {
        assert.equal(canonicalRoleName('  Field   Engineer ', known), null);
    });
});
