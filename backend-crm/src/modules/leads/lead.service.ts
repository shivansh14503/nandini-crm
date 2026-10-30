import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { PaginatedResult } from '../../utils/apiResponse.js';
import { generateEntityCode } from '../../utils/codeGenerator.js';
import { HttpError } from '../../utils/httpError.js';
import { daysAgo, fromDateOnly } from '../../utils/mappers.js';
import { parsePagination } from '../../utils/pagination.js';
import { emailsInclude, normalizeEmails, replaceEmails } from '../shared/entityEmails.js';
import { lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toLeadData, toLeadDto, type LeadDto } from './lead.mapper.js';
import { CONVERTED_STATUS, LEAD_SORT_FIELDS, leadInputSchema, leadListQuerySchema, type LeadInput } from './lead.validator.js';

export const leadInclude = { emailAddresses: emailsInclude } as const;

export const leadNotFound = () => HttpError.notFound('Lead not found');

/** `Converted` is only ever set by POST /api/leads/:id/convert, and a converted lead stays converted. */
export function assertStatusTransition(fromStatus: string | null, toStatus: string): void {
    if (fromStatus === CONVERTED_STATUS && toStatus !== CONVERTED_STATUS) {
        throw HttpError.badRequest('A converted lead cannot change status.', [
            { message: 'This lead has already been converted.', path: ['status'] },
        ]);
    }
    if (fromStatus !== CONVERTED_STATUS && toStatus === CONVERTED_STATUS) {
        throw HttpError.badRequest('Use the Convert action to convert a lead.', [
            { message: 'Leads are converted with the Convert action.', path: ['status'] },
        ]);
    }
}

async function loadLead(tx: TransactionClient | typeof prisma, id: string) {
    const row = await tx.lead.findFirst({ where: { id, isDeleted: false }, include: leadInclude });
    if (!row) throw leadNotFound();
    return row;
}

/** Inserts a lead inside the caller's transaction (used by `create`, import and the seed). */
export async function createLeadRecord(tx: TransactionClient, input: LeadInput, user: AuthUser): Promise<LeadDto> {
    const leadCode = await generateEntityCode(tx, 'LD');
    const row = await tx.lead.create({ data: { ...toLeadData(input), leadCode, createdBy: user.username } });
    await replaceEmails(tx, { leadId: row.id }, normalizeEmails(input.emailAddresses));

    const dto = toLeadDto(await loadLead(tx, row.id));
    await auditService.record(tx, { entityType: 'Lead', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
    return dto;
}

export const leadService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<LeadDto>> {
        const page = parsePagination(query, LEAD_SORT_FIELDS);
        const filters = leadListQuerySchema.parse(query ?? {});

        const where: Prisma.LeadWhereInput = { isDeleted: false };
        const statusFilter: Prisma.StringFilter = {};
        if (filters.status?.length) statusFilter.in = filters.status;
        if (filters.excludeStatus?.length) statusFilter.notIn = filters.excludeStatus;
        if (Object.keys(statusFilter).length > 0) where.status = statusFilter;
        if (filters.leadType?.length) where.leadType = { in: filters.leadType };
        if (filters.leadSource?.length) where.leadSource = { in: filters.leadSource };
        if (filters.assignedTo) where.assignedTo = filters.assignedTo;
        if (filters.organizationName) where.organizationName = filters.organizationName;
        if (filters.mine) where.assignedTo = user.username;
        if (filters.nextFollowupDate) where.nextFollowupDate = fromDateOnly(filters.nextFollowupDate);
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (page.search) {
            where.OR = [
                { leadCode: { contains: page.search } },
                { name: { contains: page.search } },
                { mobile: { contains: page.search } },
                { otherPhone: { contains: page.search } },
                { organizationName: { contains: page.search } },
                { emailAddresses: { some: { email: { contains: page.search } } } },
            ];
        }

        const [total, rows] = await prisma.$transaction([
            prisma.lead.count({ where }),
            prisma.lead.findMany({ where, include: leadInclude, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toLeadDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string): Promise<LeadDto> {
        return toLeadDto(await loadLead(prisma, id));
    },

    async create(body: unknown, user: AuthUser): Promise<LeadDto> {
        const input = leadInputSchema.parse(body);
        assertStatusTransition(null, input.status);

        const created = await runInTransaction((tx) => createLeadRecord(tx, input, user));
        await cacheService.invalidateEntityCaches('leads');
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<LeadDto> {
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'lead', [id]);
            const existing = await loadLead(tx, id);
            const before = toLeadDto(existing);
            const input = leadInputSchema.parse({ ...before, ...patch });
            assertStatusTransition(existing.status, input.status);

            await tx.lead.update({ where: { id }, data: { ...toLeadData(input), updatedBy: user.username } });
            if ('emailAddresses' in patch) {
                await replaceEmails(tx, { leadId: id }, normalizeEmails(input.emailAddresses));
            }

            const after = toLeadDto(await loadLead(tx, id));
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Lead', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('leads');
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'lead', [id]);
            const result = await tx.lead.updateMany({ where: { id, isDeleted: false }, data: softDeleteData(user) });
            if (result.count === 0) throw leadNotFound();
            await auditService.record(tx, { entityType: 'Lead', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await cacheService.invalidateEntityCaches('leads');
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'lead', ids);
            const live = await tx.lead.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.lead.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Lead' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('leads');
        return result;
    },
};
