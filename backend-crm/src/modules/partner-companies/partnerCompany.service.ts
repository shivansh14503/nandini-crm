import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo, nullable } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { normalizeEmails } from '../shared/entityEmails.js';
import { acquireLocks, lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toPartnerCompanyData, toPartnerCompanyDto, type PartnerCompanyDto } from './partnerCompany.mapper.js';
import {
    PARTNER_COMPANY_SORT_FIELDS,
    partnerCompanyInputSchema,
    partnerCompanyListQuerySchema,
} from './partnerCompany.validator.js';

const notFound = () => HttpError.notFound('Partner company not found');

// ── Integrity rules (run inside the write transaction) ───────────────────────

/**
 * Partner names are unique, case-insensitively (SQL Server collation). The column carries a plain unique
 * constraint that also covers soft-deleted rows, so a deleted partner's name stays reserved; that case gets
 * its own message instead of a raw constraint error.
 */
async function assertUniqueName(tx: TransactionClient, companyName: string, excludeId?: string): Promise<void> {
    const name = companyName.trim();
    await acquireLocks(tx, [`partnerCompany:name:${name.toLowerCase()}`]);
    const duplicate = await tx.partnerCompany.findFirst({
        where: { companyName: name, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { isDeleted: true },
    });
    if (!duplicate) return;
    const message = duplicate.isDeleted
        ? `A deleted partner company is still named "${name}". Choose a different name.`
        : `A partner company named "${name}" already exists.`;
    throw HttpError.conflict(message, [{ message, path: ['companyName'] }]);
}

/** Lookup lists (`/api/lookups/partner-companies`, and partner contacts, which carry the company name) and search. */
async function invalidatePartnerCaches(): Promise<void> {
    await Promise.all([
        cacheService.invalidateEntityCaches('partner-companies'),
        cacheService.invalidatePattern(`${CACHE_KEYS.lookups('partner-contacts')}*`),
    ]);
}

// ── Service ──────────────────────────────────────────────────────────────────

export const partnerCompanyService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<PartnerCompanyDto>> {
        const page = parsePagination(query, PARTNER_COMPANY_SORT_FIELDS);
        const filters = partnerCompanyListQuerySchema.parse(query ?? {});

        const where: Prisma.PartnerCompanyWhereInput = { isDeleted: false };
        if (filters.natureOfPartner) where.natureOfPartner = filters.natureOfPartner;
        if (filters.assignedTo) where.assignedTo = filters.assignedTo;
        if (filters.mine) where.assignedTo = user.username;
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (page.search) {
            where.OR = [
                { companyName: { contains: page.search } },
                { natureOfPartner: { contains: page.search } },
                { phone: { contains: page.search } },
                { email: { contains: page.search } },
                { city: { contains: page.search } },
                { principalCompany: { contains: page.search } },
            ];
        }

        const [total, rows] = await prisma.$transaction([
            prisma.partnerCompany.count({ where }),
            prisma.partnerCompany.findMany({ where, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toPartnerCompanyDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string): Promise<PartnerCompanyDto> {
        const row = await prisma.partnerCompany.findFirst({ where: { id, isDeleted: false } });
        if (!row) throw notFound();
        return toPartnerCompanyDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<PartnerCompanyDto> {
        const input = partnerCompanyInputSchema.parse(body);

        const created = await runInTransaction(async (tx) => {
            await assertUniqueName(tx, input.companyName);
            const emails = normalizeEmails(input.emailAddresses);
            const row = await tx.partnerCompany.create({
                data: {
                    ...toPartnerCompanyData(input, emails, nullable(input.assignedTo) ?? user.username),
                    createdBy: user.username,
                },
            });
            const dto = toPartnerCompanyDto(row);
            await auditService.record(tx, { entityType: 'PartnerCompany', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
            return dto;
        });

        await invalidatePartnerCaches();
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<PartnerCompanyDto> {
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'partnerCompany', [id]);
            const existing = await tx.partnerCompany.findFirst({ where: { id, isDeleted: false } });
            if (!existing) throw notFound();

            const before = toPartnerCompanyDto(existing);
            const merged: Record<string, unknown> = { ...before, ...patch };
            // `officePhone` is a read alias; a patch that only sends it still means the phone.
            if ('officePhone' in patch && !('phone' in patch)) merged.phone = patch.officePhone;
            const input = partnerCompanyInputSchema.parse(merged);

            // Strict comparison: a case-only rename is re-checked too (excluding this record).
            if (input.companyName !== existing.companyName) await assertUniqueName(tx, input.companyName, id);

            const row = await tx.partnerCompany.update({
                where: { id },
                data: {
                    ...toPartnerCompanyData(input, normalizeEmails(input.emailAddresses), nullable(input.assignedTo)),
                    updatedBy: user.username,
                },
            });

            const after = toPartnerCompanyDto(row);
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'PartnerCompany', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await invalidatePartnerCaches();
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'partnerCompany', [id]);
            const result = await tx.partnerCompany.updateMany({ where: { id, isDeleted: false }, data: softDeleteData(user) });
            if (result.count === 0) throw notFound();
            await auditService.record(tx, { entityType: 'PartnerCompany', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await invalidatePartnerCaches();
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'partnerCompany', ids);
            const live = await tx.partnerCompany.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.partnerCompany.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'PartnerCompany' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await invalidatePartnerCaches();
        return result;
    },
};
