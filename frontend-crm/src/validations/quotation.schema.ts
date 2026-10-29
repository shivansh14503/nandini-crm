import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
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
    description: optionalText('Line item description', L.longText),
    note: optionalText('Line item note', L.longText),
});

export const quotationFormSchema = z.object({
    // ── Tab 1: Overview ───────────────────────────────────────────
    quotationTitle: requiredText('Quotation Title', L.title),
    quoteStage: z.enum(QUOTE_STAGES as [string, ...string[]]).default('Draft'),
    quotationDate: requiredString('Quotation Date'),
    validUntil: requiredString('Valid Until Date'),
    remarks: optionalText('Remarks', L.longText),
    termsAndCondition: requiredString('Terms & Condition'),
    termsAndConditionDescription: optionalText('Terms & Condition Description', L.longText),
    assignedTo: requiredString('Assigned Representative'),

    opportunityName: requiredString('Opportunity Name'),
    company: requiredString('Company'),
    validationPeriod: requiredString('Validation Period'),
    otherRef: optionalText('Other Ref.', L.shortText),
    paymentTerms: requiredString('Payment Terms'),
    paymentTermsDescription: optionalText('Payment Terms Description', L.longText),
    preparedFor: requiredString('Prepared For'),

    // ── Tab 2: Line Items ─────────────────────────────────────────
    currency: optionalString.default('Indian Rupee: ₹'),
    groupName: optionalText('Group Name', L.shortText).default('Software Licenses & Add-ons'),
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
    organizationName: optionalText('Organization', L.organizationName),
    organizationId: optionalString,
    contactName: requiredText('Contact Name', L.personName),
    contactId: optionalString,
    contactMobile: zodPhoneOptional,
    mailingName: optionalText('Mailing Name', L.organizationName),
    gstNo: zodGstOptional,
    contactEmail: zodEmailOptional,

    billingAddress: requiredText('Street / Billing Address', L.address),
    billingCity: requiredText('City', L.shortText),
    billingState: requiredText('State / Region', L.shortText),
    billingPostalCode: zodPostalCode,
    billingCountry: requiredString('Country').default('India'),

    shippingAddress: optionalText('Shipping Street', L.address),
    shippingCity: optionalText('Shipping City', L.shortText),
    shippingState: optionalText('Shipping State', L.shortText),
    shippingPostalCode: zodPostalCodeOptional,
    shippingCountry: optionalString,
    copyAddressFromBilling: z.boolean().default(true),

    // ── Context & Compatibility Aliases ───────────────────────────
    opportunityId: optionalString,
    opportunityCode: optionalString,
    status: optionalString,
    quoteDate: optionalString,
    quotationSubject: optionalText('Quotation Subject', L.title),
    contactNumber: zodPhoneOptional,
    emailAddress: zodEmailOptional,
    notes: optionalText('Internal Notes', L.longText),
    termsAndConditions: optionalText('Terms and Conditions', L.longText),
}).superRefine((data, ctx) => {
    refinePostalCodeForCountry(ctx, 'billingPostalCode', data.billingPostalCode, data.billingCountry, true);
    // An empty shipping country falls back to the billing country.
    refinePostalCodeForCountry(ctx, 'shippingPostalCode', data.shippingPostalCode, data.shippingCountry || data.billingCountry);
});

export type QuotationFormSchemaType = z.infer<typeof quotationFormSchema>;
