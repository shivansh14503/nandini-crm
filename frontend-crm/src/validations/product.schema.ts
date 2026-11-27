import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { ACTIVE_PRODUCT_STATUS, PRODUCT_STATUSES } from '../types/product.types';
import { customFieldsSchema, optionalLongText, optionalString, optionalText, requiredText } from './common';

export const productFormSchema = z.object({
    productName: requiredText('Product Name', L.organizationName)
        .min(2, { message: 'Product Name must be at least 2 characters.' }),
    hsnCode: optionalText('HSN Code', L.hsn),
    productCategory: optionalString,
    type: optionalString,
    manufacturer: optionalText('Manufacturer', L.personName),
    taxRate: optionalString,
    discount: optionalString,
    cost: optionalString,
    mrp: optionalString,
    msp: optionalString,
    contractCreate: optionalString.default('No'),
    description: optionalLongText,
    termsAndConditions: optionalLongText,
    /** Admin only; the deactivation dialog collects the reason (required for Inactive by the API). */
    status: z.enum(PRODUCT_STATUSES).default(ACTIVE_PRODUCT_STATUS),
    inactivityReason: optionalLongText,

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
});

export type ProductFormSchemaType = z.infer<typeof productFormSchema>;
