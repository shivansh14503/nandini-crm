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
import { CLOSED_SALES_STAGES, QUOTE_SALES_STAGE } from '../opportunities/opportunity.validator.js';
import { assertTotalsMatch, calculateLineItems, lineItemsInclude, resolveProductIds, toLineItemData } from '../shared/lineItems.js';
import { assertReference } from '../shared/references.js';
import { lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toQuotationData, toQuotationDto, type QuotationDto, type QuotationLinks } from './quotation.mapper.js';
import {
    QUOTATION_ALIAS_PAIRS,
    QUOTATION_SORT_FIELDS,
    quotationInputSchema,
    quotationListQuerySchema,
    type QuotationInput,
} from './quotation.validator.js';

const include = { lineItems: lineItemsInclude, opportunity: { select: { opportunityCode: true } } } as const;

const notFound = () => HttpError.notFound('Quotation not found');

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * Validates the opportunity / organization / contact references. A quotation is an issued document, so the
 * names typed on it are kept as a snapshot; only the ids are checked.
 */
async function resolveLinks(tx: TransactionClient, input: QuotationInput, previous?: QuotationLinks): Promise<QuotationLinks> {
    const links: QuotationLinks = { opportunityId: null, organizationId: null, contactId: null };
    if (input.opportunityId) {
        const opportunity = await tx.opportunity.findUnique({ where: { id: input.opportunityId }, select: { id: true, isDeleted: true } });
        assertReference(opportunity, input.opportunityId, previous?.opportunityId, 'opportunity', 'opportunityName');
        links.opportunityId = opportunity.id;
    }
    if (input.organizationId) {
        const organization = await tx.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, isDeleted: true } });
        assertReference(organization, input.organizationId, previous?.organizationId, 'organization', 'organizationName');
        links.organizationId = organization.id;
    }
    if (input.contactId) {
        const contact = await tx.contact.findUnique({ where: { id: input.contactId }, select: { id: true, isDeleted: true } });
        assertReference(contact, input.contactId, previous?.contactId, 'contact', 'contactName');
        links.contactId = contact.id;
    }
    return links;
}

async function replaceLineItems(tx: TransactionClient, quotationId: string, input: QuotationInput, computed: ReturnType<typeof calculateLineItems>): Promise<void> {
    await tx.quotationLineItem.deleteMany({ where: { quotationId } });
    const knownProducts = await resolveProductIds(tx, input.lineItems);
    await tx.quotationLineItem.createMany({
        data: computed.items.map((item, index) => ({ ...toLineItemData(item, index, knownProducts), quotationId })),
    });
}

/** Port of `createQuotationFromOpportunity`: quoting moves an open opportunity to "Proposal/Price Quote". */
async function advanceOpportunityStage(tx: TransactionClient, opportunityId: string, user: AuthUser): Promise<boolean> {
    // Same lock as an opportunity edit, so a concurrent edit can't write back a stale stage.
    await lockRecords(tx, 'opportunity', [opportunityId]);
    const opportunity = await tx.opportunity.findUnique({ where: { id: opportunityId }, select: { salesStage: true, isDeleted: true } });
    if (!opportunity || opportunity.isDeleted) return false;
    const terminal: readonly string[] = [...CLOSED_SALES_STAGES, QUOTE_SALES_STAGE];
    if (terminal.includes(opportunity.salesStage)) return false;

    await tx.opportunity.update({ where: { id: opportunityId }, data: { salesStage: QUOTE_SALES_STAGE, updatedBy: user.username } });
    await auditService.record(tx, {
        entityType: 'Opportunity',
        entityId: opportunityId,
        action: 'UPDATE',
        changedBy: user.username,
        changes: { salesStage: { from: opportunity.salesStage, to: QUOTE_SALES_STAGE }, reason: 'Quotation created' },
    });
    return true;
}

/** Merges a partial update; alias pairs follow whichever side the patch changed. */
function mergePatch(before: QuotationDto, patch: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...before, ...patch };
    for (const [canonical, alias] of QUOTATION_ALIAS_PAIRS) {
        if (alias in patch && !(canonical in patch)) merged[canonical] = patch[alias];
        if (canonical in patch && !(alias in patch)) merged[alias] = patch[canonical];
    }
    return merged;
}

/**
 * Inserts a quotation (totals computed server-side) inside the caller's transaction and advances
 * the linked opportunity's stage. `create` verifies client totals first; the seed uses this directly.
 * Returns the DTO and whether the opportunity stage changed (for cache invalidation).
 */
export async function createQuotationRecord(
    tx: TransactionClient,
    input: QuotationInput,
    user: AuthUser,
): Promise<{ quotation: QuotationDto; opportunityAdvanced: boolean }> {
    // Code first: its counter row lock queues concurrent creates before they take any other lock.
    const quotationCode = await generateEntityCode(tx, 'QT');
    const computed = calculateLineItems(input.lineItems, input.lumpSumDiscount);
    const links = await resolveLinks(tx, input);
    const row = await tx.quotation.create({
        data: { ...toQuotationData(input, links, computed.totals), quotationCode, createdBy: user.username },
    });
    await replaceLineItems(tx, row.id, input, computed);
    const opportunityAdvanced = links.opportunityId ? await advanceOpportunityStage(tx, links.opportunityId, user) : false;

    const quotation = toQuotationDto(await tx.quotation.findUniqueOrThrow({ where: { id: row.id }, include }));
    await auditService.record(tx, { entityType: 'Quotation', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: quotation });
    return { quotation, opportunityAdvanced };
}

export const quotationService = {
    async list(query: unknown, user: AuthUser): Promise<PaginatedResult<QuotationDto>> {
        const page = parsePagination(query, QUOTATION_SORT_FIELDS);
        const filters = quotationListQuerySchema.parse(query ?? {});

        const where: Prisma.QuotationWhereInput = { isDeleted: false };
        if (filters.status?.length) where.status = { in: filters.status };
        if (filters.quoteStage?.length) where.quoteStage = { in: filters.quoteStage };
        if (filters.opportunityId) where.opportunityId = filters.opportunityId;
        if (filters.organizationId) where.organizationId = filters.organizationId;
        if (filters.contactId) where.contactId = filters.contactId;
        if (filters.productId) where.lineItems = { some: { productId: filters.productId } };
        if (filters.assignedTo) where.assignedTo = filters.assignedTo;
        if (filters.mine) where.assignedTo = user.username;
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (page.search) {
            where.OR = [
                { quotationCode: { contains: page.search } },
                { quotationTitle: { contains: page.search } },
                { organizationName: { contains: page.search } },
                { contactName: { contains: page.search } },
                { opportunityName: { contains: page.search } },
            ];
        }

        const [total, rows] = await prisma.$transaction([
            prisma.quotation.count({ where }),
            prisma.quotation.findMany({ where, include, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toQuotationDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string): Promise<QuotationDto> {
        const row = await prisma.quotation.findFirst({ where: { id, isDeleted: false }, include });
        if (!row) throw notFound();
        return toQuotationDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<QuotationDto> {
        const input = quotationInputSchema.parse(body);
        assertTotalsMatch(asRecord(body), calculateLineItems(input.lineItems, input.lumpSumDiscount).totals);

        const { quotation, opportunityAdvanced } = await runInTransaction((tx) => createQuotationRecord(tx, input, user));
        await Promise.all([
            cacheService.invalidateEntityCaches('quotations'),
            ...(opportunityAdvanced ? [cacheService.invalidateEntityCaches('opportunities')] : []),
        ]);
        return quotation;
    },

    /** Partial update; totals sent in the patch must match the (possibly new) line items. */
    async update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<QuotationDto> {
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'quotation', [id]);
            const existing = await tx.quotation.findFirst({ where: { id, isDeleted: false }, include });
            if (!existing) throw notFound();

            const before = toQuotationDto(existing);
            const input = quotationInputSchema.parse(mergePatch(before, patch));
            const computed = calculateLineItems(input.lineItems, input.lumpSumDiscount);
            assertTotalsMatch(patch, computed.totals);

            const links = await resolveLinks(tx, input, existing);
            await tx.quotation.update({ where: { id }, data: { ...toQuotationData(input, links, computed.totals), updatedBy: user.username } });
            if ('lineItems' in patch) await replaceLineItems(tx, id, input, computed);

            const after = toQuotationDto(await tx.quotation.findUniqueOrThrow({ where: { id }, include }));
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Quotation', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('quotations');
        return updated;
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'quotation', [id]);
            const result = await tx.quotation.updateMany({ where: { id, isDeleted: false }, data: softDeleteData(user) });
            if (result.count === 0) throw notFound();
            await auditService.record(tx, { entityType: 'Quotation', entityId: id, action: 'DELETE', changedBy: user.username });
        });
        await cacheService.invalidateEntityCaches('quotations');
    },

    async bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'quotation', ids);
            const live = await tx.quotation.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.quotation.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(user) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Quotation' as const, entityId, action: 'DELETE' as const, changedBy: user.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('quotations');
        return result;
    },
};
