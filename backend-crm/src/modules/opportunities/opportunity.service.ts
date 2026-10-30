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
import { calculateLineItems, lineItemsInclude, resolveProductIds, toLineItemData } from '../shared/lineItems.js';
import { assertReference } from '../shared/references.js';
import { lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toOpportunityData, toOpportunityDto, type OpportunityDto } from './opportunity.mapper.js';
import {
    OPPORTUNITY_SORT_FIELDS,
    opportunityInputSchema,
    opportunityListQuerySchema,
    type OpportunityInput,
} from './opportunity.validator.js';

const include = { lineItems: lineItemsInclude } as const;

const notFound = () => HttpError.notFound('Opportunity not found');

interface Link {
    id: string | null;
    name: string;
}

/**
 * Resolves the organization and contact links. An explicit id must reference an existing record (whose name
 * then wins); otherwise the typed organization name links to the live organization with that name, and the
 * contact name links to a live contact of that organization.
 */
async function resolveLinks(
    tx: TransactionClient,
    input: OpportunityInput,
    previous?: { organizationId: string | null; contactId: string | null },
): Promise<{ organization: Link; contact: Link }> {
    const orgSelect = { id: true, organizationName: true, isDeleted: true } as const;
    let organization: Link;
    if (input.organizationId) {
        const org = await tx.organization.findUnique({ where: { id: input.organizationId }, select: orgSelect });
        assertReference(org, input.organizationId, previous?.organizationId, 'organization', 'organizationName');
        organization = { id: org.id, name: org.organizationName };
    } else {
        const org = await tx.organization.findFirst({ where: { organizationName: input.organizationName, isDeleted: false }, select: orgSelect });
        organization = org ? { id: org.id, name: org.organizationName } : { id: null, name: input.organizationName };
    }

    const contactSelect = { id: true, name: true, isDeleted: true } as const;
    let contact: Link;
    if (input.contactId) {
        const found = await tx.contact.findUnique({ where: { id: input.contactId }, select: contactSelect });
        assertReference(found, input.contactId, previous?.contactId, 'contact', 'contactName');
        contact = { id: found.id, name: found.name };
    } else if (organization.id) {
        const found = await tx.contact.findFirst({
            where: { name: input.contactName, organizationId: organization.id, isDeleted: false },
            select: contactSelect,
        });
        contact = found ? { id: found.id, name: found.name } : { id: null, name: input.contactName };
    } else {
        // Without an organization a contact name is too ambiguous to link.
        contact = { id: null, name: input.contactName };
    }

    return { organization, contact };
}

async function replaceLineItems(tx: TransactionClient, opportunityId: string, input: OpportunityInput, computed: ReturnType<typeof calculateLineItems>): Promise<void> {
    await tx.opportunityLineItem.deleteMany({ where: { opportunityId } });
    if (computed.items.length === 0) return;
    const knownProducts = await resolveProductIds(tx, input.lineItems);
    await tx.opportunityLineItem.createMany({
        data: computed.items.map((item, index) => ({ ...toLineItemData(item, index, knownProducts), opportunityId })),
    });
}

/**
 * Inserts an opportunity with its line items (totals computed server-side) inside the caller's
 * transaction. Used by `create` and by lead conversion; cache invalidation is the caller's job.
 */
export async function createOpportunityRecord(tx: TransactionClient, input: OpportunityInput, user: AuthUser): Promise<OpportunityDto> {
    // Code first: its counter row lock queues concurrent creates before they take any other lock.
    const opportunityCode = await generateEntityCode(tx, 'OPP');
    const links = await resolveLinks(tx, input);
    const computed = calculateLineItems(input.lineItems, input.lumpSumDiscount);

    const row = await tx.opportunity.create({
        data: { ...toOpportunityData(input, links, computed.totals), opportunityCode, createdBy: user.username },
    });
    await replaceLineItems(tx, row.id, input, computed);

    const dto = toOpportunityDto(await tx.opportunity.findUniqueOrThrow({ where: { id: row.id }, include }));
    await auditService.record(tx, { entityType: 'Opportunity', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: dto });
    return dto;
}

export const opportunityService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<OpportunityDto>> {
        const page = parsePagination(query, OPPORTUNITY_SORT_FIELDS);
        const filters = opportunityListQuerySchema.parse(query ?? {});

        const where: Prisma.OpportunityWhereInput = { isDeleted: false };
        const stageFilter: Prisma.StringFilter = {};
        if (filters.salesStage?.length) stageFilter.in = filters.salesStage;
        if (filters.excludeSalesStage?.length) stageFilter.notIn = filters.excludeSalesStage;
        if (Object.keys(stageFilter).length > 0) where.salesStage = stageFilter;
        if (filters.organizationId) where.organizationId = filters.organizationId;
        if (filters.contactId) where.contactId = filters.contactId;
        if (filters.productId) where.lineItems = { some: { productId: filters.productId } };
        if (filters.assignedTo) where.assignedTo = filters.assignedTo;
        if (filters.mine) where.assignedTo = user.username;
        if (filters.minGrandTotal !== undefined) where.grandTotal = { gte: filters.minGrandTotal };
        if (filters.nextFollowupDate) where.nextFollowupDate = fromDateOnly(filters.nextFollowupDate);
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (page.search) {
            where.OR = [
                { opportunityCode: { contains: page.search } },
                { opportunityName: { contains: page.search } },
                { organizationName: { contains: page.search } },
                { contactName: { contains: page.search } },
                { contactNumber: { contains: page.search } },
                { salesStage: { contains: page.search } },
                { leadSource: { contains: page.search } },
            ];
        }

        const [total, rows] = await prisma.$transaction([
            prisma.opportunity.count({ where }),
            prisma.opportunity.findMany({ where, include, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toOpportunityDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string): Promise<OpportunityDto> {
        const row = await prisma.opportunity.findFirst({ where: { id, isDeleted: false }, include });
        if (!row) throw notFound();
        return toOpportunityDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<OpportunityDto> {
        const input = opportunityInputSchema.parse(body);
        const created = await runInTransaction((tx) => createOpportunityRecord(tx, input, user));
        await cacheService.invalidateEntityCaches('opportunities');
        return created;
    },

    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<OpportunityDto> {
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'opportunity', [id]);
            const existing = await tx.opportunity.findFirst({ where: { id, isDeleted: false }, include });
            if (!existing) throw notFound();

            const before = toOpportunityDto(existing);
            const merged: Record<string, unknown> = { ...before, ...patch };
            // Retyping a name without picking a record means "re-link by name", not "keep the old id".
            if ('organizationName' in patch && !('organizationId' in patch)) delete merged.organizationId;
            if ('contactName' in patch && !('contactId' in patch)) delete merged.contactId;
            const input = opportunityInputSchema.parse(merged);

            const links = await resolveLinks(tx, input, existing);
            const computed = calculateLineItems(input.lineItems, input.lumpSumDiscount);
            await tx.opportunity.update({
                where: { id },
                data: { ...toOpportunityData(input, links, computed.totals), updatedBy: user.username },
            });
            if ('lineItems' in patch) await replaceLineItems(tx, id, input, computed);

            const after = toOpportunityDto(await tx.opportunity.findUniqueOrThrow({ where: { id }, include }));
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Opportunity', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('opportunities');
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'opportunity', [id]);
            const result = await tx.opportunity.updateMany({ where: { id, isDeleted: false }, data: softDeleteData(user) });
            if (result.count === 0) throw notFound();
            await auditService.record(tx, { entityType: 'Opportunity', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await cacheService.invalidateEntityCaches('opportunities');
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'opportunity', ids);
            const live = await tx.opportunity.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.opportunity.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Opportunity' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('opportunities');
        return result;
    },
};
