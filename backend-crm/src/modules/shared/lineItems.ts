import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import type { TransactionClient } from '../../config/prisma.js';
import type { OpportunityLineItem, QuotationLineItem } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/httpError.js';
import { decimalToNumber } from '../../utils/mappers.js';
import { optionalText, requiredText } from '../../validators/common.js';
import { isActiveProductStatus } from '../products/product.validator.js';
import { isBlankLineItem, lineItemAmounts, lineItemTotals, normalizeTaxRate, roundMoney, type LineItemAmounts, type LineItemTotals } from './lineItemMath.js';

export { isBlankLineItem, lineItemAmounts, lineItemTotals, normalizeTaxRate, parseTaxRate, LINE_ITEM_TAX_RATES } from './lineItemMath.js';
export type { LineItemAmounts, LineItemTotals } from './lineItemMath.js';

/**
 * Line items shared by opportunities and quotations (Jira CRM-111): one shape, one set of labels and one calculation
 * (lineItemMath.ts, mirrored by the frontend's CrmLineItemsSection), so client and server agree to the paisa.
 *
 * Fields: Product, Quantity, Rate (the product's MRP; typed only for products without one), Gross Amount
 * (Quantity × Rate), Discount (a percentage), Taxable Amount (Gross − Discount), GST (the product's Tax Rate) and the
 * optional Description and Note. Only Discount, Description and Note may be left empty. A line with nothing entered
 * is dropped (the form always shows one empty line). Quotations and opportunities both need at least one line.
 */

const MAX_LINE_ITEMS = 200;
const MAX_AMOUNT = 1e13;

const number = (field: string, max = MAX_AMOUNT) =>
    z.coerce
        .number({ error: `${field} must be a number.` })
        .refine(Number.isFinite, { message: `${field} must be a number.` })
        .refine((value) => value >= 0, { message: `${field} cannot be negative.` })
        .refine((value) => value <= max, { message: `${field} is too large.` });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Accepts lines in the format before CRM-111 too (imports, older clients, demo data): `amount` is the Rate, a
 * `direct` (per unit) discount becomes the percentage of the Rate it was, and `GST 18%` / `--None--` become `18%` /
 * `0%`. Derived values sent by the client are ignored.
 */
export function normalizeLineItemInput(value: unknown): unknown {
    if (!isRecord(value)) return value;
    const { amount, discountType, salePrice: _salePrice, taxAmount: _taxAmount, total: _total, grossAmount: _gross, discountAmount: _discountAmount, taxableAmount: _taxable, ...rest } = value;
    const rate = rest.rate ?? amount;
    let discount = rest.discount;
    if (discountType === 'direct') {
        const perUnit = Number(discount) || 0;
        const unitRate = Number(rate) || 0;
        discount = unitRate > 0 ? Math.min(100, roundMoney((perUnit / unitRate) * 100)) : 0;
    }
    return {
        ...rest,
        rate: rate === '' || rate === null ? undefined : rate,
        discount: discount === '' || discount === null || discount === undefined ? 0 : discount,
        taxRate: typeof rest.taxRate === 'string' ? normalizeTaxRate(rest.taxRate) : rest.taxRate,
    };
}

export const lineItemInputSchema = z.preprocess(
    normalizeLineItemInput,
    z.object({
        id: z.string().optional(),
        productId: optionalText('Product', 50),
        productName: requiredText('Product', L.organizationName),
        quantity: number('Quantity', 1e6).refine((value) => value >= 1, { message: 'Quantity must be at least 1.' }),
        // Missing → 0 → "Rate is required." (a product without an MRP needs a typed Rate).
        rate: z.preprocess((value) => (value === undefined ? 0 : value), number('Rate').refine((value) => value > 0, { message: 'Rate is required.' })),
        discount: number('Discount').refine((value) => value <= 100, { message: 'Discount cannot exceed 100%.' }).default(0),
        taxRate: z
            .string({ error: 'GST is required.' })
            .trim()
            .min(1, { message: 'GST is required.' })
            .max(20)
            .refine((value) => /\d\s*%/.test(value), { message: 'GST must be a rate such as 18%.' }),
        description: optionalText('Description', L.longText),
        note: optionalText('Note', L.longText),
        // grossAmount / discountAmount / taxableAmount are derived; client values are ignored.
    }),
);

export type LineItemInput = z.infer<typeof lineItemInputSchema>;

/** Drops the lines nothing was entered on (the empty line the form always shows) before validating the rest. */
const dropBlankLines = (value: unknown): unknown =>
    Array.isArray(value) ? value.filter((item) => !(isRecord(item) && isBlankLineItem(normalizeLineItemInput(item) as Record<string, unknown>))) : value;

const lineItemArray = z.array(lineItemInputSchema).max(MAX_LINE_ITEMS, { message: `At most ${MAX_LINE_ITEMS} line items are allowed.` });

/**
 * Opportunity line items as stored: may be empty (opportunities made by Convert Lead, imports, or saved before the
 * line was required). Create and form saves check requiredOpportunityLineItemsSchema on top.
 */
export const lineItemListSchema = z.preprocess(dropBlankLines, lineItemArray);

/** "At least one line item" message for a record (`quotation`, `opportunity`). */
export const lineItemsRequiredMessage = (record: string) => `At least one line item is required to save the ${record}.`;

/** Line items with at least one filled line (quotations; opportunities saved from their form). */
export const requiredLineItemList = (record: string) =>
    z.preprocess(dropBlankLines, lineItemArray.min(1, { message: lineItemsRequiredMessage(record) }));

/** Quotation line items: at least one. */
export const requiredLineItemListSchema = requiredLineItemList('quotation');

/** Rejects a save with no filled line item (blank lines are already dropped by the list schemas). */
export function assertHasLineItems(lineItems: readonly unknown[], record: string): void {
    if (lineItems.length > 0) return;
    const message = lineItemsRequiredMessage(record);
    throw HttpError.badRequest(message, [{ path: ['lineItems'], message }]);
}

export interface ComputedLineItem extends LineItemInput, LineItemAmounts {}

/** Per-line amounts and the document totals, exactly as the line items editor shows them. */
export function calculateLineItems(items: readonly LineItemInput[], lumpSumDiscount: number): { items: ComputedLineItem[]; totals: LineItemTotals } {
    return {
        items: items.map((item) => ({ ...item, ...lineItemAmounts(item) })),
        totals: lineItemTotals(items, lumpSumDiscount),
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

export const inactiveProductMessage = (name: string) => `${name} is Inactive in the Product Catalog and can't be added to a line item.`;

export interface PreparedLineItems {
    /** The lines, with Rate and GST taken from the Product Catalog where the product sets them. */
    items: LineItemInput[];
    /** Product ids that exist (deleted products stay linked for history). */
    knownProductIds: Set<string>;
}

/**
 * Checks the lines' products and applies the catalog's pricing. An Inactive product can't be newly added: only lines
 * whose product is in `alreadyLinked` (the record's own saved lines, or the opportunity a quotation is made from) may
 * keep one. A newly linked product with an MRP sets the line's Rate, and one with a Tax Rate sets its GST (the form
 * shows both as not editable); lines already linked keep the values they were saved with.
 */
export async function prepareLineItems(tx: TransactionClient, items: readonly LineItemInput[], alreadyLinked: ReadonlySet<string> = new Set()): Promise<PreparedLineItems> {
    const ids = [...new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return { items: [...items], knownProductIds: new Set() };
    const found = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, isDeleted: true, productName: true, mrp: true, taxRate: true },
    });
    const inactive = new Map(found.filter((row) => !row.isDeleted && !isActiveProductStatus(row.status) && !alreadyLinked.has(row.id)).map((row) => [row.id, row.productName]));
    const issues = items.flatMap((item, index) => {
        const name = item.productId ? inactive.get(item.productId) : undefined;
        return name ? [{ message: inactiveProductMessage(name), path: ['lineItems', String(index), 'productName'] }] : [];
    });
    if (issues.length > 0) throw HttpError.badRequest(issues[0].message, issues);

    const catalog = new Map(found.filter((row) => !row.isDeleted && !alreadyLinked.has(row.id)).map((row) => [row.id, row]));
    const priced = items.map((item) => {
        const product = item.productId ? catalog.get(item.productId) : undefined;
        if (!product) return item;
        const mrp = product.mrp ? decimalToNumber(product.mrp) : 0;
        const taxRate = normalizeTaxRate(product.taxRate);
        return { ...item, ...(mrp > 0 ? { rate: mrp } : {}), ...(taxRate ? { taxRate } : {}) };
    });
    return { items: priced, knownProductIds: new Set(found.map((row) => row.id)) };
}

/** `prepareLineItems` for callers that only need the existing product ids. */
export async function resolveProductIds(tx: TransactionClient, items: readonly LineItemInput[], alreadyLinked: ReadonlySet<string> = new Set()): Promise<Set<string>> {
    return (await prepareLineItems(tx, items, alreadyLinked)).knownProductIds;
}

/** Product ids already on saved line items (kept by `prepareLineItems` even when the product is now Inactive). */
export const linkedProductIds = (rows: readonly { productId: string | null }[]): Set<string> =>
    new Set(rows.map((row) => row.productId).filter((id): id is string => Boolean(id)));

/** Column values for a line item row (parent FK added by the caller). */
export function toLineItemData(item: ComputedLineItem, index: number, knownProductIds: Set<string>) {
    return {
        productId: item.productId && knownProductIds.has(item.productId) ? item.productId : null,
        productName: item.productName,
        quantity: item.quantity,
        rate: item.rate,
        grossAmount: item.grossAmount,
        discount: item.discount,
        discountAmount: item.discountAmount,
        taxRate: item.taxRate,
        taxableAmount: item.taxableAmount,
        description: item.description ?? null,
        note: item.note ?? null,
        sortOrder: index,
    };
}

/** `LineItem` DTO (frontend-crm/src/types/lineItem.types.ts), the same on opportunities and quotations. */
export interface LineItemDto {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    rate: number;
    grossAmount: number;
    discount: number;
    discountAmount: number;
    taxRate: string;
    taxableAmount: number;
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
            rate: decimalToNumber(row.rate),
            grossAmount: decimalToNumber(row.grossAmount),
            discount: decimalToNumber(row.discount),
            discountAmount: decimalToNumber(row.discountAmount),
            taxRate: row.taxRate,
            taxableAmount: decimalToNumber(row.taxableAmount),
            description: row.description ?? '',
            note: row.note ?? '',
        }));
}

export const lineItemsInclude = { orderBy: { sortOrder: 'asc' } } as const;
