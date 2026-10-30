import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { generateEntityCode } from '../../utils/codeGenerator.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { emailsInclude, normalizeEmails, replaceEmails } from '../shared/entityEmails.js';
import { acquireLocks, lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toContactData, toContactDto, type ContactDto } from './contact.mapper.js';
import { CONTACT_SORT_FIELDS, contactInputSchema, contactListQuerySchema, type ContactInput } from './contact.validator.js';

const include = { emailAddresses: emailsInclude } as const;

const notFound = () => HttpError.notFound('Contact not found');

// ── Integrity rules (run inside the write transaction) ───────────────────────

/** A mobile number identifies one live contact (lead conversion relies on this to find existing contacts). */
async function assertUniqueMobile(tx: TransactionClient, mobile: string, excludeId?: string): Promise<void> {
    await acquireLocks(tx, [`contact:mobile:${mobile}`]);
    const duplicate = await tx.contact.findFirst({
        where: { mobile, isDeleted: false, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { contactCode: true, name: true },
    });
    if (duplicate) {
        throw HttpError.conflict(`A contact with mobile ${mobile} already exists (${duplicate.contactCode} · ${duplicate.name}).`);
    }
}

/**
 * An explicit `organizationId` must point at a live organization, whose name then wins. Otherwise the typed
 * organization name is linked to the live organization with that exact name, if there is one.
 */
async function resolveOrganization(tx: TransactionClient, input: ContactInput): Promise<{ id: string | null; name: string }> {
    if (input.organizationId) {
        const org = await tx.organization.findFirst({
            where: { id: input.organizationId, isDeleted: false },
            select: { id: true, organizationName: true },
        });
        if (!org) {
            throw HttpError.badRequest('The selected organization no longer exists.', [
                { message: 'Select an existing organization.', path: ['organizationName'] },
            ]);
        }
        return { id: org.id, name: org.organizationName };
    }
    const byName = await tx.organization.findFirst({
        where: { organizationName: input.organizationName, isDeleted: false },
        select: { id: true, organizationName: true },
    });
    return byName ? { id: byName.id, name: byName.organizationName } : { id: null, name: input.organizationName };
}

/** Keeps one primary contact per organization: promoting this contact demotes the others (audited). */
async function demoteOtherPrimaries(tx: TransactionClient, contactId: string, organizationId: string | null, actor: AuthUser): Promise<void> {
    if (!organizationId) return;
    await acquireLocks(tx, [`contact:primary:${organizationId}`]);
    const others = await tx.contact.findMany({
        where: { organizationId, isPrimaryContact: true, isDeleted: false, NOT: { id: contactId } },
        select: { id: true },
    });
    if (others.length === 0) return;

    await tx.contact.updateMany({
        where: { id: { in: others.map((row) => row.id) } },
        data: { isPrimaryContact: false, updatedBy: actor.username },
    });
    await auditService.recordMany(
        tx,
        others.map((row) => ({
            entityType: 'Contact' as const,
            entityId: row.id,
            action: 'UPDATE' as const,
            changedBy: actor.username,
            changes: { isPrimaryContact: { from: true, to: false }, reason: `Primary contact changed to ${contactId}` },
        })),
    );
}

/**
 * Inserts a contact (code, mobile uniqueness, organization link, emails, primary rule, audit) inside the
 * caller's transaction. Used by `create` and by lead conversion; cache invalidation is the caller's job.
 */
export async function createContactRecord(tx: TransactionClient, input: ContactInput, user: AuthUser): Promise<ContactDto> {
    // Code first: its counter row lock queues concurrent creates before they take any other lock.
    const contactCode = await generateEntityCode(tx, 'CON');
    await assertUniqueMobile(tx, input.mobile);
    const organization = await resolveOrganization(tx, input);
    const row = await tx.contact.create({
        data: { ...toContactData(input, organization), contactCode, createdBy: user.username },
    });
    await replaceEmails(tx, { contactId: row.id }, normalizeEmails(input.emailAddresses));
    if (input.isPrimaryContact) await demoteOtherPrimaries(tx, row.id, organization.id, user);

    const dto = toContactDto(await tx.contact.findUniqueOrThrow({ where: { id: row.id }, include }));
    await auditService.record(tx, { entityType: 'Contact', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
    return dto;
}

/** Live contact by id, or else by mobile number, for "find or create" flows. */
export async function findLiveContact(tx: TransactionClient, mobile: string, id?: string) {
    if (id) {
        const byId = await tx.contact.findFirst({ where: { id, isDeleted: false }, include });
        if (byId) return byId;
    }
    return mobile ? tx.contact.findFirst({ where: { mobile, isDeleted: false }, include }) : null;
}

// ── Service ──────────────────────────────────────────────────────────────────

export const contactService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<ContactDto>> {
        const page = parsePagination(query, CONTACT_SORT_FIELDS);
        const filters = contactListQuerySchema.parse(query ?? {});

        const where: Prisma.ContactWhereInput = { isDeleted: false };
        if (filters.organizationId) where.organizationId = filters.organizationId;
        if (filters.assignedTo) where.assignedTo = filters.assignedTo;
        if (filters.mine) where.assignedTo = user.username;
        if (filters.isPrimaryContact !== undefined) where.isPrimaryContact = filters.isPrimaryContact;
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (page.search) {
            where.OR = [
                { name: { contains: page.search } },
                { contactCode: { contains: page.search } },
                { organizationName: { contains: page.search } },
                { mobile: { contains: page.search } },
                { officePhone: { contains: page.search } },
                { designation: { contains: page.search } },
                { emailAddresses: { some: { email: { contains: page.search } } } },
            ];
        }

        const [total, rows] = await prisma.$transaction([
            prisma.contact.count({ where }),
            prisma.contact.findMany({ where, include, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toContactDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string): Promise<ContactDto> {
        const row = await prisma.contact.findFirst({ where: { id, isDeleted: false }, include });
        if (!row) throw notFound();
        return toContactDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<ContactDto> {
        const input = contactInputSchema.parse(body);

        const created = await runInTransaction((tx) => createContactRecord(tx, input, user));
        await cacheService.invalidateEntityCaches('contacts');
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<ContactDto> {
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'contact', [id]);
            const existing = await tx.contact.findFirst({ where: { id, isDeleted: false }, include });
            if (!existing) throw notFound();

            const before = toContactDto(existing);
            const merged: Record<string, unknown> = { ...before, ...patch };
            // Retyping the organization name without picking a record means "re-link by name", not "keep the old id".
            if ('organizationName' in patch && !('organizationId' in patch)) delete merged.organizationId;
            const input = contactInputSchema.parse(merged);

            if (input.mobile !== existing.mobile) await assertUniqueMobile(tx, input.mobile, id);
            const organization = await resolveOrganization(tx, input);

            await tx.contact.update({ where: { id }, data: { ...toContactData(input, organization), updatedBy: user.username } });
            if ('emailAddresses' in patch) {
                await replaceEmails(tx, { contactId: id }, normalizeEmails(input.emailAddresses));
            }
            if (input.isPrimaryContact) await demoteOtherPrimaries(tx, id, organization.id, user);

            const after = toContactDto(await tx.contact.findUniqueOrThrow({ where: { id }, include }));
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Contact', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('contacts');
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'contact', [id]);
            const result = await tx.contact.updateMany({ where: { id, isDeleted: false }, data: softDeleteData(user) });
            if (result.count === 0) throw notFound();
            await auditService.record(tx, { entityType: 'Contact', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await cacheService.invalidateEntityCaches('contacts');
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'contact', ids);
            const live = await tx.contact.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.contact.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Contact' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('contacts');
        return result;
    },
};
