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
    configurableOption,
    customFieldsSchema,
} from './common';
import { lineItemListSchema } from './lineItem.schema';

/** Same line items as opportunities (Jira CRM-111): see lineItem.schema.ts. A quotation needs at least one. */
export const quotationLineItemsSchema = lineItemListSchema({ required: true, record: 'quotation' });

export const quotationFormSchema = z.object({
    // ── Tab 1: Overview ───────────────────────────────────────────
    quotationTitle: requiredText('Quotation Title', L.title),
    // Admin-customizable (quote_stage).
    quoteStage: configurableOption('Quote Stage', 'Draft'),
    quotationDate: requiredString('Quotation Date'),
    validUntil: requiredString('Valid Until Date'),
    remarks: optionalText('Remarks', L.longText),
    // Terms, Payment Terms and Validation Period are required by the form configuration (admin-relaxable).
    termsAndCondition: optionalString,
    termsAndConditionDescription: optionalText('Terms & Condition Description', L.termsText),
    assignedTo: requiredString('Assigned Representative'),

    opportunity: requiredString('Opportunity'),
    company: requiredString('Company'),
    validationPeriod: optionalString,
    otherRef: optionalText('Other Ref.', L.shortText),
    paymentTerms: optionalString,
    paymentTermsDescription: optionalText('Payment Terms Description', L.termsText),
    preparedFor: requiredString('Prepared For'),

    // ── Tab 2: Line Items ─────────────────────────────────────────
    currency: optionalString.default('Indian Rupee: ₹'),
    lineItems: quotationLineItemsSchema,
    lumpSumDiscount: zodAmount.default(0),
    totalAmount: zodAmount.default(0),
    totalDiscount: zodAmount.default(0),
    subtotal: zodAmount.default(0),
    totalTax: zodAmount.default(0),
    grandTotal: zodAmount.default(0),

    // ── Tab 3: Address Information ────────────────────────────────
    organizationName: optionalText('Organization Name', L.organizationName),
    organizationId: optionalString,
    contact: requiredText('Contact', L.personName),
    contactId: optionalString,
    contactNumber: zodPhoneOptional,
    mailingName: optionalText('Mailing Name', L.organizationName),
    gstNumber: zodGstOptional,
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
    notes: optionalText('Internal Notes', L.longText),
    termsAndConditions: optionalText('Terms and Conditions', L.termsText),

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
}).superRefine((data, ctx) => {
    refinePostalCodeForCountry(ctx, 'billingPostalCode', data.billingPostalCode, data.billingCountry, true);
    // An empty shipping country falls back to the billing country.
    refinePostalCodeForCountry(ctx, 'shippingPostalCode', data.shippingPostalCode, data.shippingCountry || data.billingCountry);
});

export type QuotationFormSchemaType = z.infer<typeof quotationFormSchema>;
