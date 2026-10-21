import { z } from 'zod';
import {
    requiredString,
    optionalString,
} from './common';

export const productFormSchema = z.object({
    productName: requiredString('Product Name')
        .min(2, { message: 'Product Name must be at least 2 characters.' }),
    hsnCode: optionalString,
    category: optionalString,
    type: optionalString,
    manufacturer: optionalString,
    taxType: optionalString.default('GST'),
    taxRate: optionalString,
    discount: optionalString,
    cost: optionalString,
    mrp: optionalString,
    msp: optionalString,
    contractCreate: optionalString.default('No'),
    description: optionalString,
    termsAndConditions: optionalString,
});

export type ProductFormSchemaType = z.infer<typeof productFormSchema>;
