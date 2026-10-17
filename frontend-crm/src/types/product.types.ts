// ─── Product Catalog Types ─────────────────────────────────────────────────────

export type ProductCategory =
    | 'Hardware'
    | 'Software'
    | 'Networking'
    | 'Storage'
    | 'Security'
    | 'Cloud Services'
    | 'Peripherals'
    | 'Consumables'
    | 'AMC / Service'
    | 'Other';

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
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}
