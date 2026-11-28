import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { setSnapshotForTests } from '../roles/roleRegistry.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { assertOrganizationEditable, INACTIVE_ORGANIZATION_LOCKED_MESSAGE } from './organization.lock.js';

const user = (role: string): AuthUser => ({ id: 1, username: 'palak', role });
const isLocked = (err: unknown) =>
    err instanceof HttpError && err.statusCode === 403 && err.code === 'FORBIDDEN' && err.message === INACTIVE_ORGANIZATION_LOCKED_MESSAGE;

describe('inactive organization lock', () => {
    afterEach(() => setSnapshotForTests(null));
    const edit = { organizations: { view: 'all', create: 'all', edit: 'all', delete: 'all', import: 'all' } };

    it('blocks a role without the admin panel from editing an inactive organization', () => {
        setSnapshotForTests([{ name: 'Sales', adminPanel: false, permissions: edit }]);
        assert.throws(() => assertOrganizationEditable(user('Sales'), { accountStatus: 'Inactive' }), isLocked);
    });

    it('lets that role edit an active organization (including setting it to Inactive)', () => {
        setSnapshotForTests([{ name: 'Sales', adminPanel: false, permissions: edit }]);
        assert.doesNotThrow(() => assertOrganizationEditable(user('Sales'), { accountStatus: 'Active' }));
    });

    it('follows the Admin › Roles switch: a custom role with the admin panel may edit (and reactivate) it', () => {
        setSnapshotForTests([{ name: 'Office Manager', adminPanel: true, permissions: edit }]);
        assert.doesNotThrow(() => assertOrganizationEditable(user('office manager'), { accountStatus: 'Inactive' }));
    });

    it('always lets Super Admin edit an inactive organization', () => {
        setSnapshotForTests([{ name: 'Super Admin', adminPanel: false, permissions: {} }]);
        assert.doesNotThrow(() => assertOrganizationEditable(user('Super Admin'), { accountStatus: 'Inactive' }));
    });
});
