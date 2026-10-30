import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    enumWithDefault,
    optionalAmountString,
    optionalEnum,
    optionalPercentString,
    optionalText,
    requiredText,
} from '../../validators/common.js';

// Option lists from frontend-crm/src/types/product.types.ts (category is open-ended there).
export const PRODUCT_TYPES = ['Product', 'Service', 'Bundle', 'Subscription', 'License', 'Other'] as const;
export const TAX_TYPES = ['GST', 'IGST', 'None'] as const;
export const TAX_RATES = ['0%', '5%', '12%', '18%', '28%'] as const;

/** `ProductFormData` (frontend-crm/src/validations/product.schema.ts) plus numeric checks on the price strings. */
export const productInputSchema = z
    .object({
        productName: requiredText('Product Name', L.organizationName).min(2, {
            message: 'Product Name must be at least 2 characters.',
        }),
        hsnCode: optionalText('HSN Code', L.hsn),
        category: optionalText('Category', L.option),
        type: optionalEnum('Type', PRODUCT_TYPES),
        manufacturer: optionalText('Manufacturer', L.personName),
        taxType: enumWithDefault('Tax Type', TAX_TYPES, 'GST'),
        taxRate: optionalEnum('Tax Rate', TAX_RATES),
        discount: optionalPercentString('Discount'),
        cost: optionalAmountString('Cost'),
        mrp: optionalAmountString('MRP'),
        msp: optionalAmountString('MSP'),
        contractCreate: enumWithDefault('Contract Create', ['Yes', 'No'], 'No'),
        description: optionalText('Description', L.longText),
        termsAndConditions: optionalText('Terms and Conditions', L.longText),
        isActive: z.boolean().default(true),
    })
    .superRefine((product, ctx) => {
        if (product.msp !== undefined && product.mrp !== undefined && Number(product.msp) > Number(product.mrp)) {
            ctx.addIssue({ code: 'custom', path: ['msp'], message: 'MSP (minimum selling price) cannot exceed MRP.' });
        }
    });

export type ProductInput = z.infer<typeof productInputSchema>;

/** List filters on top of page / limit / search / sort. */
export const productListQuerySchema = z.object({
    category: csvQuery,
    type: csvQuery,
    isActive: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const PRODUCT_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'productName',
    'productCode',
    'category',
    'type',
    'manufacturer',
    'mrp',
    'cost',
] as const;
