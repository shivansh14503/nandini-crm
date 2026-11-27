import type { LineItem, LineItemsValues } from '@/types/lineItem.types';
import {
    clampDiscount,
    DEFAULT_DISCOUNT_TYPE,
    GST_TYPE_LABELS,
    lineItemAmounts,
    lineItemSummary,
    lineItemTotals,
    normalizeTaxRate,
    roundMoney,
    taxRowLines,
    toDiscountType,
    toGstType,
    toRoundOff,
    type GstType,
    type LineItemDiscountType,
    type LineItemTotals,
    type LineItemTotalsOptions,
} from './lineItemMath';

export * from './lineItemMath';

/**
 * Line items (Jira CRM-111): one set of labels for the editor, the view page, the drawers, the scorecards and the PDF
 * builder's defaults. Keys match the API (`LineItem`, backend shared/lineItems.ts).
 */
export const LINE_ITEM_LABELS = {
    quantity: 'Quantity',
    productName: 'Product',
    rate: 'Rate',
    grossAmount: 'Gross Amount',
    discount: 'Discount',
    taxRate: 'GST',
    taxableAmount: 'Taxable Amount',
    description: 'Description',
    note: 'Note',
} as const satisfies Partial<Record<keyof LineItem, string>>;

/** The Discount type dropdown: a percentage of the Gross Amount, or an amount off the line. */
export const LINE_ITEM_DISCOUNT_TYPE_LABELS: Record<LineItemDiscountType, string> = {
    percentage: 'Percentage',
    amount: 'Amount',
};

/**
 * A line's Discount as text, the same in the view page, the drawers and the PDF: `12.5% (− ₹1,000)` for a
 * percentage, `− ₹1,000` for an amount, '' when there is none.
 */
export function lineDiscountText(item: Pick<LineItem, 'discount' | 'discountType' | 'discountAmount'>, money: (n: number) => string, percent: (n: number) => string): string {
    if (!(item.discount > 0)) return '';
    return toDiscountType(item.discountType) === 'amount' ? `− ${money(item.discountAmount)}` : `${percent(item.discount)} (− ${money(item.discountAmount)})`;
}

/**
 * Record totals, in the Summary Breakdown's order (Jira CRM-111): `subtotal` is the Total Taxable Amount, then the
 * Lump Sum Discount, Actual (Before Tax), a GST line per rate (`taxRowLines`), Round Off and the Grand Total.
 * Gross Amount and Discount stay as totals of the lines (scorecards, PDF fields) but are not in the summary.
 */
export const LINE_ITEM_TOTAL_LABELS = {
    totalAmount: 'Gross Amount',
    totalDiscount: 'Discount',
    subtotal: 'Total Taxable Amount',
    lumpSumDiscount: 'Lump Sum Discount',
    actualBeforeTax: 'Actual (Before Tax)',
    totalTax: 'GST',
    roundOffAmount: 'Round Off',
    grandTotal: 'Grand Total',
} as const;

/** A signed Round Off amount: `+ ₹0.18`, `− ₹0.03`, or `₹0.00`. */
export function roundOffText(amount: number, money: (n: number) => string): string {
    if (amount > 0) return `+ ${money(amount)}`;
    if (amount < 0) return `− ${money(-amount)}`;
    return money(0);
}

/** The Product Catalog's Tax Rate dropdown: the GST options of every line item. */
export const LINE_ITEM_TAX_RATE_CATEGORY = 'product_tax_rate';

export const DEFAULT_CURRENCY = 'Indian Rupee: ₹';

/** Quotation currencies (opportunities have none: their amounts are in ₹). */
export const QUOTATION_CURRENCIES: string[] = [DEFAULT_CURRENCY, 'US Dollar: $', 'Euro: €', 'GBP: £', 'AED: د.إ'];

const CURRENCY_KEYWORDS: [RegExp, string][] = [
    [/rupee|₹|\binr\b/i, 'INR'],
    [/dollar|\$|\busd\b/i, 'USD'],
    [/euro|€|\beur\b/i, 'EUR'],
    [/pound|£|\bgbp\b/i, 'GBP'],
    [/dirham|د\.إ|\baed\b/i, 'AED'],
];

/** ISO code of a stored currency label (`US Dollar: $` → USD); INR when unknown. Same rule as the PDF (pdf/format.ts). */
export function currencyCodeOf(currency: string | null | undefined): string {
    const value = (currency ?? '').trim();
    if (/^[A-Z]{3}$/.test(value)) return value;
    for (const [pattern, code] of CURRENCY_KEYWORDS) if (pattern.test(value)) return code;
    return 'INR';
}

/** Symbol of a stored currency label (`US Dollar: $` → `$`); ₹ when there is none. */
export function currencySymbolOf(currency: string | null | undefined): string {
    const symbol = (currency ?? '').split(':')[1]?.trim();
    return symbol || '₹';
}

let lineSeq = 0;
/** A client-side id for a new line (the API assigns the real one). */
export const newLineItemId = (): string => `line-${Date.now().toString(36)}-${(lineSeq++).toString(36)}`;

/** An empty line: quantity 1, nothing else entered (GST is picked, or comes with the product). */
export function newLineItem(): LineItem {
    return {
        id: newLineItemId(),
        productId: '',
        productName: '',
        quantity: 1,
        rate: 0,
        grossAmount: 0,
        discount: 0,
        discountType: DEFAULT_DISCOUNT_TYPE,
        discountAmount: 0,
        taxRate: '',
        taxableAmount: 0,
        description: '',
        note: '',
    };
}

/** A line with its computed amounts brought up to date (a percentage kept within 0–100, an amount within 0–Gross). */
export function computeLineItem(item: LineItem): LineItem {
    const discountType = toDiscountType(item.discountType);
    const discount = discountType === 'amount' ? Math.max(0, roundMoney(item.discount)) : clampDiscount(item.discount);
    return { ...item, discount, discountType, ...lineItemAmounts({ quantity: item.quantity, rate: item.rate, discount, discountType }) };
}

/**
 * Lines and totals from any stored shape (an API record, a converted opportunity, demo data): lines saved before
 * CRM-111 (`amount`, a per-unit `direct` discount, `GST 18%`) read as Rate, the amount the discount came to on the
 * line and `18%`. A missing discount type is a percentage.
 */
export function toLineItem(raw: Partial<LineItem> & Record<string, unknown>): LineItem {
    const legacyRate = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount) || 0;
    const rate = typeof raw.rate === 'number' ? raw.rate : Number(raw.rate ?? legacyRate) || 0;
    const quantity = Number(raw.quantity) || 1;
    let discount = Number(raw.discount) || 0;
    let discountType = toDiscountType(raw.discountType);
    if ((raw.discountType as string) === 'direct') {
        discount = roundMoney(discount * quantity);
        discountType = 'amount';
    }
    return computeLineItem({
        id: typeof raw.id === 'string' && raw.id ? raw.id : newLineItemId(),
        productId: typeof raw.productId === 'string' ? raw.productId : '',
        productName: typeof raw.productName === 'string' ? raw.productName : '',
        quantity,
        rate,
        grossAmount: 0,
        discount,
        discountType,
        discountAmount: 0,
        taxRate: normalizeTaxRate(typeof raw.taxRate === 'string' ? raw.taxRate : ''),
        taxableAmount: 0,
        description: typeof raw.description === 'string' ? raw.description : '',
        note: typeof raw.note === 'string' ? raw.note : '',
    });
}

/**
 * The totals of a set of lines, to the paisa: the lump sum comes off the Total Taxable Amount, GST is charged per rate
 * (IGST, or CGST + SGST, by `gstType`), then the Round Off (on unless `roundOff` is false).
 */
export function totalsOf(lineItems: readonly LineItem[], options: LineItemTotalsOptions = {}): LineItemTotals {
    return lineItemTotals(lineItems, options);
}

/** The editable Summary Breakdown values every record with line items starts with. */
export const DEFAULT_LINE_ITEM_SUMMARY: Pick<LineItemsValues, 'lumpSumDiscount' | 'roundOff'> = { lumpSumDiscount: 0, roundOff: true };

/** One row of a read-only Summary Breakdown (view page, drawers). */
export interface LineItemSummaryLine {
    key: string;
    label: string;
    amount: number;
    /** strong: a subtotal; minus: taken off; tax: a GST line; roundOff: signed; grand: the Grand Total. */
    tone: 'strong' | 'minus' | 'tax' | 'roundOff' | 'grand';
}

/**
 * A saved record's Summary Breakdown, in order: Total Taxable Amount, Lump Sum Discount (when there is one), Actual
 * (Before Tax), a GST line per rate, Round Off (while it is on) and the Grand Total. The record's saved totals are
 * shown (what lists and scorecards use); a missing one, and the per-rate GST lines, come from the lines.
 */
export function lineItemSummaryLines(value: Partial<LineItemsValues>, gstTypeOverride?: GstType | null): LineItemSummaryLine[] {
    const items = Array.isArray(value.lineItems) ? value.lineItems : [];
    if (items.length === 0) return [];
    const gstType = gstTypeOverride !== undefined ? gstTypeOverride : toGstType(value.gstType);
    const roundOff = toRoundOff(value.roundOff);
    const lumpSumDiscount = Number(value.lumpSumDiscount) || 0;
    const computed = lineItemSummary(items, { lumpSumDiscount, roundOff, gstType });
    const stored = (key: keyof LineItemTotals): number => (typeof value[key] === 'number' && Number.isFinite(value[key]) ? (value[key] as number) : computed[key]);
    const taxLines = computed.taxes.flatMap((row) => taxRowLines(row, gstType).map((line) => ({ key: `${line.key}-${row.rate}`, label: line.label, amount: line.amount, tone: 'tax' as const })));
    return [
        { key: 'subtotal', label: LINE_ITEM_TOTAL_LABELS.subtotal, amount: stored('subtotal'), tone: 'strong' },
        ...(lumpSumDiscount > 0 ? [{ key: 'lumpSumDiscount', label: LINE_ITEM_TOTAL_LABELS.lumpSumDiscount, amount: lumpSumDiscount, tone: 'minus' as const }] : []),
        { key: 'actualBeforeTax', label: LINE_ITEM_TOTAL_LABELS.actualBeforeTax, amount: stored('actualBeforeTax'), tone: 'strong' },
        ...(taxLines.length > 0 ? taxLines : [{ key: 'totalTax', label: `Add: ${gstType ? GST_TYPE_LABELS[gstType] : LINE_ITEM_TOTAL_LABELS.totalTax}`, amount: stored('totalTax'), tone: 'tax' as const }]),
        ...(roundOff ? [{ key: 'roundOffAmount', label: LINE_ITEM_TOTAL_LABELS.roundOffAmount, amount: stored('roundOffAmount'), tone: 'roundOff' as const }] : []),
        { key: 'grandTotal', label: LINE_ITEM_TOTAL_LABELS.grandTotal, amount: stored('grandTotal'), tone: 'grand' },
    ];
}

/** A summary line's amount as text: `− ₹100` taken off, `+ ₹0.18` / `− ₹0.03` round off, else the amount. */
export function summaryLineText(line: LineItemSummaryLine, money: (n: number) => string): string {
    if (line.tone === 'minus') return `− ${money(line.amount)}`;
    if (line.tone === 'roundOff') return roundOffText(line.amount, money);
    return money(line.amount);
}
