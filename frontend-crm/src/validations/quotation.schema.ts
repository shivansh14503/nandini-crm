import { z } from 'zod';
import {
    requiredString,
    optionalString,
    phoneSchema,
    pinCodeSchema,
    requiredPinCodeSchema,
    emailSchema,
    gstSchema,
    nonNegativeNumber,
    amountSchema,
    quantitySchema,
} from './common';
import { QUOTE_STAGES } from '../types/quotation.types';

export const quotationLineItemSchema = z.object({
    id: z.string(),
    productId: optionalString,
    productName: requiredString('Product Name'),
    quantity: quantitySchema,
    amount: amountSchema,
    discount: nonNegativeNumber('Discount').default(0),
    discountType: z.enum(['percentage', 'direct']).default('percentage'),
    salePrice: nonNegativeNumber('Sale Price').default(0),
    taxRate: z.string().default('GST 18%'),
    taxAmount: nonNegativeNumber('Tax Amount').default(0),
    total: nonNegativeNumber('Total').default(0),
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
    lumpSumDiscount: nonNegativeNumber('Lump Sum Discount').default(0),
    totalAmount: nonNegativeNumber('Total Amount').default(0),
    totalDiscount: nonNegativeNumber('Total Discount').default(0),
    subtotal: nonNegativeNumber('Subtotal').default(0),
    totalTax: nonNegativeNumber('Total Tax').default(0),
    grandTotal: nonNegativeNumber('Grand Total').default(0),

    // ── Tab 3: Address Information ────────────────────────────────
    organizationName: optionalString,
    organizationId: optionalString,
    contactName: requiredString('Contact Name'),
    contactId: optionalString,
    contactMobile: phoneSchema('Contact Mobile').optional().or(z.literal('')),
    mailingName: optionalString,
    gstNo: gstSchema.optional().or(z.literal('')),
    contactEmail: emailSchema.optional().or(z.literal('')),

    billingAddress: requiredString('Street / Billing Address'),
    billingCity: requiredString('City'),
    billingState: requiredString('State / Region'),
    billingPostalCode: requiredPinCodeSchema('Billing Postal / PIN code'),
    billingCountry: requiredString('Country').default('India'),

    shippingAddress: optionalString,
    shippingCity: optionalString,
    shippingState: optionalString,
    shippingPostalCode: pinCodeSchema.optional().or(z.literal('')),
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
