import type { Prisma, Product } from '../../generated/prisma/client.js';
import { decimalToString, nullable, text, toIso } from '../../utils/mappers.js';
import type { ProductInput } from './product.validator.js';

/** `Product` from frontend-crm/src/types/product.types.ts (prices are strings there), plus `isActive`. */
export interface ProductDto {
    id: string;
    productCode: string;
    productName: string;
    hsnCode: string;
    category: string;
    type: string;
    manufacturer: string;
    taxType: string;
    taxRate: string;
    discount: string;
    cost: string;
    mrp: string;
    msp: string;
    contractCreate: string;
    description: string;
    termsAndConditions: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

export function toProductDto(row: Product): ProductDto {
    return {
        id: row.id,
        productCode: row.productCode,
        productName: row.productName,
        hsnCode: text(row.hsnCode),
        category: text(row.category),
        type: text(row.type),
        manufacturer: text(row.manufacturer),
        taxType: text(row.taxType),
        taxRate: text(row.taxRate),
        discount: decimalToString(row.discount),
        cost: decimalToString(row.cost),
        mrp: decimalToString(row.mrp),
        msp: decimalToString(row.msp),
        contractCreate: row.contractCreate,
        description: text(row.description),
        termsAndConditions: text(row.termsAndConditions),
        isActive: row.isActive,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
    };
}

/** Writable columns from validated input (codes and audit columns are set by the service). */
export function toProductData(input: ProductInput): Omit<Prisma.ProductUncheckedCreateInput, 'productCode' | 'createdBy'> {
    return {
        productName: input.productName,
        hsnCode: nullable(input.hsnCode),
        category: nullable(input.category),
        type: input.type ?? null,
        manufacturer: nullable(input.manufacturer),
        taxType: input.taxType,
        taxRate: input.taxRate ?? null,
        discount: input.discount ?? null,
        cost: input.cost ?? null,
        mrp: input.mrp ?? null,
        msp: input.msp ?? null,
        contractCreate: input.contractCreate,
        description: nullable(input.description),
        termsAndConditions: nullable(input.termsAndConditions),
        isActive: input.isActive,
    };
}
