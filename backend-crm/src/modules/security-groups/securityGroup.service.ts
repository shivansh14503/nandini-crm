import { StatusCodes } from 'http-status-codes';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError, type ApiFieldError } from '../../utils/httpError.js';
import { refresh as refreshAccessSnapshot } from '../roles/roleRegistry.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { descendantIds, wouldCreateCycle } from './securityGroup.tree.js';
import type { CreateSecurityGroupInput, SetSecurityGroupMembersInput, UpdateSecurityGroupInput } from './securityGroup.validator.js';

/**
 * Admin › Security Groups (/api/admin/security-groups): teams / branches that a role's "Group" access level reads
 * (roles/permissions.ts, shared/accessControl.ts). Create, rename, move under a parent, archive and delete groups, and
 * set their members. Every write is audited (entity `SecurityGroup`, CONFIG), runs one at a time (so two moves can't
 * build a loop together) and refreshes the in-process access snapshot (roles/roleRegistry.ts), so the change applies to
 * signed-in users at once (other API instances within 15 s).
 */

const LOCK_KEY = 'security-groups';

export interface SecurityGroupMemberDto {
    id: number;
    username: string;
    /** Display name, else the username. */
    name: string;
    role: string;
    isActive: boolean;
}

export interface SecurityGroupDto {
    id: number;
    name: string;
    description: string | null;
    parentId: number | null;
    parentName: string | null;
    /** False = archived: keeps its members, grants nothing. */
    isActive: boolean;
    members: SecurityGroupMemberDto[];
    /** Direct sub-groups. */
    subGroupCount: number;
    createdAt: string;
    createdBy: string | null;
    updatedAt: string;
    updatedBy: string | null;
}

/** A user the member picker offers (active users first, then by name). */
export interface SecurityGroupUserOptionDto extends SecurityGroupMemberDto {
    /** Names of the groups the user is already in. */
    groups: string[];
}

const MEMBER_SELECT = { id: true, username: true, fullName: true, role: true, isActive: true } as const;

const GROUP_INCLUDE = {
    parent: { select: { name: true } },
    members: { select: { user: { select: MEMBER_SELECT } } },
    _count: { select: { children: true } },
} as const;

type MemberRow = { id: number; username: string; fullName: string; role: string; isActive: boolean };
type GroupRow = {
    id: number;
    name: string;
    description: string | null;
    parentId: number | null;
    isActive: boolean;
    createdAt: Date;
    createdBy: string | null;
    updatedAt: Date;
    updatedBy: string | null;
    parent: { name: string } | null;
    members: { user: MemberRow }[];
    _count: { children: number };
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

const toMember = (u: MemberRow): SecurityGroupMemberDto => ({
    id: u.id,
    username: u.username,
    name: u.fullName.trim() || u.username,
    role: u.role,
    isActive: u.isActive,
});

function toDto(row: GroupRow): SecurityGroupDto {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        parentId: row.parentId,
        parentName: row.parent?.name ?? null,
        isActive: row.isActive,
        members: row.members.map((m) => toMember(m.user)).sort(byName),
        subGroupCount: row._count.children,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
    };
}

const fieldError = (message: string, status: number, code: string, path?: string) =>
    new HttpError(message, status, { code, ...(path ? { errors: [{ message, path: [path] }] satisfies ApiFieldError[] } : {}) });

const notFound = () => HttpError.notFound('Security group not found.');

/** 409 DUPLICATE_RECORD when another group has the same name (any case). */
async function assertNameFree(tx: TransactionClient, name: string, excludeId: number | null): Promise<void> {
    const rows = await tx.securityGroup.findMany({ select: { id: true, name: true } });
    const key = name.trim().toLowerCase();
    if (rows.some((r) => r.id !== excludeId && r.name.trim().toLowerCase() === key)) {
        throw fieldError(`A group named "${name}" already exists.`, StatusCodes.CONFLICT, 'DUPLICATE_RECORD', 'name');
    }
}

/** 400 when the parent doesn't exist or would make a loop; returns its name (null for no parent). */
async function checkParent(tx: TransactionClient, id: number | null, parentId: number | null): Promise<string | null> {
    if (parentId === null) return null;
    const groups = await tx.securityGroup.findMany({ select: { id: true, parentId: true, isActive: true, name: true } });
    const parent = groups.find((g) => g.id === parentId);
    if (!parent) throw fieldError('The parent group no longer exists.', StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR', 'parentId');
    if (id !== null && wouldCreateCycle(groups, id, parentId)) {
        throw fieldError('A group cannot sit under itself or one of its own sub-groups.', StatusCodes.BAD_REQUEST, 'GROUP_CYCLE', 'parentId');
    }
    return parent.name;
}

/** The users behind `ids`; 400 when any doesn't exist. */
async function usersOf(tx: TransactionClient, ids: readonly number[]): Promise<MemberRow[]> {
    if (ids.length === 0) return [];
    const rows = await tx.user.findMany({ where: { id: { in: [...ids] } }, select: MEMBER_SELECT });
    if (rows.length !== ids.length) throw fieldError('Some of the selected users no longer exist.', StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR', 'memberIds');
    return rows;
}

/** Audit snapshot of a group's settings. */
const snapshot = (g: { name: string; description: string | null; parentName: string | null; isActive: boolean }) => ({
    name: g.name,
    description: g.description,
    parentGroup: g.parentName,
    isActive: g.isActive,
});

function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
    const out: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) out[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
    return out;
}

const audit = (tx: TransactionClient, actor: AuthUser, id: number, action: 'CREATE' | 'UPDATE' | 'DELETE', changes: unknown) =>
    auditService.record(tx, { entityType: 'SecurityGroup', entityId: String(id), action, changedBy: actor.username, changes });

const usernames = (rows: readonly { username: string }[]) => rows.map((r) => r.username).sort((a, b) => a.localeCompare(b));

export const securityGroupService = {
    /** Every group, by name, with its members. */
    async list(): Promise<SecurityGroupDto[]> {
        const rows = await prisma.securityGroup.findMany({ include: GROUP_INCLUDE });
        return rows.map(toDto).sort(byName);
    },

    async get(id: number): Promise<SecurityGroupDto> {
        const row = await prisma.securityGroup.findUnique({ where: { id }, include: GROUP_INCLUDE });
        if (!row) throw notFound();
        return toDto(row);
    },

    /** Users the member picker offers, with the groups each is already in. */
    async userOptions(): Promise<SecurityGroupUserOptionDto[]> {
        const rows = await prisma.user.findMany({
            select: { ...MEMBER_SELECT, securityGroups: { select: { group: { select: { name: true } } } } },
        });
        return rows
            .map((u) => ({ ...toMember(u), groups: u.securityGroups.map((m) => m.group.name).sort((a, b) => a.localeCompare(b)) }))
            .sort((a, b) => Number(b.isActive) - Number(a.isActive) || byName(a, b));
    },

    /** 409 DUPLICATE_RECORD (name) · 400 (parent / members). */
    async create(actor: AuthUser, input: CreateSecurityGroupInput): Promise<SecurityGroupDto> {
        const id = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [LOCK_KEY]);
            await assertNameFree(tx, input.name, null);
            const parentId = input.parentId ?? null;
            const parentName = await checkParent(tx, null, parentId);
            const members = await usersOf(tx, input.memberIds ?? []);
            const created = await tx.securityGroup.create({
                data: {
                    name: input.name,
                    description: input.description ?? null,
                    parentId,
                    createdBy: actor.username,
                    updatedBy: actor.username,
                    members: { create: members.map((u) => ({ userId: u.id, addedBy: actor.username })) },
                },
            });
            await audit(tx, actor, created.id, 'CREATE', {
                ...snapshot({ name: created.name, description: created.description, parentName, isActive: true }),
                members: usernames(members),
            });
            return created.id;
        });
        await refreshAccessSnapshot();
        return this.get(id);
    },

    /** Rename, describe, move under another parent (400 GROUP_CYCLE), archive / restore. 409 DUPLICATE_RECORD · 404. */
    async update(actor: AuthUser, id: number, input: UpdateSecurityGroupInput): Promise<SecurityGroupDto> {
        await runInTransaction(async (tx) => {
            await acquireLocks(tx, [LOCK_KEY]);
            const before = await tx.securityGroup.findUnique({ where: { id }, include: { parent: { select: { name: true } } } });
            if (!before) throw notFound();
            const name = input.name ?? before.name;
            if (name !== before.name) await assertNameFree(tx, name, id);
            const parentId = input.parentId !== undefined ? input.parentId : before.parentId;
            const parentName = parentId === before.parentId ? (before.parent?.name ?? null) : await checkParent(tx, id, parentId);
            const description = input.description !== undefined ? input.description : before.description;
            const isActive = input.isActive ?? before.isActive;

            const changes = diff(
                snapshot({ name: before.name, description: before.description, parentName: before.parent?.name ?? null, isActive: before.isActive }),
                snapshot({ name, description, parentName, isActive }),
            );
            if (Object.keys(changes).length === 0) return;
            await tx.securityGroup.update({ where: { id }, data: { name, description, parentId, isActive, updatedBy: actor.username } });
            await audit(tx, actor, id, 'UPDATE', changes);
        });
        await refreshAccessSnapshot();
        return this.get(id);
    },

    /** Replaces the member list; audited as `membersAdded` / `membersRemoved`. 400 (unknown user) · 404. */
    async setMembers(actor: AuthUser, id: number, input: SetSecurityGroupMembersInput): Promise<SecurityGroupDto> {
        await runInTransaction(async (tx) => {
            await acquireLocks(tx, [LOCK_KEY]);
            const group = await tx.securityGroup.findUnique({ where: { id }, select: { id: true, members: { select: { user: { select: MEMBER_SELECT } } } } });
            if (!group) throw notFound();
            const next = await usersOf(tx, input.memberIds);
            const current = group.members.map((m) => m.user);
            const nextIds = new Set(next.map((u) => u.id));
            const currentIds = new Set(current.map((u) => u.id));
            const added = next.filter((u) => !currentIds.has(u.id));
            const removed = current.filter((u) => !nextIds.has(u.id));
            if (added.length === 0 && removed.length === 0) return;
            if (removed.length) await tx.securityGroupMember.deleteMany({ where: { groupId: id, userId: { in: removed.map((u) => u.id) } } });
            if (added.length) await tx.securityGroupMember.createMany({ data: added.map((u) => ({ groupId: id, userId: u.id, addedBy: actor.username })) });
            await tx.securityGroup.update({ where: { id }, data: { updatedBy: actor.username } });
            await audit(tx, actor, id, 'UPDATE', {
                ...(added.length ? { membersAdded: usernames(added) } : {}),
                ...(removed.length ? { membersRemoved: usernames(removed) } : {}),
            });
        });
        await refreshAccessSnapshot();
        return this.get(id);
    },

    /** Deletes the group and its memberships. 400 HAS_SUB_GROUPS while groups sit under it · 404. */
    async remove(actor: AuthUser, id: number): Promise<{ id: number }> {
        await runInTransaction(async (tx) => {
            await acquireLocks(tx, [LOCK_KEY]);
            const group = await tx.securityGroup.findUnique({
                where: { id },
                include: { parent: { select: { name: true } }, members: { select: { user: { select: { username: true } } } } },
            });
            if (!group) throw notFound();
            const all = await tx.securityGroup.findMany({ select: { id: true, parentId: true, isActive: true } });
            const subGroups = descendantIds(all, id).length;
            if (subGroups > 0) {
                throw fieldError(
                    `${subGroups} ${subGroups === 1 ? 'group sits' : 'groups sit'} under this one. Move or delete ${subGroups === 1 ? 'it' : 'them'} first.`,
                    StatusCodes.BAD_REQUEST,
                    'HAS_SUB_GROUPS',
                );
            }
            await tx.securityGroup.delete({ where: { id } });
            await audit(tx, actor, id, 'DELETE', {
                ...snapshot({ name: group.name, description: group.description, parentName: group.parent?.name ?? null, isActive: group.isActive }),
                members: usernames(group.members.map((m) => m.user)),
            });
        });
        await refreshAccessSnapshot();
        return { id };
    },
};
