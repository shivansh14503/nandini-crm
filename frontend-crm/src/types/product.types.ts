// ─── Product Catalog Types ─────────────────────────────────────────────────────

/** One option of the shared Product Category dropdown (`shared_product_category`), as on leads / opportunities. */
export type ProductCategory = string;

export type ProductType =
    | 'Product'
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
    isActive?: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
    /** Sent with list and detail reads (not with global search results). */
    usage?: ProductUsage;
}
