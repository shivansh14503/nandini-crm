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
import { acquireLocks, lockRecords, runInTransaction, softDeleteData, type BulkDeleteResult } from '../shared/transactions.js';
import { toProductData, toProductDto, type ProductDto } from './product.mapper.js';
import { PRODUCT_SORT_FIELDS, productInputSchema, productListQuerySchema, type ProductInput } from './product.validator.js';

const notFound = () => HttpError.notFound('Product not found');

/** Product names are unique among live products; the name lock makes "check, then write" race-free. */
async function assertUniqueName(tx: TransactionClient, productName: string, excludeId?: string): Promise<void> {
    await acquireLocks(tx, [`product:name:${productName.trim().toLowerCase()}`]);
    const duplicate = await tx.product.findFirst({
        where: { productName, isDeleted: false, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { productCode: true },
    });
    if (duplicate) throw HttpError.conflict(`A product named "${productName}" already exists (${duplicate.productCode}).`);
}

/** Inserts a product inside the caller's transaction (used by `create`, import and the seed). */
export async function createProductRecord(tx: TransactionClient, input: ProductInput, actor: AuthUser): Promise<ProductDto> {
    // Code first: its counter row lock queues concurrent creates before they take any other lock.
    const productCode = await generateEntityCode(tx, 'PRD');
    await assertUniqueName(tx, input.productName);
    const row = await tx.product.create({ data: { ...toProductData(input), productCode, createdBy: actor.username } });
    const dto = toProductDto(row);
    await auditService.record(tx, { entityType: 'Product', entityId: row.id, action: 'CREATE', changedBy: actor.username, changes: dto });
    return dto;
}

export const productService = {
    async list(query: unknown): Promise<PaginatedResult<ProductDto>> {
        const page = parsePagination(query, PRODUCT_SORT_FIELDS);
        const filters = productListQuerySchema.parse(query ?? {});

        const where: Prisma.ProductWhereInput = { isDeleted: false };
        if (filters.category?.length) where.category = { in: filters.category };
        if (filters.type?.length) where.type = { in: filters.type };
        if (filters.isActive !== undefined) where.isActive = filters.isActive;
        if (filters.createdWithinDays) where.createdAt = { gte: daysAgo(filters.createdWithinDays) };
        if (page.search) {
            // SQL Server's default collation makes `contains` case-insensitive.
            where.OR = [
                { productName: { contains: page.search } },
                { productCode: { contains: page.search } },
                { category: { contains: page.search } },
                { manufacturer: { contains: page.search } },
                { hsnCode: { contains: page.search } },
            ];
        }

        const [total, rows] = await prisma.$transaction([
            prisma.product.count({ where }),
            prisma.product.findMany({ where, orderBy: [page.orderBy, { id: 'asc' }], skip: page.skip, take: page.take }),
        ]);
        return { data: rows.map(toProductDto), total, page: page.page, limit: page.limit };
    },

    async getById(id: string): Promise<ProductDto> {
        const row = await prisma.product.findFirst({ where: { id, isDeleted: false } });
        if (!row) throw notFound();
        return toProductDto(row);
    },

    async create(body: unknown, actor: AuthUser): Promise<ProductDto> {
        const input = productInputSchema.parse(body);

        const created = await runInTransaction((tx) => createProductRecord(tx, input, actor));
        await cacheService.invalidateEntityCaches('products');
        return created;
    },

    /** Partial update: the patch is merged onto the stored product and the result validated as a whole. */
    async update(id: string, patch: Record<string, unknown>, actor: AuthUser): Promise<ProductDto> {
        const updated = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'product', [id]);
            const existing = await tx.product.findFirst({ where: { id, isDeleted: false } });
            if (!existing) throw notFound();

            const before = toProductDto(existing);
            const input = productInputSchema.parse({ ...before, ...patch });
            if (input.productName !== existing.productName) await assertUniqueName(tx, input.productName, id);

            const row = await tx.product.update({ where: { id }, data: { ...toProductData(input), updatedBy: actor.username } });
            const after = toProductDto(row);
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'Product', entityId: id, action: 'UPDATE', changedBy: actor.username, changes });
            }
            return after;
        });

        await cacheService.invalidateEntityCaches('products');
        return updated;
    },

    async remove(id: string, actor: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            await lockRecords(tx, 'product', [id]);
            const result = await tx.product.updateMany({ where: { id, isDeleted: false }, data: softDeleteData(actor) });
            if (result.count === 0) throw notFound();
            await auditService.record(tx, { entityType: 'Product', entityId: id, action: 'DELETE', changedBy: actor.username });
        });
        await cacheService.invalidateEntityCaches('products');
    },

    async bulkRemove(ids: string[], actor: AuthUser): Promise<BulkDeleteResult> {
        const result = await runInTransaction(async (tx) => {
            await lockRecords(tx, 'product', ids);
            const live = await tx.product.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
            const liveIds = live.map((row) => row.id);
            if (liveIds.length > 0) {
                await tx.product.updateMany({ where: { id: { in: liveIds } }, data: softDeleteData(actor) });
                await auditService.recordMany(
                    tx,
                    liveIds.map((entityId) => ({ entityType: 'Product' as const, entityId, action: 'DELETE' as const, changedBy: actor.username })),
                );
            }
            return { deleted: liveIds.length, ids: liveIds, notFound: ids.filter((id) => !liveIds.includes(id)) };
        });

        if (result.deleted > 0) await cacheService.invalidateEntityCaches('products');
        return result;
    },
};
