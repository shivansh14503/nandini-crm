import type { LineItem, LineItemsValues } from '@/types/lineItem.types';
import { clampDiscount, DEFAULT_DISCOUNT_TYPE, lineItemAmounts, lineItemTotals, normalizeTaxRate, roundMoney, toDiscountType, type LineItemDiscountType } from './lineItemMath';

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

/** Record totals. `subtotal` is the Taxable Amount and `totalTax` the GST. */
export const LINE_ITEM_TOTAL_LABELS = {
    totalAmount: 'Gross Amount',
    totalDiscount: 'Discount',
    lumpSumDiscount: 'Lump Sum Discount',
    subtotal: 'Taxable Amount',
    totalTax: 'GST',
    grandTotal: 'Grand Total',
} as const;

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

/** The totals of a set of lines (whole rupees), with the lump sum discount taken off the Grand Total. */
export function totalsOf(lineItems: readonly LineItem[], lumpSumDiscount: number): Required<Omit<LineItemsValues, 'currency' | 'lineItems' | 'lumpSumDiscount'>> {
    return lineItemTotals(lineItems, lumpSumDiscount);
}
