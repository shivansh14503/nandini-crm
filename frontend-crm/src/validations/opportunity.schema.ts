import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import type { ConfigValidationIssue } from '../utils/formConfig';
import { PO_SALES_STAGE, SMALL_COMMISSION_LIMIT } from '../types/opportunity.types';
import { isRecordFile } from '../types/recordFile.types';
import { fmtMoney } from '../utils/formats';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
    optionalDescription,
    zodPhoneOptional,
    zodEmailOptional,
    zodIfscOptional,
    zodPanOptional,
    zodAmount,
    customFieldsSchema,
    tallySerialNoOptional,
} from './common';
import { lineItemListSchema } from './lineItem.schema';

/** Same line items as quotations (Jira CRM-111): see lineItem.schema.ts. */
export const opportunityLineItemsSchema = lineItemListSchema();

/**
 * Only locked fields are required here (docs/field-locking-policy.md); the rest are required by the form
 * configuration, which useRhfForm applies on top of this schema.
 */
export const opportunityFormSchema = z.object({
    // Basic Details
    productCategory: z.array(z.string()).default([]),
    contact: requiredText('Contact Person', L.personName),
    contactId: optionalString,
    organizationName: requiredText('Organization Name', L.organizationName),
    organizationId: optionalString,
    contactNumber: zodPhoneOptional,
    contactEmail: zodEmailOptional,
    // Required for Lead Source CA / Reference; Partner Company for Lead Source Partner (leadSourceDetailIssues).
    referredBy: optionalString,
    referredById: optionalString,
    partnerCompany: optionalString,
    type: optionalString,
    salesStage: requiredString('Sales Stage'),
    leadSource: optionalString,
    leadGivenBy: optionalString,
    nextFollowupDate: optionalString,
    nextFollowupTime: optionalString,
    followupType: optionalString.default('Call'),
    customerResponse: optionalString,
    remarks: optionalDescription('Remarks', L.longText),
    description: optionalText('Description', L.longText),
    assignedTo: requiredString('Assigned Representative'),

    // Billing Details
    tallySerialNo: tallySerialNoOptional('Tally Serial No'),
    invoiceNo: optionalText('Invoice No', L.shortCode),
    invoiceDate: optionalString,

    // Commission Details
    commission: optionalString,
    // Typed as text; required (above 0) when Commission is Yes, see commissionIssues.
    commissionAmount: z.preprocess((v) => (v === null || v === undefined ? '' : String(v)), z.string().trim()).optional(),
    commissionType: optionalString,
    // The commission payee's bank details (Commission Type Other), with the Organization form's rules.
    accountName: optionalText('Account Name', L.organizationName),
    accountNo: optionalText('Account No', L.bankAccount),
    bankName: optionalText('Bank Name', L.personName),
    ifscCode: zodIfscOptional,
    panNumber: zodPanOptional,

    // Documentation: the details and file are kept while Add Document is Yes (see documentationIssues).
    addDocument: optionalString.default('No'),
    documentNo: optionalText('Document No', L.shortCode),
    documentDate: optionalString,
    // The uploaded file (`{ id, fileName, … }`), or null.
    documentFile: z.custom<{ id: string; fileName: string; mimeType: string; sizeBytes: number; url: string } | null>((v) => v === null || v === undefined || isRecordFile(v)).nullish(),

    // Line Items (no currency: it is set per quotation)
    lineItems: opportunityLineItemsSchema.default([]),
    lumpSumDiscount: zodAmount.default(0),
    totalAmount: zodAmount.default(0),
    totalDiscount: zodAmount.default(0),
    subtotal: zodAmount.default(0),
    totalTax: zodAmount.default(0),
    grandTotal: zodAmount.default(0),

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
});

export type OpportunityFormSchemaType = z.infer<typeof opportunityFormSchema>;

/** Commission Amount is required, and above 0, when Commission is Yes. */
/** The Commission Amount as a number; 0 when empty or not a number. */
function commissionAmountOf(value: number | string | null | undefined): number {
    const amount = value === null || value === undefined || value === '' ? 0 : Number(value);
    return Number.isFinite(amount) ? amount : 0;
}

/** Whether the form asks for a Commission Type: Commission Yes with an amount. */
export function hasCommission(values: { commission?: string; commissionAmount?: number | string | null }): boolean {
    return values.commission === 'Yes' && commissionAmountOf(values.commissionAmount) > 0;
}

/** Commission Type a commission of this amount starts on: Self up to 1,000, Other above. */
export function defaultCommissionType(amount: number | string | null | undefined): 'Self' | 'Other' {
    return commissionAmountOf(amount) > SMALL_COMMISSION_LIMIT ? 'Other' : 'Self';
}

/** The commission payee's bank details, all required while Commission Type is Other (an amount above ₹1,000). */
export const PAYEE_BANK_FIELDS = [
    { key: 'accountName', label: 'Account Name' },
    { key: 'accountNo', label: 'Account No' },
    { key: 'bankName', label: 'Bank Name' },
    { key: 'ifscCode', label: 'IFSC Code' },
    { key: 'panNumber', label: 'PAN Number' },
] as const;
type PayeeBankKey = (typeof PAYEE_BANK_FIELDS)[number]['key'];

export function commissionIssues(
    values: { commission?: string; commissionAmount?: number | string | null; commissionType?: string } & Partial<Record<PayeeBankKey, string>>,
): ConfigValidationIssue[] {
    if (values.commission !== 'Yes') return [];
    const raw = values.commissionAmount === null || values.commissionAmount === undefined ? '' : String(values.commissionAmount).trim();
    if (!raw) return [{ path: 'commissionAmount', message: 'Commission Amount is required when Commission is Yes.' }];
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return [{ path: 'commissionAmount', message: 'Enter a Commission Amount above 0.' }];
    if (!values.commissionType?.trim()) return [{ path: 'commissionType', message: 'Commission Type is required when Commission is Yes.' }];
    if (defaultCommissionType(amount) !== 'Other') return [];
    return PAYEE_BANK_FIELDS.filter((f) => !values[f.key]?.trim()).map((f) => ({
        path: f.key,
        // Same text as the API's payeeBankIssues (opportunity.validator.ts): the limit in the company grouping.
        message: `${f.label} is required when Commission Amount is above ${fmtMoney(SMALL_COMMISSION_LIMIT, { maxDecimals: 0 })}.`,
    }));
}

/** Add Document must be Yes at Sales Stage PO, and needs a file (Upload Doc) whenever it is Yes. */
export function documentationIssues(values: { salesStage?: string; addDocument?: string; documentFile?: unknown }): ConfigValidationIssue[] {
    if (values.salesStage === PO_SALES_STAGE && values.addDocument !== 'Yes') {
        return [{ path: 'addDocument', message: `Add Document must be Yes when Sales Stage is ${PO_SALES_STAGE}.` }];
    }
    if (values.addDocument === 'Yes' && !isRecordFile(values.documentFile)) {
        return [{ path: 'documentFile', message: 'Upload Doc is required when Add Document is Yes.' }];
    }
    return [];
}
