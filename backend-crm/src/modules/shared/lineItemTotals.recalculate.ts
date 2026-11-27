import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { decimalToNumber } from '../../utils/mappers.js';
import { SYSTEM_USER } from '../audit/auditUsers.js';
import { customerStateOf, gstTypeFor, lineItemAmounts, lineItemTotals, toGstType, type GstType, type LineItemTotals } from './lineItemMath.js';
import { runInTransaction } from './transactions.js';

/**
 * Recomputes stored line item totals with the Summary Breakdown (Jira CRM-111): Actual (Before Tax), GST per rate on
 * it (IGST, or CGST + SGST), Round Off and Grand Total, to the paisa, with the same shared math the forms, drawers and
 * PDFs use. A system recalculation: records keep their Last Modified (updatedAt) and get no audit entry, and a record
 * saved by someone while a batch runs is left alone (it was just computed by its save).
 *
 *   • once at start-up after the migration (every record), marker ModuleSetting system/lineItemSummaryTotals
 *   • when an admin first sets (or changes) the Company State: records saved without one (`gstType` NULL) take the split
 */

const MARKER = { module: 'system', key: 'lineItemSummaryTotals' } as const;
const BATCH = 100;

interface LineRow {
    id: string;
    quantity: unknown;
    rate: unknown;
    discount: unknown;
    discountType: string;
    taxRate: string;
    grossAmount: unknown;
    discountAmount: unknown;
    taxableAmount: unknown;
}

interface TotalsRow {
    id: string;
    updatedAt: Date;
    gstType: string | null;
    roundOff: boolean;
    lumpSumDiscount: unknown;
    totalAmount: unknown;
    totalDiscount: unknown;
    subtotal: unknown;
    actualBeforeTax: unknown;
    totalTax: unknown;
    roundOffAmount: unknown;
    grandTotal: unknown;
    lineItems: LineRow[];
}

const LINE_SELECT = {
    id: true,
    quantity: true,
    rate: true,
    discount: true,
    discountType: true,
    taxRate: true,
    grossAmount: true,
    discountAmount: true,
    taxableAmount: true,
} as const;

const TOTALS_SELECT = {
    id: true,
    updatedAt: true,
    gstType: true,
    roundOff: true,
    lumpSumDiscount: true,
    totalAmount: true,
    totalDiscount: true,
    subtotal: true,
    actualBeforeTax: true,
    totalTax: true,
    roundOffAmount: true,
    grandTotal: true,
    lineItems: { select: LINE_SELECT },
} as const;

const TOTAL_KEYS = ['totalAmount', 'totalDiscount', 'subtotal', 'actualBeforeTax', 'totalTax', 'roundOffAmount', 'grandTotal'] as const;

/** What a record's totals and lines should be; null when they already are. */
export function recalculatedTotals(row: TotalsRow, gstType: GstType | null) {
    const lines = row.lineItems.map((line) => ({
        quantity: decimalToNumber(line.quantity as never),
        rate: decimalToNumber(line.rate as never),
        discount: decimalToNumber(line.discount as never),
        discountType: line.discountType,
        taxRate: line.taxRate,
    }));
    const totals: LineItemTotals = lineItemTotals(lines, { lumpSumDiscount: decimalToNumber(row.lumpSumDiscount as never), roundOff: row.roundOff, gstType });
    const lineChanges = row.lineItems.flatMap((line, i) => {
        const amounts = lineItemAmounts(lines[i]);
        const same =
            amounts.grossAmount === decimalToNumber(line.grossAmount as never) &&
            amounts.discountAmount === decimalToNumber(line.discountAmount as never) &&
            amounts.taxableAmount === decimalToNumber(line.taxableAmount as never);
        return same ? [] : [{ id: line.id, ...amounts }];
    });
    const totalsChanged = TOTAL_KEYS.some((key) => totals[key] !== decimalToNumber(row[key] as never)) || toGstType(row.gstType) !== gstType;
    // A lump sum above the lines' total (saved before it was checked) is kept as typed; the totals use the part that fits.
    return totalsChanged || lineChanges.length > 0 ? { totals, gstType, lineChanges } : null;
}

interface Owner {
    label: 'opportunities' | 'quotations';
    page(afterId: string, onlyWithoutGstType: boolean): Promise<(TotalsRow & { customerState: string })[]>;
    save(row: TotalsRow, change: NonNullable<ReturnType<typeof recalculatedTotals>>): Promise<boolean>;
}

const pageWhere = (afterId: string, onlyWithoutGstType: boolean) => ({ id: { gt: afterId }, ...(onlyWithoutGstType ? { gstType: null } : {}) });

const OWNERS: Owner[] = [
    {
        label: 'opportunities',
        async page(afterId, onlyWithoutGstType) {
            const rows = await prisma.opportunity.findMany({
                where: pageWhere(afterId, onlyWithoutGstType),
                orderBy: { id: 'asc' },
                take: BATCH,
                select: { ...TOTALS_SELECT, organization: { select: { shippingState: true, billingState: true, copyAddressFromBilling: true } } },
            });
            return rows.map((row) => ({ ...row, customerState: customerStateOf(row.organization) }));
        },
        async save(row, change) {
            return runInTransaction(async (tx) => {
                const { count } = await tx.opportunity.updateMany({
                    where: { id: row.id, updatedAt: row.updatedAt },
                    data: { ...change.totals, gstType: change.gstType, updatedAt: row.updatedAt },
                });
                if (count === 0) return false;
                for (const { id, ...amounts } of change.lineChanges) await tx.opportunityLineItem.update({ where: { id }, data: amounts });
                return true;
            });
        },
    },
    {
        label: 'quotations',
        async page(afterId, onlyWithoutGstType) {
            const rows = await prisma.quotation.findMany({
                where: pageWhere(afterId, onlyWithoutGstType),
                orderBy: { id: 'asc' },
                take: BATCH,
                select: { ...TOTALS_SELECT, shippingState: true, billingState: true, copyAddressFromBilling: true },
            });
            return rows.map((row) => ({ ...row, customerState: customerStateOf(row) }));
        },
        async save(row, change) {
            return runInTransaction(async (tx) => {
                const { count } = await tx.quotation.updateMany({
                    where: { id: row.id, updatedAt: row.updatedAt },
                    data: { ...change.totals, gstType: change.gstType, updatedAt: row.updatedAt },
                });
                if (count === 0) return false;
                for (const { id, ...amounts } of change.lineChanges) await tx.quotationLineItem.update({ where: { id }, data: amounts });
                return true;
            });
        },
    },
];

/**
 * Recomputes the totals of every opportunity and quotation (deleted ones too, so a restore shows correct totals), or
 * with `onlyWithoutGstType` those saved without a company state. A record that already has a split keeps it; the others
 * get it from `companyState` ('' = plain GST). Returns how many records changed.
 */
export async function recalculateLineItemTotals({ companyState, onlyWithoutGstType = false }: { companyState: string; onlyWithoutGstType?: boolean }) {
    const updated = { opportunities: 0, quotations: 0 };
    for (const owner of OWNERS) {
        let afterId = '';
        for (;;) {
            const rows = await owner.page(afterId, onlyWithoutGstType);
            if (rows.length === 0) break;
            afterId = rows[rows.length - 1].id;
            for (const row of rows) {
                const gstType = toGstType(row.gstType) ?? gstTypeFor(companyState, row.customerState);
                const change = recalculatedTotals(row, gstType);
                if (change && (await owner.save(row, change))) updated[owner.label] += 1;
            }
            if (rows.length < BATCH) break;
        }
    }
    return updated;
}

/** Start-up: the one-time recalculation after the Summary Breakdown migration (marker row, so it runs once). */
export async function recalculateLineItemTotalsOnceSafely(): Promise<void> {
    try {
        const done = await prisma.moduleSetting.findUnique({ where: { module_key: MARKER } });
        if (done) return;
        const settings = await prisma.companySettings.findUnique({ where: { id: 1 }, select: { companyState: true } });
        const updated = await recalculateLineItemTotals({ companyState: settings?.companyState ?? '' });
        await prisma.moduleSetting.upsert({
            where: { module_key: MARKER },
            create: { ...MARKER, valueJson: JSON.stringify({ ranAt: new Date().toISOString(), ...updated }), updatedBy: SYSTEM_USER },
            update: {},
        });
        logger.info(updated, 'Line item totals recalculated with the Summary Breakdown');
    } catch (err) {
        // Not fatal: the next start-up tries again (the marker is written only after a full run).
        logger.warn({ err: (err as Error).message }, 'Line item totals not recalculated');
    }
}
