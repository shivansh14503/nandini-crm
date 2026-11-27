import type { Theme } from './document/schema.js';

/**
 * Shared types of the PDF module. Module-specific code lives only in `fieldRegistry.ts` and
 * `contexts/<module>Context.ts`; everything else works for any entry of PDF_MODULES.
 */

export const PDF_MODULES = ['QUOTATION'] as const;
export type PdfModule = (typeof PDF_MODULES)[number];

export const PAGE_SIZES = ['A4', 'Letter', 'Legal'] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** Millimetres. `header` / `footer` offset the header/footer content from the page edge. */
export interface PdfMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
    header: number;
    footer: number;
}

export type PdfFieldGroup =
    | 'Company'
    | 'Customer'
    | 'Billing Address'
    | 'Shipping Address'
    | 'Quotation'
    | 'Sales Person'
    | 'Totals'
    | 'Terms'
    | 'Custom Fields';

export type PdfFieldType = 'text' | 'date' | 'currency' | 'number' | 'multiline' | 'boolean' | 'image';

export interface PdfFieldDefinition {
    /** Stable key. */
    key: string;
    /** Context path, e.g. `quotation.code`. */
    path: string;
    label: string;
    group: PdfFieldGroup;
    type: PdfFieldType;
    defaultVisible: boolean;
}

export interface LineItemColumnDefinition {
    key: string;
    label: string;
    defaultVisible: boolean;
    align: 'left' | 'right' | 'center';
    widthPct?: number;
}

/** Everything a template (or the Fields panel) needs to know about a module. */
export interface PdfFieldRegistry {
    module: PdfModule;
    fields: PdfFieldDefinition[];
    lineItemColumns: LineItemColumnDefinition[];
}

// ─── Render context (plain DTO handed to the document renderer; never Prisma objects) ─────

export interface PdfAddress {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    /** Non-empty parts joined with ", " (street on its own line). */
    full: string;
}

export interface PdfLineItem {
    srNo: number;
    productName: string;
    description: string;
    note: string;
    quantity: number;
    quantityFormatted: string;
    rate: number;
    rateFormatted: string;
    grossAmount: number;
    grossAmountFormatted: string;
    /** As entered: a percentage of the Gross Amount, or an amount off the line (`discountType`). */
    discount: number;
    discountType: 'percentage' | 'amount';
    discountAmount: number;
    /** `10%` for a percentage, the money for an amount (or `-` when none). */
    discountFormatted: string;
    discountAmountFormatted: string;
    /** GST: `18%`. */
    taxRate: string;
    taxableAmount: number;
    taxableAmountFormatted: string;
}

export interface PdfContext {
    company: Omit<Theme, 'accentColor' | 'textColor' | 'fontSize' | 'lineHeight'> & { logoDataUri: string };
    record: Record<string, unknown>;
    customer: Record<string, unknown>;
    billing: PdfAddress;
    shipping: PdfAddress;
    salesPerson: { fullName: string; phone: string; email: string; username: string };
    lineItems: PdfLineItem[];
    totals: Record<string, unknown>;
    terms: Record<string, unknown>;
    custom: Record<string, string>;
    /** Non-empty custom fields in form order. */
    customList: { key: string; label: string; value: string }[];
        currency: string;
    meta: { generatedAt: string; generatedBy: string };
    /** Module-specific alias of `record` (e.g. `quotation`). */
    [moduleAlias: string]: unknown;
}

export interface RenderMeta {
    templateId: string;
    recordId?: string;
}
