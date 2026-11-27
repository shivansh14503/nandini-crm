
// ─── Product Catalog Types ─────────────────────────────────────────────────────

/** One option of the shared Product Category dropdown (`shared_product_category`), as on leads / opportunities. */
export type ProductCategory = string;

export type ProductType =
    | 'Product'
    | 'Software'
    | 'Service'
    | 'Bundle'
    | 'Subscription'
    | 'License'
    | 'Other';

export type TaxRate =
    | '0%'
    | '5%'
    | '12%'
    | '18%'
    | '28%';

/** Options of the fixed `product_status` dropdown. Only Admins change a product's Status. */
export const PRODUCT_STATUSES = ['Active', 'Inactive'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const ACTIVE_PRODUCT_STATUS: ProductStatus = 'Active';
export const INACTIVE_PRODUCT_STATUS: ProductStatus = 'Inactive';
/** Dropdown category of the product Status. */
export const PRODUCT_STATUS_CATEGORY = 'product_status';
/**
 * Whether a product is Active (ignoring case and spaces). Only Active products are offered in line item pickers;
 * a product read without a Status (an older cached copy) counts as Active.
 */
export const isActiveProduct = (p: { status?: string | null } | null | undefined): boolean =>
    !p?.status || p.status.trim().toLowerCase() === ACTIVE_PRODUCT_STATUS.toLowerCase();

export interface ProductFormData {
    /** Admin-defined custom field values, keyed by FormFieldDefinition.fieldKey. */
    customFields?: Record<string, unknown>;

    productName: string;
    hsnCode: string;
    productCategory: ProductCategory | '';
    type: ProductType | '';
    manufacturer: string;
    taxRate: TaxRate | '';
    discount: string;
    cost: string;
    mrp: string;
    msp: string;
    contractCreate: string;
    description: string;
    termsAndConditions: string;
    /** Active / Inactive. Admin only; Inactive needs `inactivityReason`. */
    status: ProductStatus;
    /** Asked by the deactivation dialog; set by the system (not a form input). */
    inactivityReason: string;
}

/**
 * Opportunities whose line items carry the product (quotations don't count), each counted once, among those the
 * viewer can see. won + lost + open = total; open is every stage but Closed Won / Closed Lost.
 */
export interface ProductUsage {
    total: number;
    won: number;
    lost: number;
    open: number;
}

/** A Manufacturer already used in the catalog (GET /api/products/manufacturers). */
export interface ManufacturerSuggestion {
    name: string;
    /** Live products carrying it. */
    products: number;
}

export interface Product extends ProductFormData {
    id: string;
    productCode: string;
    /** While Inactive: when (ISO instant) and by whom (username) it was made Inactive. Empty while Active. */
    inactiveSince?: string;
    inactivatedBy?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
    /** Sent with list and detail reads (not with global search results). */
    usage?: ProductUsage;
}
