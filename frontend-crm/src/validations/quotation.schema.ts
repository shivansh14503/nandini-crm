import { z } from 'zod';
import {
    requiredString,
    optionalString,
} from './common';
import { QUOTE_STAGES } from '../types/quotation.types';

export const quotationLineItemSchema = z.object({
    id: z.string(),
    productId: optionalString,
    productName: requiredString('Product Name'),
    quantity: z.number().min(1, { message: 'Quantity must be at least 1.' }),
    amount: z.number().min(0, { message: 'Amount must be a non-negative number.' }),
    discount: z.number().min(0).default(0),
    discountType: z.enum(['percentage', 'direct']).default('percentage'),
    salePrice: z.number().min(0).default(0),
    taxRate: z.string().default('GST 18%'),
    taxAmount: z.number().min(0).default(0),
    total: z.number().min(0).default(0),
    description: optionalString,
    note: optionalString,
});

export const quotationFormSchema = z.object({
    // ── Tab 1: Overview ───────────────────────────────────────────
    quotationTitle: requiredString('Quotation Title'),
    quoteStage: z.enum(QUOTE_STAGES as [string, ...string[]]).default('Draft'),
    quotationDate: requiredString('Quotation Date'),
    validUntil: requiredString('Valid Until Date'),
    remarks: optionalString,
    termsAndCondition: requiredString('Terms & Condition'),
    termsAndConditionDescription: optionalString,
    assignedTo: requiredString('Assigned Representative'),

    opportunityName: requiredString('Opportunity Name'),
    company: requiredString('Company'),
    validationPeriod: requiredString('Validation Period'),
    otherRef: optionalString,
    paymentTerms: requiredString('Payment Terms'),
    paymentTermsDescription: optionalString,
    preparedFor: requiredString('Prepared For'),

    // ── Tab 2: Line Items ─────────────────────────────────────────
    currency: optionalString.default('Indian Rupee: ₹'),
    groupName: optionalString.default('Software Licenses & Add-ons'),
    lineItems: z
        .array(quotationLineItemSchema)
        .min(1, { message: 'At least one line item is required to create a quotation.' }),
    lumpSumDiscount: z.number().min(0).default(0),
    totalAmount: z.number().min(0).default(0),
    totalDiscount: z.number().min(0).default(0),
    subtotal: z.number().min(0).default(0),
    totalTax: z.number().min(0).default(0),
    grandTotal: z.number().min(0).default(0),

    // ── Tab 3: Address Information ────────────────────────────────
    organizationName: optionalString,
    organizationId: optionalString,
    contactName: requiredString('Contact Name'),
    contactId: optionalString,
    contactMobile: optionalString,
    mailingName: optionalString,
    gstNo: optionalString,
    contactEmail: optionalString,

    billingAddress: requiredString('Street / Billing Address'),
    billingCity: requiredString('City'),
    billingState: requiredString('State / Region'),
    billingPostalCode: z
        .string()
        .trim()
        .min(1, { message: 'Billing Postal / PIN code is required.' })
        .refine((val) => /^[1-9][0-9]{5}$/.test(val), {
            message: 'Billing Postal PIN code must be a valid 6-digit number.',
        }),
    billingCountry: requiredString('Country').default('India'),

    shippingAddress: optionalString,
    shippingCity: optionalString,
    shippingState: optionalString,
    shippingPostalCode: optionalString,
    shippingCountry: optionalString,
    copyAddressFromBilling: z.boolean().default(true),

    // ── Context & Compatibility Aliases ───────────────────────────
    opportunityId: optionalString,
    opportunityCode: optionalString,
    status: optionalString,
    quoteDate: optionalString,
    quotationSubject: optionalString,
    contactNumber: optionalString,
    emailAddress: optionalString,
    notes: optionalString,
    termsAndConditions: optionalString,
});

export type QuotationFormSchemaType = z.infer<typeof quotationFormSchema>;
