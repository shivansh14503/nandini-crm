import { z } from 'zod';
import {
    requiredString,
    optionalString,
    zodPhoneOptional,
    zodPostalCode,
    zodPostalCodeOptional,
    refinePostalCodeForCountry,
    zodEmailOptional,
    zodGstOptional,
    zodAmount,
    quantitySchema,
} from './common';
import { QUOTE_STAGES } from '../types/quotation.types';

export const quotationLineItemSchema = z.object({
    id: z.string(),
    productId: optionalString,
    productName: requiredString('Product Name'),
    quantity: quantitySchema,
    amount: zodAmount,
    discount: zodAmount.default(0),
    discountType: z.enum(['percentage', 'direct']).default('percentage'),
    salePrice: zodAmount.default(0),
    taxRate: z.string().default('GST 18%'),
    taxAmount: zodAmount.default(0),
    total: zodAmount.default(0),
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
    lumpSumDiscount: zodAmount.default(0),
    totalAmount: zodAmount.default(0),
    totalDiscount: zodAmount.default(0),
    subtotal: zodAmount.default(0),
    totalTax: zodAmount.default(0),
    grandTotal: zodAmount.default(0),

    // ── Tab 3: Address Information ────────────────────────────────
    organizationName: optionalString,
    organizationId: optionalString,
    contactName: requiredString('Contact Name'),
    contactId: optionalString,
    contactMobile: zodPhoneOptional,
    mailingName: optionalString,
    gstNo: zodGstOptional,
    contactEmail: zodEmailOptional,

    billingAddress: requiredString('Street / Billing Address'),
    billingCity: requiredString('City'),
    billingState: requiredString('State / Region'),
    billingPostalCode: zodPostalCode,
    billingCountry: requiredString('Country').default('India'),

    shippingAddress: optionalString,
    shippingCity: optionalString,
    shippingState: optionalString,
    shippingPostalCode: zodPostalCodeOptional,
    shippingCountry: optionalString,
    copyAddressFromBilling: z.boolean().default(true),

    // ── Context & Compatibility Aliases ───────────────────────────
    opportunityId: optionalString,
    opportunityCode: optionalString,
    status: optionalString,
    quoteDate: optionalString,
    quotationSubject: optionalString,
    contactNumber: zodPhoneOptional,
    emailAddress: zodEmailOptional,
    notes: optionalString,
    termsAndConditions: optionalString,
}).superRefine((data, ctx) => {
    refinePostalCodeForCountry(ctx, 'billingPostalCode', data.billingPostalCode, data.billingCountry, true);
    // An empty shipping country falls back to the billing country.
    refinePostalCodeForCountry(ctx, 'shippingPostalCode', data.shippingPostalCode, data.shippingCountry || data.billingCountry);
});

export type QuotationFormSchemaType = z.infer<typeof quotationFormSchema>;
