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

export const TEMPLATE_PARTS = ['header', 'body', 'footer'] as const;
export type TemplatePart = (typeof TEMPLATE_PARTS)[number];

/** Millimetres. `header` / `footer` offset the header/footer content from the page edge. */
export interface PdfMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
    header: number;
    footer: number;
}

export const DEFAULT_MARGINS: PdfMargins = { top: 45, right: 10, bottom: 16, left: 10, header: 0, footer: 5 };

export interface LineItemColumnSetting {
    key: string;
    label: string;
    visible: boolean;
    order: number;
    widthPct?: number;
}

export interface FieldVisibility {
    fields: Record<string, boolean>;
    lineItemColumns: LineItemColumnSetting[];
}

export interface Branding {
    accentColor: string;
    logoAssetKey?: string;
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyEmail: string;
    companyGstin: string;
    companyWebsite: string;
}

export const DEFAULT_BRANDING: Branding = {
    accentColor: '#1d4ed8',
    companyName: 'Nandini Infosys Pvt. Ltd.',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyGstin: '',
    companyWebsite: '',
};

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

export type PdfFieldType = 'text' | 'date' | 'currency' | 'number' | 'multiline' | 'boolean';

export interface PdfFieldDefinition {
    /** Visibility key (`show.<key>` in templates). */
    key: string;
    /** Handlebars path, e.g. `quotation.code`. */
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

// ─── Render context (plain DTO handed to Handlebars; never Prisma objects) ─────

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
    amount: number;
    amountFormatted: string;
    discount: number;
    discountType: string;
    discountFormatted: string;
    salePrice: number;
    salePriceFormatted: string;
    taxRate: string;
    taxAmount: number;
    taxAmountFormatted: string;
    total: number;
    totalFormatted: string;
}

export interface PdfColumn {
    key: string;
    label: string;
    align: 'left' | 'right' | 'center';
    widthPct?: number;
}

export interface PdfContext {
    company: Branding & { logoDataUri: string };
    record: Record<string, unknown>;
    customer: Record<string, unknown>;
    billing: PdfAddress;
    shipping: PdfAddress;
    salesPerson: { fullName: string; phone: string; email: string; username: string };
    lineItems: PdfLineItem[];
    totals: Record<string, unknown>;
    terms: Record<string, unknown>;
    custom: Record<string, string>;
    /** Visible, non-empty custom fields in form order (for `{{#each customList}}`). */
    customList: { key: string; label: string; value: string }[];
    /** Flattened visibility map read by `{{#ifShow "key"}}` and `show.key`. */
    show: Record<string, boolean>;
    /** Visible line-item columns in display order. */
    columns: PdfColumn[];
    currency: string;
    meta: { generatedAt: string; generatedBy: string };
    /** Module-specific alias of `record` (e.g. `quotation`). */
    [moduleAlias: string]: unknown;
}

export interface RenderMeta {
    templateId: string;
    recordId?: string;
}
