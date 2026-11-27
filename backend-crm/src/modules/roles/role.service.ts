import { StatusCodes } from 'http-status-codes';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError, type ApiFieldError } from '../../utils/httpError.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { invalidateUserCaches } from '../users/userEmail.service.js';
import {
    accessSummary,
    describeModulePermissions,
    FULL_PERMISSIONS,
    normalizePermissions,
    PERMISSION_MODULES,
    type RoleAccessSummary,
    type RolePermissions,
} from './permissions.js';
import { isSuperAdminRole, normalizeRole } from './roleDefaults.js';
import type { CreateRoleInput, DeleteRoleInput, UpdateRoleInput } from './role.validator.js';

/**
 * Admin › Roles (/api/admin/roles): create, edit, rename and delete roles, each with an "Admin panel" switch and
 * per-module permissions (permissions.ts). `Users.role` holds the role's name: a rename renames it on its users, a
 * delete moves its users to another role, both in the same transaction. Super Admin is locked (full access).
 * Every write is audited (entity `Role`), serializes with Admin › Users on the admin-roster lock, and refreshes the
 * in-process role snapshot so the change applies to signed-in users at once (other API instances within 15 s).
 */

/** Shared with Admin › Users: changes that can take admin access from someone run one at a time. */
export const ADMIN_ROSTER_LOCK = 'user-admin:admins';

export interface RoleDto {
    id: number;
    name: string;
    description: string | null;
    adminPanel: boolean;
    /** Super Admin: can't be edited, renamed or deleted. */
    isSystem: boolean;
    permissions: RolePermissions;
    /** One-word summary for the list: admin panel, every record, own records, or a mix. */
    access: RoleAccessSummary;
    userCount: number;
    inactiveUserCount: number;
    createdAt: string;
    createdBy: string | null;
    updatedAt: string;
    updatedBy: string | null;
}

type RoleRow = {
    id: number;
    name: string;
    description: string | null;
    adminPanel: boolean;
    isSystem: boolean;
    permissionsJson: string;
    createdAt: Date;
    createdBy: string | null;
    updatedAt: Date;
    updatedBy: string | null;
};

const parse = (json: string): unknown => {
    try {
        return JSON.parse(json);
    } catch {
        return {};
    }
};

function permissionsOf(row: Pick<RoleRow, 'name' | 'permissionsJson'>): RolePermissions {
    return isSuperAdminRole(row.name) ? FULL_PERMISSIONS : normalizePermissions(parse(row.permissionsJson));
}

function toDto(row: RoleRow, counts: { active: number; inactive: number }): RoleDto {
    const permissions = permissionsOf(row);
    const adminPanel = row.adminPanel || isSuperAdminRole(row.name);
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        adminPanel,
        isSystem: row.isSystem || isSuperAdminRole(row.name),
        permissions,
        access: accessSummary(adminPanel, permissions),
        userCount: counts.active,
        inactiveUserCount: counts.inactive,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
    };
}

const fieldError = (message: string, status: number, code: string, path?: string) =>
    new HttpError(message, status, { code, ...(path ? { errors: [{ message, path: [path] }] satisfies ApiFieldError[] } : {}) });

const roleNotFound = () => HttpError.notFound('Role not found.');
const systemRole = () => fieldError('Super Admin always has full access and cannot be changed.', StatusCodes.BAD_REQUEST, 'SYSTEM_ROLE');

/** Users per role key (`normalizeRole`), split by active / inactive. */
async function countsByRole(client: TransactionClient | typeof prisma): Promise<Map<string, { active: number; inactive: number }>> {
    const groups = await client.user.groupBy({ by: ['role', 'isActive'], _count: { _all: true } });
    const out = new Map<string, { active: number; inactive: number }>();
    for (const g of groups) {
        const key = normalizeRole(g.role);
        const entry = out.get(key) ?? { active: 0, inactive: 0 };
        if (g.isActive) entry.active += g._count._all;
        else entry.inactive += g._count._all;
        out.set(key, entry);
    }
    return out;
}

const NO_USERS = { active: 0, inactive: 0 };

/** 409 DUPLICATE_RECORD when another role has the same name (any case, any dash style). */
async function assertNameFree(tx: TransactionClient, name: string, excludeId: number | null): Promise<void> {
    const key = normalizeRole(name);
    const rows = await tx.role.findMany({ select: { id: true, name: true } });
    if (rows.some((r) => r.id !== excludeId && normalizeRole(r.name) === key)) {
        throw fieldError(`A role named "${name}" already exists.`, StatusCodes.CONFLICT, 'DUPLICATE_RECORD', 'name');
    }
}

/** Users holding the role (matched by `normalizeRole`, as access is). */
async function holdersOf(tx: TransactionClient, roleName: string): Promise<{ id: number; isActive: boolean }[]> {
    const key = normalizeRole(roleName);
    const users = await tx.user.findMany({ select: { id: true, role: true, isActive: true } });
    return users.filter((u) => normalizeRole(u.role) === key).map(({ id, isActive }) => ({ id, isActive }));
}

/**
 * 400 SELF_LOCKOUT / LAST_ADMIN when, after the change, the actor or everybody would lose the admin panel.
 * `adminAfter(roleKey)` tells whether a role key opens the admin panel after the change; `roleAfter(user)` the role
 * key a user holds after it.
 */
async function assertAdminsKept(
    tx: TransactionClient,
    actor: AuthUser,
    adminAfter: (roleKey: string) => boolean,
    roleAfter: (user: { id: number; role: string }) => string,
): Promise<void> {
    const users = await tx.user.findMany({ where: { isActive: true }, select: { id: true, role: true } });
    const me = users.find((u) => u.id === actor.id);
    if (me && !adminAfter(roleAfter(me))) {
        throw fieldError('This would remove your own admin access. Ask another admin to do it.', StatusCodes.BAD_REQUEST, 'SELF_LOCKOUT', 'adminPanel');
    }
    if (!users.some((u) => adminAfter(roleAfter(u)))) {
        throw fieldError('No active user would be left with admin panel access.', StatusCodes.BAD_REQUEST, 'LAST_ADMIN', 'adminPanel');
    }
}

async function roleAdminMap(tx: TransactionClient): Promise<Map<string, boolean>> {
    const rows = await tx.role.findMany({ select: { name: true, adminPanel: true } });
    return new Map(rows.map((r) => [normalizeRole(r.name), r.adminPanel || isSuperAdminRole(r.name)]));
}

/** Audit snapshot: name, description, admin panel and one readable line per module. */
function snapshot(row: { name: string; description: string | null; adminPanel: boolean; permissions: RolePermissions }): Record<string, unknown> {
    const out: Record<string, unknown> = { name: row.name, description: row.description, adminPanel: row.adminPanel };
    for (const m of PERMISSION_MODULES) out[`permissions.${m.key}`] = describeModulePermissions(m, row.permissions[m.key]);
    return out;
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
    const out: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) out[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
    return out;
}

const audit = (tx: TransactionClient, actor: AuthUser, id: number, action: 'CREATE' | 'UPDATE' | 'DELETE', changes: unknown) =>
    auditService.record(tx, { entityType: 'Role', entityId: String(id), action, changedBy: actor.username, changes });

/** After a write: the user lookups (they show role names) and the role snapshot every access check reads. */
async function afterWrite(): Promise<void> {
    await invalidateUserCaches();
}

export const roleService = {
    async list(): Promise<RoleDto[]> {
        const [rows, counts] = await Promise.all([prisma.role.findMany(), countsByRole(prisma)]);
        return rows
            .map((row) => toDto(row, counts.get(normalizeRole(row.name)) ?? NO_USERS))
            .sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    },

    async get(id: number): Promise<RoleDto> {
        const row = await prisma.role.findUnique({ where: { id } });
        if (!row) throw roleNotFound();
        const counts = await countsByRole(prisma);
        return toDto(row, counts.get(normalizeRole(row.name)) ?? NO_USERS);
    },

    /** 409 DUPLICATE_RECORD (name). A new role has no users, so it can't lock anybody out. */
    async create(actor: AuthUser, input: CreateRoleInput): Promise<RoleDto> {
        const permissions = normalizePermissions(input.permissions);
        const row = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [ADMIN_ROSTER_LOCK]);
            await assertNameFree(tx, input.name, null);
            if (isSuperAdminRole(input.name)) throw fieldError('Super Admin is a built-in role.', StatusCodes.CONFLICT, 'DUPLICATE_RECORD', 'name');
            const created = await tx.role.create({
                data: {
                    name: input.name,
                    description: input.description ?? null,
                    adminPanel: input.adminPanel ?? false,
                    permissionsJson: JSON.stringify(permissions),
                    createdBy: actor.username,
                    updatedBy: actor.username,
                },
            });
            await audit(tx, actor, created.id, 'CREATE', snapshot({ ...created, permissions }));
            return created;
        });
        await afterWrite();
        return toDto(row, NO_USERS);
    },

    /**
     * Saves the role. A rename renames it on its users. Turning "Admin panel" off: 400 SELF_LOCKOUT when the actor holds
     * the role, 400 LAST_ADMIN when no active user would keep the admin panel. 400 SYSTEM_ROLE for Super Admin.
     */
    async update(actor: AuthUser, id: number, input: UpdateRoleInput): Promise<RoleDto> {
        const row = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [ADMIN_ROSTER_LOCK]);
            const before = await tx.role.findUnique({ where: { id } });
            if (!before) throw roleNotFound();
            if (before.isSystem || isSuperAdminRole(before.name)) throw systemRole();

            const name = input.name ?? before.name;
            if (name !== before.name) {
                await assertNameFree(tx, name, id);
                if (isSuperAdminRole(name)) throw fieldError('Super Admin is a built-in role.', StatusCodes.CONFLICT, 'DUPLICATE_RECORD', 'name');
            }
            const beforePermissions = permissionsOf(before);
            const permissions = input.permissions ? normalizePermissions(input.permissions) : beforePermissions;
            const adminPanel = input.adminPanel ?? before.adminPanel;
            const description = input.description !== undefined ? input.description : before.description;

            if (before.adminPanel && !adminPanel) {
                const admins = await roleAdminMap(tx);
                const key = normalizeRole(before.name);
                admins.set(key, false);
                await assertAdminsKept(tx, actor, (k) => admins.get(k) ?? false, (u) => normalizeRole(u.role));
            }

            const changes = diff(snapshot({ ...before, permissions: beforePermissions }), snapshot({ name, description, adminPanel, permissions }));
            if (Object.keys(changes).length === 0) return before;

            const updated = await tx.role.update({
                where: { id },
                data: { name, description, adminPanel, permissionsJson: JSON.stringify(permissions), updatedBy: actor.username },
            });
            if (name !== before.name) {
                const holders = await holdersOf(tx, before.name);
                if (holders.length) await tx.user.updateMany({ where: { id: { in: holders.map((h) => h.id) } }, data: { role: name } });
            }
            await audit(tx, actor, id, 'UPDATE', changes);
            return updated;
        });
        await afterWrite();
        return this.get(row.id);
    },

    /**
     * Deletes the role, moving its users (active and inactive) to `reassignTo`. 400 ROLE_IN_USE when it has users and no
     * `reassignTo`; 400 SELF_LOCKOUT / LAST_ADMIN when the move takes admin access from the actor / everybody; 403
     * SUPER_ADMIN_ONLY when a non-Super Admin moves users to Super Admin; 400 SYSTEM_ROLE for Super Admin.
     */
    async remove(actor: AuthUser, id: number, input: DeleteRoleInput): Promise<{ id: number; movedUsers: number }> {
        const moved = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [ADMIN_ROSTER_LOCK]);
            const role = await tx.role.findUnique({ where: { id } });
            if (!role) throw roleNotFound();
            if (role.isSystem || isSuperAdminRole(role.name)) throw systemRole();
            const holders = await holdersOf(tx, role.name);

            let target: { id: number; name: string } | null = null;
            if (holders.length) {
                if (!input.reassignTo) {
                    const n = holders.length;
                    throw fieldError(
                        `${n} ${n === 1 ? 'user has' : 'users have'} this role. Pick the role to move ${n === 1 ? 'them' : 'them'} to.`,
                        StatusCodes.BAD_REQUEST,
                        'ROLE_IN_USE',
                        'reassignTo',
                    );
                }
                if (input.reassignTo === id) throw fieldError('Pick a different role.', StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR', 'reassignTo');
                target = await tx.role.findUnique({ where: { id: input.reassignTo }, select: { id: true, name: true } });
                if (!target) throw fieldError('The role to move users to no longer exists.', StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR', 'reassignTo');
                if (isSuperAdminRole(target.name) && !isSuperAdminRole(actor.role)) {
                    throw fieldError('Only a Super Admin can give users the Super Admin role.', StatusCodes.FORBIDDEN, 'SUPER_ADMIN_ONLY', 'reassignTo');
                }
                const admins = await roleAdminMap(tx);
                const fromKey = normalizeRole(role.name);
                const toKey = normalizeRole(target.name);
                if (admins.get(fromKey) && !admins.get(toKey)) {
                    await assertAdminsKept(
                        tx,
                        actor,
                        (k) => admins.get(k) ?? false,
                        (u) => (normalizeRole(u.role) === fromKey ? toKey : normalizeRole(u.role)),
                    );
                }
                await tx.user.updateMany({ where: { id: { in: holders.map((h) => h.id) } }, data: { role: target.name } });
            }
            await tx.role.delete({ where: { id } });
            await audit(tx, actor, id, 'DELETE', {
                ...snapshot({ ...role, permissions: permissionsOf(role) }),
                ...(target ? { reassignedTo: target.name, movedUsers: holders.length } : {}),
            });
            return holders.length;
        });
        await afterWrite();
        return { id, movedUsers: moved };
    },
};
