import type { GstType, LineItemDiscountType } from '@/lib/line-items/lineItemMath';

/**
 * One line of an opportunity's or a quotation's Line Items (Jira CRM-111): the same fields, labels and API keys
 * everywhere (forms, view pages, drawers, PDF). See lib/line-items for the math and labels.
 */
export interface LineItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    /** The product's MRP; typed only for products without one. */
    rate: number;
    /** Quantity × Rate (computed). */
    grossAmount: number;
    /** What was entered: a percentage of the Gross Amount (0–100) or an amount off the line, by `discountType`. */
    discount: number;
    /** `percentage` (the default) or `amount`. */
    discountType: LineItemDiscountType;
    /** What the Discount comes to (computed). */
    discountAmount: number;
    /** GST: an option of the Product Catalog's Tax Rate dropdown (`18%`). */
    taxRate: string;
    /** Gross Amount − Discount (computed). */
    taxableAmount: number;
    description?: string;
    note?: string;
}

/** Line items and the record totals, as stored on opportunities and quotations. */
export interface LineItemsValues {
    /** Quotations only: the quotation's currency (`Indian Rupee: ₹`). Opportunities have none (always ₹). */
    currency?: string;
    lineItems: LineItem[];
    /** Taken off the Total Taxable Amount, before GST. */
    lumpSumDiscount: number;
    /** The Round Off checkbox (on by default): rounds the Grand Total to the nearest rupee, 0.50 up. */
    roundOff?: boolean;
    /** Gross Amount. */
    totalAmount?: number;
    /** Discount. */
    totalDiscount?: number;
    /** Total Taxable Amount. */
    subtotal?: number;
    /** Actual (Before Tax): Total Taxable Amount − Lump Sum Discount. */
    actualBeforeTax?: number;
    /** GST (all rates, IGST or CGST + SGST). */
    totalTax?: number;
    /** IGST or CGST_SGST as saved; null = plain GST (no company state then). Set by the API. */
    gstType?: GstType | null;
    roundOffAmount?: number;
    grandTotal?: number;
}
