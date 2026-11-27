/**
 * Line item math shared by opportunities and quotations (Jira CRM-111). Pure: no database, no framework.
 *
 * Mirrored line for line in `frontend-crm/src/lib/line-items/lineItemMath.ts`, so the form, the drawer, the PDF and
 * the API agree to the paisa. Change both together.
 *
 * Per line:
 *   Gross Amount   = Quantity × Rate
 *   Discount       = a percentage of the Gross Amount, or a flat amount off the line (`discountType`), never more
 *                    than the Gross Amount (the line stores what was entered and the amount it comes to)
 *   Taxable Amount = Gross Amount − Discount
 *   GST            = Taxable Amount × the line's GST rate (not shown per line; summed into the totals)
 * Totals (whole rupees, as before):
 *   Gross Amount (totalAmount), Discount (totalDiscount), Taxable Amount (subtotal), GST (totalTax),
 *   Grand Total = Taxable Amount + GST − Lump Sum Discount
 */

/** Fallback options of the Product Catalog's Tax Rate dropdown (`product_tax_rate`), which line items use as GST. */
export const LINE_ITEM_TAX_RATES = ['0%', '5%', '12%', '18%', '28%'] as const;

/** How a line's Discount is entered: a percentage of the Gross Amount, or an amount off the line. */
export const LINE_ITEM_DISCOUNT_TYPES = ['percentage', 'amount'] as const;
export type LineItemDiscountType = (typeof LINE_ITEM_DISCOUNT_TYPES)[number];
export const DEFAULT_DISCOUNT_TYPE: LineItemDiscountType = 'percentage';

/** A stored or sent discount type; anything unknown (missing, older lines) reads as a percentage. */
export const toDiscountType = (value: unknown): LineItemDiscountType => (value === 'amount' ? 'amount' : 'percentage');

export interface LineItemMathInput {
    quantity: number;
    rate: number;
    /** Percentage of the Gross Amount (0–100), or an amount off the line, by `discountType`. */
    discount: number;
    /** `percentage` when missing. */
    discountType?: string | null;
    /** `18%` (a Tax Rate option of the Product Catalog). */
    taxRate: string;
}

export interface LineItemAmounts {
    grossAmount: number;
    discountAmount: number;
    taxableAmount: number;
}

export interface LineItemTotals {
    totalAmount: number;
    totalDiscount: number;
    subtotal: number;
    totalTax: number;
    grandTotal: number;
}

const finite = (value: unknown): number => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
};

/** Money to the paisa (2 decimals), rounding halves away from zero the same way in every engine. */
export const roundMoney = (value: number): number => Math.round((finite(value) + Number.EPSILON) * 100) / 100;

/** `18%`, `GST 18%`, `12.5 %` → 18 / 12.5; `--None--`, `` and anything without a percentage → 0. */
export function parseTaxRate(taxRate: string | null | undefined): number {
    const match = (taxRate ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? Number(match[1]) : 0;
}

/**
 * A stored or typed GST value in the Product Catalog's format: `GST 18%` → `18%` (the older line item format),
 * `--None--` → `0%`, a bare `18` → `18%`. Blank stays blank (the GST is then still to be picked).
 */
export function normalizeTaxRate(taxRate: string | null | undefined): string {
    const value = (taxRate ?? '').trim();
    if (!value) return '';
    if (value === '--None--') return '0%';
    const match = value.match(/(\d+(?:\.\d+)?)\s*%?/);
    return match ? `${Number(match[1])}%` : value;
}

/** A discount as a percentage of the Gross Amount, kept between 0 and 100. */
export const clampDiscount = (discount: number): number => Math.min(100, Math.max(0, finite(discount)));

/** Gross Amount, Discount (amount) and Taxable Amount of one line. An amount discount stops at the Gross Amount. */
export function lineItemAmounts(item: Pick<LineItemMathInput, 'quantity' | 'rate' | 'discount' | 'discountType'>): LineItemAmounts {
    const grossAmount = roundMoney(finite(item.quantity) * finite(item.rate));
    const discountAmount =
        toDiscountType(item.discountType) === 'amount'
            ? roundMoney(Math.min(grossAmount, Math.max(0, finite(item.discount))))
            : roundMoney((grossAmount * clampDiscount(item.discount)) / 100);
    return { grossAmount, discountAmount, taxableAmount: roundMoney(grossAmount - discountAmount) };
}

/** Document totals of the lines (whole rupees). */
export function lineItemTotals(items: readonly LineItemMathInput[], lumpSumDiscount: number): LineItemTotals {
    let gross = 0;
    let discount = 0;
    let taxable = 0;
    let tax = 0;
    for (const item of items) {
        const amounts = lineItemAmounts(item);
        gross += amounts.grossAmount;
        discount += amounts.discountAmount;
        taxable += amounts.taxableAmount;
        tax += (amounts.taxableAmount * parseTaxRate(item.taxRate)) / 100;
    }
    return {
        totalAmount: Math.round(gross),
        totalDiscount: Math.round(discount),
        subtotal: Math.round(taxable),
        totalTax: Math.round(tax),
        grandTotal: Math.round(Math.max(0, taxable + tax - finite(lumpSumDiscount))),
    };
}

/** A line nothing was entered on (no product, rate, discount, description or note): it is not saved. */
export function isBlankLineItem(item: { productName?: unknown; productId?: unknown; rate?: unknown; discount?: unknown; description?: unknown; note?: unknown }): boolean {
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    return !text(item.productName) && !text(item.productId) && !finite(item.rate) && !finite(item.discount) && !text(item.description) && !text(item.note);
}
