import type { Prisma, Product } from '../../generated/prisma/client.js';
import { decimalToString, nullable, parseCustomFields, serializeCustomFields, text, toIso } from '../../utils/mappers.js';
import type { ProductInput } from './product.validator.js';
import type { ProductUsage } from './product.usage.js';

/** `Product` from frontend-crm/src/types/product.types.ts (prices are strings there). */
export interface ProductDto {
    id: string;
    productCode: string;
    productName: string;
    hsnCode: string;
    productCategory: string;
    type: string;
    manufacturer: string;
    taxRate: string;
    discount: string;
    cost: string;
    mrp: string;
    msp: string;
    contractCreate: string;
    description: string;
    termsAndConditions: string;
    /** Active / Inactive (the fixed `product_status` dropdown). */
    status: string;
    /** While Inactive: the reason the admin gave, when (ISO instant) and who (username). Empty while Active. */
    inactivityReason: string;
    inactiveSince: string;
    inactivatedBy: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    /** Username of the last editor; empty until the record is first modified. */
    updatedBy: string;
    /** Admin-defined custom field values keyed by FormFieldDefinition.fieldKey. */
    customFields: Record<string, unknown>;
    /** Opportunities using the product (list and detail reads only; see product.usage.ts). */
    usage?: ProductUsage;
}

export function toProductDto(row: Product): ProductDto {
    return {
        id: row.id,
        productCode: row.productCode,
        productName: row.productName,
        hsnCode: text(row.hsnCode),
        productCategory: text(row.productCategory),
        type: text(row.type),
        manufacturer: text(row.manufacturer),
        taxRate: text(row.taxRate),
        discount: decimalToString(row.discount),
        cost: decimalToString(row.cost),
        mrp: decimalToString(row.mrp),
        msp: decimalToString(row.msp),
        contractCreate: row.contractCreate,
        description: text(row.description),
        termsAndConditions: text(row.termsAndConditions),
        status: row.status,
        inactivityReason: text(row.inactivityReason),
        inactiveSince: row.inactiveSince ? toIso(row.inactiveSince) : '',
        inactivatedBy: text(row.inactivatedBy),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        customFields: parseCustomFields(row.customDataJson),
    };
}

/**
 * Writable columns from validated input (codes and audit columns are set by the service, and so are the Status
 * columns: see `productStatusData` in product.service.ts).
 */
export function toProductData(input: ProductInput): Omit<Prisma.ProductUncheckedCreateInput, 'productCode' | 'createdBy' | 'status' | 'inactivityReason' | 'inactiveSince' | 'inactivatedBy'> {
    return {
        customDataJson: serializeCustomFields(input.customFields),
        productName: input.productName,
        hsnCode: nullable(input.hsnCode),
        productCategory: nullable(input.productCategory),
        type: input.type ?? null,
        manufacturer: nullable(input.manufacturer),
        taxRate: input.taxRate ?? null,
        discount: input.discount ?? null,
        cost: input.cost ?? null,
        mrp: input.mrp ?? null,
        msp: input.msp ?? null,
        contractCreate: input.contractCreate,
        description: nullable(input.description),
        termsAndConditions: nullable(input.termsAndConditions),
    };
}
