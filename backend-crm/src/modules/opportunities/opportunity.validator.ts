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
    optionalIfsc,
    optionalPan,
    optionalPhone,
    optionalTallySerialNo,
    optionalText,
    requiredPersonName,
    requiredText,
    requiredUpperText,
    optionalUpperText,
    stringList,
} from '../../validators/common.js';
import { lineItemListSchema } from '../shared/lineItems.js';

/** Commission Amounts up to this default to Commission Type Self; larger ones to Other. */
export const SMALL_COMMISSION_LIMIT = 1000;
export const COMMISSION_TYPES = ['Self', 'Other'] as const;

/** Whether these values take a Commission Type: Commission Yes with an amount. */
export function hasCommission(input: { commission?: string; commissionAmount?: number }): boolean {
    return input.commission === 'Yes' && Number(input.commissionAmount) > 0;
}

/** Commission Type a commission of this amount starts on: Self up to 1,000, Other above. */
export function defaultCommissionType(amount: number | undefined): (typeof COMMISSION_TYPES)[number] {
    return Number(amount) > SMALL_COMMISSION_LIMIT ? 'Other' : 'Self';
}

/** The commission payee's bank details, all required while Commission Type is Other (an amount above 1,000). */
export const PAYEE_BANK_FIELDS = [
    { key: 'accountName', label: 'Account Name' },
    { key: 'accountNo', label: 'Account No' },
    { key: 'bankName', label: 'Bank Name' },
    { key: 'ifscCode', label: 'IFSC Code' },
    { key: 'panNumber', label: 'PAN Number' },
] as const;
export type PayeeBankKey = (typeof PAYEE_BANK_FIELDS)[number]['key'];

/** Every payee bank detail left empty while the commission is above 1,000 (Commission Type Other). */
export function payeeBankIssues(input: { commission?: string; commissionAmount?: number } & Partial<Record<PayeeBankKey, string>>): { path: string[]; message: string }[] {
    if (!hasCommission(input) || defaultCommissionType(input.commissionAmount) !== 'Other') return [];
    return PAYEE_BANK_FIELDS.filter((f) => !input[f.key]?.trim()).map((f) => ({
        path: [f.key],
        message: `${f.label} is required when Commission Amount is above ₹${SMALL_COMMISSION_LIMIT.toLocaleString('en-IN')}.`,
    }));
}

export const CLOSED_SALES_STAGES = ['Closed Won', 'Closed Lost'] as const;
export const QUOTE_SALES_STAGE = 'Proposal/Price Quote';
/** Sales Stage that needs a document: Add Document Yes, with the file (Upload Doc). */
export const PO_SALES_STAGE = 'PO';

/** The Documentation rules: Add Document Yes at Sales Stage PO, and a file (Upload Doc) whenever it is Yes. */
export function documentationIssues(input: { salesStage?: string; addDocument?: string; documentFile?: string | null }): { path: string[]; message: string }[] {
    if (input.salesStage === PO_SALES_STAGE && input.addDocument !== 'Yes') {
        return [{ path: ['addDocument'], message: `Add Document must be Yes when Sales Stage is ${PO_SALES_STAGE}.` }];
    }
    if (input.addDocument === 'Yes' && !input.documentFile) {
        return [{ path: ['documentFile'], message: 'Upload Doc is required when Add Document is Yes.' }];
    }
    return [];
}

/** Upload Doc: the id of an uploaded RecordFile, sent as the id or as the file object the API returns (`{ id, … }`). */
const documentFileRef = z.preprocess(
    (v) => {
        if (v && typeof v === 'object' && 'id' in v) v = (v as { id?: unknown }).id;
        return v === '' || v === undefined ? null : v;
    },
    z.string({ error: 'Upload Doc must be an uploaded file.' }).trim().max(50).nullable(),
);

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
    contactNumber: optionalPhone('Contact Number'),
    contactEmail: optionalEmail,
    // Required for Lead Source CA / Reference; Partner Company for Lead Source Partner (shared/leadSource.ts).
    // Referred By is a Referral: its id, and its name (resolved by shared/referredBy.ts).
    referredBy: optionalText('Referred By', L.organizationName),
    referredById: optionalText('Referred By', 50),
    partnerCompany: optionalUpperText('Partner Company', L.organizationName),
    type: optionalText('Type', L.option),
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

    tallySerialNo: optionalTallySerialNo('Tally Serial No'),
    invoiceNo: optionalText('Invoice No', L.shortCode),
    invoiceDate: optionalDate('Invoice Date'),
    commission: enumWithDefault('Commission', ['Yes', 'No'], 'No'),
    /** Required (above 0) when Commission is Yes; dropped when No. */
    commissionAmount: z.preprocess(
        (v) => (v === '' || v === null || v === undefined ? undefined : v),
        z.coerce.number({ error: 'Commission Amount must be a number.' }).min(0, { message: 'Commission Amount cannot be negative.' }).optional(),
    ),
    /** Self / Other while Commission is Yes. Not editable: the stored type always comes from the amount (defaultCommissionType). */
    commissionType: z.preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
        z.enum(COMMISSION_TYPES, { error: 'Commission Type must be Self or Other.' }).optional(),
    ),
    // The commission payee's bank details (Commission Type Other), with the Organization form's rules.
    accountName: optionalText('Account Name', L.organizationName),
    accountNo: optionalText('Account No', L.bankAccount),
    bankName: optionalText('Bank Name', L.personName),
    ifscCode: optionalIfsc,
    panNumber: optionalPan,
    addDocument: enumWithDefault('Add Document', ['Yes', 'No'], 'No'),
    // The document's details and file, kept while Add Document is Yes (see documentationIssues).
    documentNo: optionalText('Document No', L.shortCode),
    documentDate: optionalDate('Document Date'),
    documentFile: documentFileRef.default(null),

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
