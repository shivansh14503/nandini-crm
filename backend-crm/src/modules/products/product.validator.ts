import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    createdWithinDaysQuery,
    csvQuery,
    customFieldsSchema,
    enumWithDefault,
    optionalAmountString,
    optionalPercentString,
    optionalText,
    requiredText,
} from '../../validators/common.js';

// Option lists from frontend-crm/src/types/product.types.ts (Product Category is open-ended there).
export const PRODUCT_TYPES = ['Product', 'Service', 'Bundle', 'Subscription', 'License', 'Other'] as const;
export const TAX_RATES = ['0%', '5%', '12%', '18%', '28%'] as const;

/** The fixed `product_status` options. Only Admins change a product's Status; only Active products go on new line items. */
export const PRODUCT_STATUSES = ['Active', 'Inactive'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const ACTIVE_PRODUCT_STATUS: ProductStatus = 'Active';
export const INACTIVE_PRODUCT_STATUS: ProductStatus = 'Inactive';
/** Longest Inactivity Reason (the Organizations one has the same limit). */
export const INACTIVITY_REASON_MAX_LENGTH = 500;
/** Whether a stored status is Active (ignoring case and spaces, as the default SQL Server collation compares). */
export const isActiveProductStatus = (status: string | null | undefined): boolean =>
    (status ?? '').trim().toLowerCase() === ACTIVE_PRODUCT_STATUS.toLowerCase();

/** `ProductFormData` (frontend-crm/src/validations/product.schema.ts) plus numeric checks on the price strings. */
export const productInputSchema = z
    .object({
        productName: requiredText('Product Name', L.organizationName).min(2, {
            message: 'Product Name must be at least 2 characters.',
        }),
        hsnCode: optionalText('HSN Code', L.hsn),
        // One option of the shared Product Category dropdown (shared_product_category), as on leads / opportunities.
        productCategory: optionalText('Product Category', L.option),
        // Type / tax rate are admin-customizable (product_* dropdown categories).
        type: optionalText('Type', 30),
        manufacturer: optionalText('Manufacturer', L.personName),
        taxRate: optionalText('Tax Rate', 10),
        discount: optionalPercentString('Discount'),
        cost: optionalAmountString('Cost'),
        mrp: optionalAmountString('MRP'),
        msp: optionalAmountString('MSP'),
        contractCreate: enumWithDefault('Contract Create', ['Yes', 'No'], 'No'),
        description: optionalText('Description', L.longText),
        termsAndConditions: optionalText('Terms and Conditions', L.longText),
        status: enumWithDefault('Status', PRODUCT_STATUSES, ACTIVE_PRODUCT_STATUS),
        /** Asked when a product is made Inactive; stored with the date and the admin (product.service.ts). */
        inactivityReason: optionalText('Inactivity Reason', INACTIVITY_REASON_MAX_LENGTH),
        customFields: customFieldsSchema,
    })
    .superRefine((product, ctx) => {
        if (product.msp !== undefined && product.mrp !== undefined && Number(product.msp) > Number(product.mrp)) {
            ctx.addIssue({ code: 'custom', path: ['msp'], message: 'MSP (minimum selling price) cannot exceed MRP.' });
        }
    });

export type ProductInput = z.infer<typeof productInputSchema>;

/** `GET /api/products/manufacturers`: names containing `search` (all when empty), at most `limit`. */
export const manufacturerQuerySchema = z.object({
    search: z.string().trim().max(100).optional().catch(undefined),
    limit: z.coerce.number().int().min(1).max(200).catch(50).default(50),
});

/** List filters on top of page / limit / search / sort. */
export const productListQuerySchema = z.object({
    productCategory: csvQuery,
    type: csvQuery,
    status: csvQuery,
    createdWithinDays: createdWithinDaysQuery,
    /** `used`: on at least one opportunity line item the viewer can see; `unused`: on none (product.usage.ts). */
    usage: z.enum(['used', 'unused']).optional(),
});

export const PRODUCT_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'productName',
    'productCode',
    'productCategory',
    'type',
    'manufacturer',
    'mrp',
    'cost',
] as const;
