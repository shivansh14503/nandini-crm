import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    enumWithDefault,
    optionalDate,
    optionalEmail,
    optionalText,
    phone,
    requiredDate,
    requiredText,
    stringList,
} from '../../validators/common.js';
import { lineItemListSchema } from '../shared/lineItems.js';

export const CLOSED_SALES_STAGES = ['Closed Won', 'Closed Lost'] as const;
export const QUOTE_SALES_STAGE = 'Proposal/Price Quote';

/** `OpportunityFormData` rules from frontend-crm/src/validations/opportunity.schema.ts. */
export const opportunityInputSchema = z.object({
    opportunityName: optionalText('Opportunity Name', L.organizationName),
    productCategory: stringList('Product Category', 30, L.option).min(1, { message: 'Please select at least one Product Category.' }),
    contactName: requiredText('Contact Person', L.personName),
    contactId: optionalText('Contact', 50),
    organizationName: requiredText('Organization Name', L.organizationName),
    organizationId: optionalText('Organization', 50),
    contactNumber: phone('Contact Number'),
    emailAddress: optionalEmail,
    referredBy: optionalText('Referred By', L.organizationName),
    type: requiredText('Opportunity Type', L.option),
    salesStage: requiredText('Sales Stage', L.option),
    leadSource: requiredText('Lead Source', L.option),
    leadGivenBy: requiredText('Lead Given By', L.organizationName),
    nextFollowupDate: requiredDate('Next Followup Date'),
    nextFollowupTime: optionalText('Next Followup Time', 20),
    followupType: optionalText('Followup Type', L.option),
    addDescription: requiredText('Add Description', L.longText).min(3, { message: 'Add Description must be at least 3 characters.' }),
    description: optionalText('Description', L.longText),
    assignedTo: requiredText('Assigned Representative', L.username),

    tallySerialNo: optionalText('Tally Serial No', L.shortCode),
    invoiceNo: optionalText('Invoice No', L.shortCode),
    invoiceDate: optionalDate('Invoice Date'),
    commission: requiredText('Commission', L.option),
    addDocument: enumWithDefault('Add Document', ['Yes', 'No'], 'No'),

    currency: optionalText('Currency', 30),
    groupName: optionalText('Group Name', L.shortText),
    lineItems: lineItemListSchema.default([]),
    lumpSumDiscount: z.coerce.number({ error: 'Lump Sum Discount must be a number.' }).min(0, { message: 'Lump Sum Discount cannot be negative.' }).default(0),
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
    'contactName',
    'salesStage',
    'nextFollowupDate',
    'grandTotal',
    'assignedTo',
] as const;
