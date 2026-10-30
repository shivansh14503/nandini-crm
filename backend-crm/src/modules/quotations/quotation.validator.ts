import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    enumWithDefault,
    optionalEmail,
    optionalEnum,
    optionalGst,
    optionalPhone,
    optionalPostalCode,
    optionalText,
    refinePostalCodeForCountry,
    requiredDate,
    requiredText,
} from '../../validators/common.js';
import { lineItemListSchema } from '../shared/lineItems.js';

/** QUOTE_STAGES / QUOTATION_STATUSES from frontend-crm/src/types/quotation.types.ts. */
export const QUOTE_STAGES = ['Draft', 'Negotiation', 'Delivered', 'On Hold', 'Confirmed', 'Closed Accepted', 'Closed Lost', 'Closed Dead'] as const;
/** `status` accepts QuotationStatus or a QuoteStage (frontend type `QuotationStatus | QuoteStage`). */
const STATUS_VALUES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Negotiation', 'Delivered', 'On Hold', 'Confirmed', 'Closed Accepted', 'Closed Lost', 'Closed Dead'] as const;

/** Legacy aliases on `QuotationFormData`; the first key of each pair is stored. */
export const QUOTATION_ALIAS_PAIRS: [canonical: string, alias: string][] = [
    ['quotationDate', 'quoteDate'],
    ['contactMobile', 'contactNumber'],
    ['contactEmail', 'emailAddress'],
];

function normalizeAliases(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const input = { ...(value as Record<string, unknown>) };
    for (const [canonical, alias] of QUOTATION_ALIAS_PAIRS) {
        input[canonical] = input[canonical] || input[alias] || undefined;
    }
    return input;
}

/** `QuotationFormData` rules from frontend-crm/src/validations/quotation.schema.ts. */
export const quotationInputSchema = z.preprocess(
    normalizeAliases,
    z
        .object({
            // Overview
            quotationTitle: requiredText('Quotation Title', L.title),
            quoteStage: enumWithDefault('Quote Stage', QUOTE_STAGES, 'Draft'),
            quotationDate: requiredDate('Quotation Date'),
            validUntil: requiredDate('Valid Until Date'),
            remarks: optionalText('Remarks', L.longText),
            termsAndCondition: requiredText('Terms & Condition', L.option),
            termsAndConditionDescription: optionalText('Terms & Condition Description', L.longText),
            assignedTo: requiredText('Assigned Representative', L.username),
            opportunityName: requiredText('Opportunity Name', L.organizationName),
            company: requiredText('Company', L.option),
            validationPeriod: requiredText('Validation Period', 30),
            otherRef: optionalText('Other Ref.', L.shortText),
            paymentTerms: requiredText('Payment Terms', L.option),
            paymentTermsDescription: optionalText('Payment Terms Description', L.longText),
            preparedFor: requiredText('Prepared For', L.organizationName),

            // Line items
            currency: optionalText('Currency', 30),
            groupName: optionalText('Group Name', L.shortText),
            lineItems: lineItemListSchema.min(1, { message: 'At least one line item is required to create a quotation.' }),
            lumpSumDiscount: z.coerce.number({ error: 'Lump Sum Discount must be a number.' }).min(0, { message: 'Lump Sum Discount cannot be negative.' }).default(0),

            // Customer & address
            organizationName: optionalText('Organization', L.organizationName),
            organizationId: optionalText('Organization', 50),
            contactName: requiredText('Contact Name', L.personName),
            contactId: optionalText('Contact', 50),
            contactMobile: optionalPhone('Contact Mobile'),
            mailingName: optionalText('Mailing Name', L.organizationName),
            gstNo: optionalGst,
            contactEmail: optionalEmail,

            billingAddress: requiredText('Street / Billing Address', L.address),
            billingCity: requiredText('City', L.shortText),
            billingState: requiredText('State / Region', L.shortText),
            billingPostalCode: optionalPostalCode,
            billingCountry: optionalText('Country', L.shortText),

            shippingAddress: optionalText('Shipping Street', L.address),
            shippingCity: optionalText('Shipping City', L.shortText),
            shippingState: optionalText('Shipping State', L.shortText),
            shippingPostalCode: optionalPostalCode,
            shippingCountry: optionalText('Shipping Country', L.shortText),
            copyAddressFromBilling: z.boolean().default(true),

            // Linked context & legacy fields
            opportunityId: optionalText('Opportunity', 50),
            status: optionalEnum('Status', STATUS_VALUES),
            quotationSubject: optionalText('Quotation Subject', L.title),
            notes: optionalText('Internal Notes', L.longText),
            termsAndConditions: optionalText('Terms and Conditions', L.longText),
        })
        .superRefine((quote, ctx) => {
            refinePostalCodeForCountry(ctx, 'billingPostalCode', quote.billingPostalCode, quote.billingCountry, true);
            if (!quote.copyAddressFromBilling) {
                // An empty shipping country falls back to the billing country (as in the frontend schema).
                refinePostalCodeForCountry(ctx, 'shippingPostalCode', quote.shippingPostalCode, quote.shippingCountry || quote.billingCountry);
            }
            if (quote.validUntil < quote.quotationDate) {
                ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Valid Until cannot be before the Quotation Date.' });
            }
        }),
);

export type QuotationInput = z.infer<typeof quotationInputSchema>;

export const quotationListQuerySchema = z.object({
    status: csvQuery,
    quoteStage: csvQuery,
    opportunityId: z.string().trim().max(50).optional(),
    organizationId: z.string().trim().max(50).optional(),
    /** Quotations for one contact. */
    contactId: z.string().trim().max(50).optional(),
    /** Quotations with a line item for this product. */
    productId: z.string().trim().max(50).optional(),
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Only quotations assigned to the signed-in user. */
    mine: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const QUOTATION_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'quotationCode',
    'quotationTitle',
    'organizationName',
    'quotationDate',
    'validUntil',
    'grandTotal',
    'quoteStage',
    'status',
] as const;
