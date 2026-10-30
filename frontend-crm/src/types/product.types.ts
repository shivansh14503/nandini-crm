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

export interface Product extends ProductFormData {
    id: string;
    productCode: string;
    isActive?: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}
