// ─── Product Catalog Types ─────────────────────────────────────────────────────

export type ProductCategory =
    | 'Acronis'
    | 'Biz Analyst'
    | 'Connect 21'
    | 'CredFlow'
    | 'CRM'
    | 'Data Warehouse'
    | 'Tally AMC'
    | 'Tally Customization'
    | 'Tally On Cloud'
    | 'Tally Service'
    | 'Tally Software Service (TSS)'
    | 'Tally Training'
    | 'Tally Upgrade'
    | 'TallyPrime'
    | 'TallyPrime Server'
    | 'Teramind'
    | 'TVU'
    // Open fallback keeps legacy stored/mock values compiling.
    | (string & Record<never, never>);

export type ProductType =
    | 'Product'
    | 'Service'
    | 'Bundle'
    | 'Subscription'
    | 'License'
    | 'Other';

export type TaxType = 'GST' | 'IGST' | 'None';

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
    category: ProductCategory | '';
    type: ProductType | '';
    manufacturer: string;
    taxType: TaxType | '';
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
