import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    accessSummary,
    describeModulePermissions,
    FULL_PERMISSIONS,
    levelLabel,
    levelsFor,
    normalizePermissions,
    OWN_RECORDS_PERMISSIONS,
    PERMISSION_MODULE_BY_KEY,
    PERMISSION_MODULES,
    uniformPermissions,
} from './permissions.js';
import { legacyRole } from './roleDefaults.js';
import { rolesToSeed } from './roleSeed.js';

describe('normalizePermissions', () => {
    it('fills every module and action, unknown values as None', () => {
        const p = normalizePermissions({ leads: { view: 'all', edit: 'bogus' }, nope: { view: 'all' } });
        for (const m of PERMISSION_MODULES) assert.deepEqual(Object.keys(p[m.key]).sort(), [...m.actions].sort(), m.key);
        assert.equal(p.leads.view, 'all');
        assert.equal(p.leads.edit, 'none');
        assert.equal(p.contacts.view, 'none');
        assert.equal((p as Record<string, unknown>).nope, undefined);
    });

    it('keeps Edit / Delete within View and clears a module that cannot be viewed', () => {
        const p = normalizePermissions({
            leads: { view: 'own', edit: 'all', delete: 'all', create: 'all' },
            contacts: { view: 'none', create: 'all', edit: 'all', import: 'all' },
        });
        assert.equal(p.leads.edit, 'own');
        assert.equal(p.leads.delete, 'own');
        assert.equal(p.leads.create, 'all');
        assert.deepEqual(p.contacts, { view: 'none', create: 'none', edit: 'none', delete: 'none', import: 'none' });
    });

    it('turns Own into All where the action has no Own level', () => {
        const p = normalizePermissions({ products: { view: 'own', edit: 'own' }, leads: { view: 'all', create: 'own' } });
        assert.equal(p.products.view, 'all');
        assert.equal(p.products.edit, 'all');
        assert.equal(p.leads.create, 'all');
        assert.deepEqual(levelsFor(PERMISSION_MODULE_BY_KEY.products, 'view'), ['all', 'none']);
        assert.deepEqual(levelsFor(PERMISSION_MODULE_BY_KEY.leads, 'create'), ['all', 'none']);
        assert.deepEqual(levelsFor(PERMISSION_MODULE_BY_KEY.leads, 'edit'), ['all', 'group', 'own', 'none']);
    });

    it('offers Group on owned modules only, keeps it within View, and turns it into All where it is not offered', () => {
        const p = normalizePermissions({
            leads: { view: 'group', edit: 'all', delete: 'own' },
            contacts: { view: 'own', edit: 'group' },
            products: { view: 'group', edit: 'group' },
        });
        assert.equal(p.leads.view, 'group');
        assert.equal(p.leads.edit, 'group');
        assert.equal(p.leads.delete, 'own');
        assert.equal(p.contacts.edit, 'own');
        assert.equal(p.products.view, 'all');
        assert.equal(p.products.edit, 'all');
        assert.equal(uniformPermissions('group').leads.view, 'group');
        assert.equal(uniformPermissions('group').partnerCompanies.view, 'all');
        assert.equal(levelLabel('view', 'group'), 'Group');
    });
});

describe('legacy roles (what each role name gave before Admin › Roles)', () => {
    it('keeps the old access', () => {
        assert.deepEqual(legacyRole('Admin'), { name: 'Admin', adminPanel: true, superAdmin: false, permissions: FULL_PERMISSIONS });
        assert.equal(legacyRole('Administrator').adminPanel, true);
        assert.deepEqual(legacyRole('Administrator').permissions, OWN_RECORDS_PERMISSIONS);
        assert.deepEqual(legacyRole('Director - Operations').permissions, FULL_PERMISSIONS);
        assert.equal(legacyRole('super admin').superAdmin, true);
        const rep = legacyRole('Sales Executive');
        assert.equal(rep.adminPanel, false);
        assert.equal(rep.permissions.leads.view, 'own');
        assert.equal(rep.permissions.leads.create, 'all');
        assert.equal(rep.permissions.referrals.view, 'all');
        assert.equal(rep.permissions.referrals.edit, 'own');
        assert.equal(rep.permissions.products.edit, 'all');
        assert.equal(accessSummary(false, rep.permissions), 'own-records');
        assert.equal(accessSummary(false, FULL_PERMISSIONS), 'all-records');
        assert.equal(accessSummary(true, rep.permissions), 'admin');
    });
});

describe('rolesToSeed', () => {
    it('seeds the old roles and every held role into an empty table, once each', () => {
        const rows = rolesToSeed([], ['Sales Executive', 'sales executive', 'Director - Operations', '  ']);
        const names = rows.map((r) => r.name);
        assert.equal(names[0], 'Super Admin');
        assert.ok(names.includes('Admin'));
        assert.ok(names.includes('Sales Manager'));
        assert.ok(names.includes('Sales Executive'));
        assert.equal(names.filter((n) => n.toLowerCase() === 'sales executive').length, 1);
        // The held hyphen spelling is the seeded en-dash role, not a second one.
        assert.equal(names.filter((n) => n.toLowerCase().startsWith('director')).length, 1);
        assert.equal(rows.find((r) => r.name === 'Super Admin')?.isSystem, true);
        assert.equal(rows.find((r) => r.name === 'Admin')?.adminPanel, true);
    });

    it('afterwards adds only Super Admin and held roles no row matches (a deleted role is not brought back)', () => {
        const rows = rolesToSeed(['Super Admin', 'Admin', 'Sales Executive'], ['admin', 'Sales Executive', 'Typed In SQL']);
        assert.deepEqual(
            rows.map((r) => r.name),
            ['Typed In SQL'],
        );
        assert.equal(JSON.parse(rows[0].permissionsJson).leads.view, 'own');
    });
});

describe('describeModulePermissions', () => {
    it('reads as the editor shows it', () => {
        assert.equal(
            describeModulePermissions(PERMISSION_MODULE_BY_KEY.leads, OWN_RECORDS_PERMISSIONS.leads),
            'View: Own · Create: Yes · Edit: Own · Delete: Own · Import: Yes',
        );
        assert.equal(describeModulePermissions(PERMISSION_MODULE_BY_KEY.products, FULL_PERMISSIONS.products), 'View: All · Create: Yes · Edit: All · Delete: All · Import: Yes');
    });
});
