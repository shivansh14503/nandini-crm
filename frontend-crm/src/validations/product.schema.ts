import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    optionalString,
    requiredText,
    optionalText,
} from './common';

export const productFormSchema = z.object({
    productName: requiredText('Product Name', L.organizationName)
        .min(2, { message: 'Product Name must be at least 2 characters.' }),
    hsnCode: optionalText('HSN Code', L.hsn),
    category: optionalString,
    type: optionalString,
    manufacturer: optionalText('Manufacturer', L.personName),
    taxType: optionalString.default('GST'),
    taxRate: optionalString,
    discount: optionalString,
    cost: optionalString,
    mrp: optionalString,
    msp: optionalString,
    contractCreate: optionalString.default('No'),
    description: optionalText('Description', L.longText),
    termsAndConditions: optionalText('Terms and Conditions', L.longText),
});

export type ProductFormSchemaType = z.infer<typeof productFormSchema>;
