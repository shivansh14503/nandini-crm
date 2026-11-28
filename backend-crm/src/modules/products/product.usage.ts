import { prisma } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { accessLevel, buildAccessScopeWhere, ownersFor } from '../shared/accessControl.js';
import { CLOSED_SALES_STAGES } from '../opportunities/opportunity.validator.js';

/**
 * Product usage: the opportunities whose line items carry the product (quotations don't count). Each opportunity
 * counts once per product, however many of its lines hold it. `won` (Closed Won) + `lost` (Closed Lost) + `open`
 * (every other stage) = `total`. Counted live on every read, so stage and line-item changes show at once, and only
 * over the opportunities the viewer may see (the same rows the Opportunities list shows them).
 */
export interface ProductUsage {
    total: number;
    won: number;
    lost: number;
    open: number;
}

export const EMPTY_USAGE: ProductUsage = Object.freeze({ total: 0, won: 0, lost: 0, open: 0 });

const [WON_STAGE, LOST_STAGE] = CLOSED_SALES_STAGES;

/** SQL Server allows 2,100 parameters per statement: stay well below it. */
const ID_BATCH = 1000;

/** Prisma `where` for products used on at least one live opportunity the viewer may see. */
export function usedProductWhere(user: AuthUser): Prisma.ProductWhereInput {
    const opportunity: Prisma.OpportunityWhereInput = { isDeleted: false, AND: [buildAccessScopeWhere(user, 'assignedTo', 'opportunities', 'view')] };
    return { opportunityLineItems: { some: { opportunity } } };
}

interface UsageRow {
    productId: string;
    total: number;
    won: number;
    lost: number;
}

/**
 * Usage of each product in `productIds` (missing ids → no row; read them with `usageOf`). One aggregate query per
 * 1,000 ids: distinct (product, opportunity) pairs from the line items (index on productId, opportunityId) joined to
 * the live opportunities, grouped by product.
 */
export async function loadProductUsage(productIds: readonly string[], user: AuthUser): Promise<Map<string, ProductUsage>> {
    const usage = new Map<string, ProductUsage>();
    const ids = [...new Set(productIds)];
    // The opportunities the viewer may see (Admin › Roles: Opportunities › View).
    const owners = ownersFor(user, accessLevel(user, 'opportunities', 'view'));
    const scope =
        owners === null
            ? Prisma.empty
            : owners.length > 0
              ? Prisma.sql`AND (o.[assignedTo] IN (${Prisma.join(owners)}) OR o.[createdBy] IN (${Prisma.join(owners)}))`
              : Prisma.sql`AND 1 = 0`;
    for (let i = 0; i < ids.length; i += ID_BATCH) {
        const batch = ids.slice(i, i + ID_BATCH);
        const rows = await prisma.$queryRaw<UsageRow[]>(Prisma.sql`
            SELECT li.[productId] AS productId,
                   COUNT(*) AS total,
                   SUM(CASE WHEN LTRIM(o.[salesStage]) = ${WON_STAGE} THEN 1 ELSE 0 END) AS won,
                   SUM(CASE WHEN LTRIM(o.[salesStage]) = ${LOST_STAGE} THEN 1 ELSE 0 END) AS lost
            FROM (
                SELECT DISTINCT [productId], [opportunityId]
                FROM [dbo].[OpportunityLineItem]
                WHERE [productId] IN (${Prisma.join(batch)})
            ) li
            JOIN [dbo].[Opportunity] o ON o.[id] = li.[opportunityId]
            WHERE o.[isDeleted] = 0 ${scope}
            GROUP BY li.[productId]`);
        for (const row of rows) {
            const total = Number(row.total);
            const won = Number(row.won);
            const lost = Number(row.lost);
            usage.set(row.productId, { total, won, lost, open: total - won - lost });
        }
    }
    return usage;
}

export const usageOf = (usage: Map<string, ProductUsage>, productId: string): ProductUsage => usage.get(productId) ?? { ...EMPTY_USAGE };
