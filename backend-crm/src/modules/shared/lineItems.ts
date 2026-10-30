import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import type { TransactionClient } from '../../config/prisma.js';
import type { OpportunityLineItem, QuotationLineItem } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/httpError.js';
import { decimalToNumber } from '../../utils/mappers.js';
import { optionalText, requiredText } from '../../validators/common.js';

/**
 * Line items shared by opportunities and quotations. Totals are always computed here, with the exact
 * algorithm of the frontend's CrmLineItemsSection (same language, same float operations, same rounding),
 * so client and server agree to the rupee.
 */

const MAX_LINE_ITEMS = 200;
const MAX_AMOUNT = 1e13;

const number = (field: string, max = MAX_AMOUNT) =>
    z.coerce
        .number({ error: `${field} must be a number.` })
        .refine(Number.isFinite, { message: `${field} must be a number.` })
        .refine((value) => value >= 0, { message: `${field} cannot be negative.` })
        .refine((value) => value <= max, { message: `${field} is too large.` });

export const lineItemInputSchema = z
    .object({
        id: z.string().optional(),
        productId: optionalText('Product', 50),
        productName: requiredText('Product Name', L.organizationName),
        quantity: number('Quantity', 1e6).refine((value) => value >= 1, { message: 'Quantity must be at least 1.' }),
        amount: number('Amount'),
        discount: number('Discount').default(0),
        discountType: z.enum(['percentage', 'direct'], { error: 'Discount type must be percentage or direct.' }).default('percentage'),
        taxRate: z.string().trim().max(20).default('GST 18%'),
        description: optionalText('Line item description', L.longText),
        note: optionalText('Line item note', L.longText),
        // salePrice / taxAmount / total are derived; client values are ignored.
    })
    .superRefine((item, ctx) => {
        if (item.discountType === 'percentage' && item.discount > 100) {
            ctx.addIssue({ code: 'custom', path: ['discount'], message: 'Percentage discount cannot exceed 100.' });
        }
    });

export const lineItemListSchema = z
    .array(lineItemInputSchema)
    .max(MAX_LINE_ITEMS, { message: `At most ${MAX_LINE_ITEMS} line items are allowed.` });

export type LineItemInput = z.infer<typeof lineItemInputSchema>;

/** Port of `parseTaxRate` (frontend): '18%', 'GST 18%' → 18; '--None--', 'GST 0%', '' → 0. */
export function parseTaxRate(taxRate: string): number {
    if (!taxRate || taxRate === '--None--' || taxRate === 'GST 0%') return 0;
    const match = taxRate.match(/(\d+)%/);
    return match ? Number(match[1]) : 0;
}

export interface ComputedLineItem extends LineItemInput {
    salePrice: number;
    taxAmount: number;
    total: number;
}

export interface LineItemTotals {
    totalAmount: number;
    totalDiscount: number;
    subtotal: number;
    totalTax: number;
    grandTotal: number;
}

/** Recomputes per-line and document totals exactly as `CrmLineItemsEditor` does. */
export function calculateLineItems(items: readonly LineItemInput[], lumpSumDiscount: number): { items: ComputedLineItem[]; totals: LineItemTotals } {
    let grossAmount = 0;
    let grossDiscount = 0;
    let grossSubtotal = 0;
    let grossTax = 0;

    const computed = items.map((item) => {
        const qty = item.quantity || 1;
        const baseAmount = item.amount * qty;
        grossAmount += baseAmount;

        const discount = item.discountType === 'percentage' ? (baseAmount * (item.discount || 0)) / 100 : (item.discount || 0) * qty;
        grossDiscount += discount;

        const lineSubtotal = Math.max(0, baseAmount - discount);
        grossSubtotal += lineSubtotal;

        const taxPercent = parseTaxRate(item.taxRate);
        grossTax += (lineSubtotal * taxPercent) / 100;

        // Per-line display values (handleUpdateLineItem in the editor).
        const discountPerUnit = item.discountType === 'percentage' ? (item.amount * (item.discount || 0)) / 100 : item.discount || 0;
        const salePrice = Math.max(0, item.amount - discountPerUnit);
        const lineNet = salePrice * qty;
        const lineTax = (lineNet * taxPercent) / 100;
        return { ...item, salePrice: Math.round(salePrice), taxAmount: Math.round(lineTax), total: Math.round(lineNet + lineTax) };
    });

    return {
        items: computed,
        totals: {
            totalAmount: Math.round(grossAmount),
            totalDiscount: Math.round(grossDiscount),
            subtotal: Math.round(grossSubtotal),
            totalTax: Math.round(grossTax),
            grandTotal: Math.round(Math.max(0, grossSubtotal + grossTax - (lumpSumDiscount || 0))),
        },
    };
}

const TOTAL_FIELDS = ['totalAmount', 'totalDiscount', 'subtotal', 'totalTax', 'grandTotal'] as const;

/**
 * Rejects a request whose explicitly sent totals disagree with the line items (a stale or tampered quote).
 * Only fields present in the request are compared; the stored values are always the computed ones.
 */
export function assertTotalsMatch(sent: Record<string, unknown>, computed: LineItemTotals): void {
    const mismatches = TOTAL_FIELDS.filter((field) => field in sent && sent[field] !== null && sent[field] !== undefined)
        .filter((field) => Math.round(Number(sent[field])) !== computed[field])
        .map((field) => ({ message: `${field} should be ${computed[field]} for these line items.`, path: [field] }));
    if (mismatches.length > 0) {
        throw HttpError.badRequest('Totals do not match the line items. Refresh the totals and try again.', mismatches);
    }
}

/** Keeps a line's productId only when that product exists (deleted products stay linked for history). */
export async function resolveProductIds(tx: TransactionClient, items: readonly LineItemInput[]): Promise<Set<string>> {
    const ids = [...new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return new Set();
    const found = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return new Set(found.map((row) => row.id));
}

/** Column values for a line item row (parent FK added by the caller). */
export function toLineItemData(item: ComputedLineItem, index: number, knownProductIds: Set<string>) {
    return {
        productId: item.productId && knownProductIds.has(item.productId) ? item.productId : null,
        productName: item.productName,
        quantity: item.quantity,
        amount: item.amount,
        discount: item.discount,
        discountType: item.discountType,
        salePrice: item.salePrice,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        total: item.total,
        description: item.description ?? null,
        note: item.note ?? null,
        sortOrder: index,
    };
}

/** `OpportunityLineItem` / `QuotationLineItem` DTO (frontend types). */
export interface LineItemDto {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    amount: number;
    discount: number;
    discountType: 'percentage' | 'direct';
    salePrice: number;
    taxRate: string;
    taxAmount: number;
    total: number;
    description: string;
    note: string;
}

export function toLineItemDtos(rows: readonly (OpportunityLineItem | QuotationLineItem)[] | undefined): LineItemDto[] {
    return [...(rows ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({
            id: row.id,
            productId: row.productId ?? '',
            productName: row.productName,
            quantity: decimalToNumber(row.quantity),
            amount: decimalToNumber(row.amount),
            discount: decimalToNumber(row.discount),
            discountType: row.discountType === 'direct' ? 'direct' : 'percentage',
            salePrice: decimalToNumber(row.salePrice),
            taxRate: row.taxRate,
            taxAmount: decimalToNumber(row.taxAmount),
            total: decimalToNumber(row.total),
            description: row.description ?? '',
            note: row.note ?? '',
        }));
}

export const lineItemsInclude = { orderBy: { sortOrder: 'asc' } } as const;
