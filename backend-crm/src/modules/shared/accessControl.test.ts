import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { setSnapshotForTests } from '../roles/roleRegistry.js';
import type { TransactionClient } from '../../config/prisma.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import {
    assertAssigneeValid,
    assertRecordAccess,
    buildAccessScopeWhere,
    canAccessRecord,
    GLOBAL_ACCESS_ROLES,
    hasGlobalAccess,
    assertPermission,
    isAdminUser,
    normalizeAssignee,
} from './accessControl.js';

const user = (role: string, username = 'palak'): AuthUser => ({ id: 1, username, role });

const isForbidden = (err: unknown) => err instanceof HttpError && err.statusCode === 403 && err.code === 'FORBIDDEN';

/** Minimal stand-in for the transaction client: only `user.findFirst` is used. */
function fakeTx(users: { username: string; isActive: boolean }[]) {
    const calls: unknown[] = [];
    const tx = {
        user: {
            async findFirst(args: { where: { username: string; isActive: boolean } }) {
                calls.push(args);
                // SQL Server's default collation compares usernames case-insensitively.
                const match = users.find((u) => u.username.toLowerCase() === args.where.username.toLowerCase() && u.isActive === args.where.isActive);
                return match ? { username: match.username } : null;
            },
        },
    } as unknown as TransactionClient;
    return { tx, calls };
}

describe('hasGlobalAccess', () => {
    it('grants every listed global role', () => {
        for (const role of GLOBAL_ACCESS_ROLES) assert.equal(hasGlobalAccess(user(role), 'leads', 'view'), true, role);
    });

    it('matches role names regardless of case, spacing and dash style', () => {
        assert.equal(hasGlobalAccess(user('Director - Operations'), 'leads', 'view'), true);
        assert.equal(hasGlobalAccess(user('director — operations'), 'leads', 'view'), true);
        assert.equal(hasGlobalAccess(user('  sales   manager '), 'leads', 'view'), true);
    });

    it('scopes every other role', () => {
        for (const role of ['Sales Executive', 'Support Engineer', 'Telesales Executive', 'Area Sales Manager', 'Group – Sales Queue', '']) {
            assert.equal(hasGlobalAccess(user(role), 'leads', 'view'), false, role);
        }
    });
});

describe('buildAccessScopeWhere', () => {
    it('returns an empty filter for global roles', () => {
        assert.deepEqual(buildAccessScopeWhere(user('Admin'), 'assignedTo', 'leads'), {});
    });

    it('limits scoped roles to owned or created records on the given owner column', () => {
        assert.deepEqual(buildAccessScopeWhere(user('Sales Executive'), 'assignedTo', 'leads'), {
            OR: [{ assignedTo: 'palak' }, { createdBy: 'palak' }],
        });
        assert.deepEqual(buildAccessScopeWhere(user('Sales Executive'), 'assignedTo', 'leads'), {
            OR: [{ assignedTo: 'palak' }, { createdBy: 'palak' }],
        });
    });
});

describe('assertRecordAccess', () => {
    const scoped = user('Sales Executive');

    it('lets global roles access any record', () => {
        assert.doesNotThrow(() => assertRecordAccess(user('Accounts Manager'), { assignedTo: 'someone', createdBy: 'else' }, 'contacts'));
    });

    it('lets a scoped user access records they own or created (case-insensitively)', () => {
        assert.doesNotThrow(() => assertRecordAccess(scoped, { assignedTo: 'PALAK', createdBy: 'admin' }, 'contacts'));
        assert.doesNotThrow(() => assertRecordAccess(scoped, { assignedTo: 'palak', createdBy: 'admin' }, 'contacts'));
        assert.doesNotThrow(() => assertRecordAccess(scoped, { assignedTo: 'nupur', createdBy: 'palak' }, 'contacts'));
    });

    it('rejects a scoped user on records they neither own nor created', () => {
        assert.throws(() => assertRecordAccess(scoped, { assignedTo: 'nupur', createdBy: 'admin' }, 'contacts'), isForbidden);
        assert.throws(() => assertRecordAccess(scoped, { assignedTo: null, createdBy: null }, 'contacts'), isForbidden);
        assert.equal(canAccessRecord(scoped, {}, 'contacts'), false);
    });

    it('does not treat a username prefix as a match', () => {
        assert.throws(() => assertRecordAccess(scoped, { assignedTo: 'palak.k', createdBy: 'admin' }, 'contacts'), isForbidden);
    });
});

describe('Admin › Roles permissions', () => {
    afterEach(() => setSnapshotForTests(null));
    const reader = {
        name: 'Reader',
        adminPanel: false,
        permissions: { leads: { view: 'all', create: 'none', edit: 'own', delete: 'none', import: 'all' }, contacts: { view: 'own' } },
    };

    it('applies each action at its own level', () => {
        setSnapshotForTests([reader]);
        const u = user('reader');
        assert.deepEqual(buildAccessScopeWhere(u, 'assignedTo', 'leads', 'view'), {});
        assert.deepEqual(buildAccessScopeWhere(u, 'assignedTo', 'leads', 'edit'), { OR: [{ assignedTo: 'palak' }, { createdBy: 'palak' }] });
        assert.equal(canAccessRecord(u, { assignedTo: 'nupur' }, 'leads', 'view'), true);
        assert.equal(canAccessRecord(u, { assignedTo: 'nupur' }, 'leads', 'edit'), false);
        assert.equal(canAccessRecord(u, { assignedTo: 'palak' }, 'leads', 'edit'), true);
        assert.equal(canAccessRecord(u, { assignedTo: 'palak' }, 'leads', 'delete'), false);
    });

    it('matches nothing and answers a named 403 for None', () => {
        setSnapshotForTests([reader]);
        const u = user('Reader');
        const where = buildAccessScopeWhere(u, 'assignedTo', 'tickets', 'view') as { OR: { assignedTo?: string; createdBy?: string }[] };
        assert.ok(where.OR.every((arm) => (arm.assignedTo ?? arm.createdBy)?.includes('#')));
        assert.throws(
            () => assertRecordAccess(u, { assignedTo: 'palak' }, 'tickets', 'view'),
            (err: unknown) => err instanceof HttpError && err.statusCode === 403 && /Tickets/.test(err.message),
        );
        assert.throws(() => assertPermission(u, 'leads', 'create'), isForbidden);
        assert.doesNotThrow(() => assertPermission(u, 'leads', 'import'));
    });

    it('gives Super Admin full access whatever is stored, and the admin panel from the role', () => {
        setSnapshotForTests([{ name: 'Super Admin', adminPanel: false, permissions: {} }, reader]);
        assert.equal(hasGlobalAccess(user('super admin'), 'tickets', 'delete'), true);
        assert.equal(isAdminUser(user('Super Admin')), true);
        assert.equal(isAdminUser(user('Reader')), false);
    });

    it('treats a role the table lacks as own records without the admin panel', () => {
        setSnapshotForTests([reader]);
        assert.equal(isAdminUser(user('Admin')), false);
        assert.equal(hasGlobalAccess(user('Admin'), 'leads', 'view'), false);
        assert.equal(canAccessRecord(user('Admin'), { assignedTo: 'palak' }, 'leads', 'edit'), true);
    });
});

describe('normalizeAssignee', () => {
    it('strips the picker\'s " (You)" suffix and blanks', () => {
        assert.equal(normalizeAssignee('mittal.sharma (You)'), 'mittal.sharma');
        assert.equal(normalizeAssignee('mittal.sharma (you) '), 'mittal.sharma');
        assert.equal(normalizeAssignee('  '), null);
        assert.equal(normalizeAssignee(null), null);
        assert.equal(normalizeAssignee(' (You)'), null);
    });
});

describe('assertAssigneeValid', () => {
    const users = [
        { username: 'mittal.sharma', isActive: true },
        { username: 'sneha.rawat', isActive: false },
    ];

    it('accepts an active user, stripping " (You)" and returning the stored spelling', async () => {
        const { tx } = fakeTx(users);
        assert.equal(await assertAssigneeValid(tx, 'Mittal.Sharma (You)'), 'mittal.sharma');
    });

    it('returns null for a blank assignee without querying', async () => {
        const { tx, calls } = fakeTx(users);
        assert.equal(await assertAssigneeValid(tx, ''), null);
        assert.equal(calls.length, 0);
    });

    it('rejects unknown and inactive users with a field error on the given path', async () => {
        const { tx } = fakeTx(users);
        await assert.rejects(assertAssigneeValid(tx, 'ghost'), (err: unknown) => {
            assert.ok(err instanceof HttpError);
            assert.equal(err.statusCode, 400);
            assert.deepEqual(err.errors?.[0]?.path, ['assignedTo']);
            return true;
        });
        await assert.rejects(assertAssigneeValid(tx, 'sneha.rawat', { path: 'assignedTo' }), (err: unknown) => {
            assert.ok(err instanceof HttpError);
            assert.deepEqual(err.errors?.[0]?.path, ['assignedTo']);
            return true;
        });
    });

    it('keeps an unchanged assignee even after that user was deactivated', async () => {
        const { tx, calls } = fakeTx(users);
        assert.equal(await assertAssigneeValid(tx, 'sneha.rawat', { previous: 'sneha.rawat' }), 'sneha.rawat');
        assert.equal(calls.length, 0);
    });

    it('uses prefetched active usernames instead of querying', async () => {
        const { tx, calls } = fakeTx(users);
        const activeUsernames = new Set(['mittal.sharma']);
        assert.equal(await assertAssigneeValid(tx, 'mittal.sharma', { activeUsernames }), 'mittal.sharma');
        await assert.rejects(assertAssigneeValid(tx, 'sneha.rawat', { activeUsernames }), HttpError);
        assert.equal(calls.length, 0);
    });
});
