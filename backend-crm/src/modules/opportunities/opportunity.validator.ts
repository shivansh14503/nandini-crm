import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    customFieldsSchema,
    enumWithDefault,
    optionalDate,
    optionalDescription,
    optionalEmail,
    optionalText,
    phone,
    requiredPersonName,
    requiredText,
    requiredUpperText,
    stringList,
} from '../../validators/common.js';
import { lineItemListSchema } from '../shared/lineItems.js';

export const CLOSED_SALES_STAGES = ['Closed Won', 'Closed Lost'] as const;
export const QUOTE_SALES_STAGE = 'Proposal/Price Quote';

/**
 * `OpportunityFormData` rules from frontend-crm/src/validations/opportunity.schema.ts. Only locked fields
 * (docs/field-locking-policy.md) are required here; the rest are enforced from the form configuration.
 */
export const opportunityInputSchema = z.object({
    opportunityName: optionalText('Opportunity Name', L.organizationName),
    productCategory: stringList('Product Category', 30, L.option).default([]),
    contact: requiredPersonName('Contact Person', L.personName),
    contactId: optionalText('Contact', 50),
    organizationName: requiredUpperText('Organization Name', L.organizationName),
    organizationId: optionalText('Organization', 50),
    contactNumber: phone('Contact Number'),
    contactEmail: optionalEmail,
    referredBy: optionalText('Referred By', L.organizationName),
    type: optionalText('Opportunity Type', L.option),
    salesStage: requiredText('Sales Stage', L.option),
    leadSource: optionalText('Lead Source', L.option),
    leadGivenBy: optionalText('Lead Given By', L.organizationName),
    nextFollowupDate: optionalDate('Next Followup Date'),
    nextFollowupTime: optionalText('Next Followup Time', 20),
    followupType: optionalText('Followup Type', L.option),
    customerResponse: optionalText('Customer Response', L.option),
    remarks: optionalDescription('Remarks'),
    description: optionalText('Description', L.longText),
    assignedTo: requiredText('Assigned Representative', L.username),

    tallySerialNo: optionalText('Tally Serial No', L.shortCode),
    invoiceNo: optionalText('Invoice No', L.shortCode),
    invoiceDate: optionalDate('Invoice Date'),
    commission: enumWithDefault('Commission', ['Yes', 'No'], 'No'),
    /** Required (above 0) when Commission is Yes; dropped when No. */
    commissionAmount: z.preprocess(
        (v) => (v === '' || v === null || v === undefined ? undefined : v),
        z.coerce.number({ error: 'Commission Amount must be a number.' }).min(0, { message: 'Commission Amount cannot be negative.' }).optional(),
    ),
    addDocument: enumWithDefault('Add Document', ['Yes', 'No'], 'No'),

    currency: optionalText('Currency', 30),
    groupName: optionalText('Group Name', L.shortText),
    lineItems: lineItemListSchema.default([]),
    lumpSumDiscount: z.coerce.number({ error: 'Lump Sum Discount must be a number.' }).min(0, { message: 'Lump Sum Discount cannot be negative.' }).default(0),

    customFields: customFieldsSchema,
}).superRefine((input, ctx) => {
    if (input.commission === 'Yes' && !(Number(input.commissionAmount) > 0)) {
        ctx.addIssue({ code: 'custom', path: ['commissionAmount'], message: 'Commission Amount is required when Commission is Yes.' });
    }
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

export const opportunityListQuerySchema = z.object({
    salesStage: csvQuery,
    /** e.g. `excludeSalesStage=Closed Won,Closed Lost` for the Open tab. */
    excludeSalesStage: csvQuery,
    organizationId: z.string().trim().max(50).optional(),
    contactId: z.string().trim().max(50).optional(),
    /** Opportunities with a line item for this product. */
    productId: z.string().trim().max(50).optional(),
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Only opportunities assigned to the signed-in user ("My Deals"). */
    mine: booleanQuery,
    /** e.g. `minGrandTotal=100000` for the High Value tab. */
    minGrandTotal: z.coerce.number().min(0).optional(),
    nextFollowupDate: optionalDate('Next Followup Date'),
    createdWithinDays: createdWithinDaysQuery,
});

export const OPPORTUNITY_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'opportunityCode',
    'opportunityName',
    'organizationName',
    'contact',
    'salesStage',
    'nextFollowupDate',
    'grandTotal',
    'assignedTo',
] as const;
