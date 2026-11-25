import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import type { ConfigValidationIssue } from '../utils/formConfig';
import { SMALL_COMMISSION_LIMIT } from '../types/opportunity.types';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
    optionalDescription,
    zodPhone,
    zodEmailOptional,
    zodIfscOptional,
    zodPanOptional,
    zodAmount,
    quantitySchema,
    customFieldsSchema,
    tallySerialNoOptional,
} from './common';

export const opportunityLineItemSchema = z.object({
    id: z.string(),
    productId: optionalString,
    productName: requiredString('Product Name'),
    quantity: quantitySchema,
    amount: zodAmount,
    discount: zodAmount.default(0),
    discountType: z.enum(['percentage', 'direct']).default('percentage'),
    salePrice: zodAmount.default(0),
    taxRate: z.string().default('18%'),
    taxAmount: zodAmount.default(0),
    total: zodAmount.default(0),
    description: optionalText('Line item description', L.longText),
    note: optionalText('Line item note', L.longText),
});

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
    contactNumber: zodPhone,
    contactEmail: zodEmailOptional,
    referredBy: optionalString,
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

    // Document
    addDocument: optionalString.default('No'),

    // Line Items
    currency: optionalString.default('Indian Rupee: ₹'),
    groupName: optionalText('Group Name', L.shortText).default('Products & Services'),
    lineItems: z.array(opportunityLineItemSchema).default([]),
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

export function commissionIssues(values: { commission?: string; commissionAmount?: number | string | null; commissionType?: string }): ConfigValidationIssue[] {
    if (values.commission !== 'Yes') return [];
    const raw = values.commissionAmount === null || values.commissionAmount === undefined ? '' : String(values.commissionAmount).trim();
    if (!raw) return [{ path: 'commissionAmount', message: 'Commission Amount is required when Commission is Yes.' }];
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return [{ path: 'commissionAmount', message: 'Enter a Commission Amount above 0.' }];
    if (!values.commissionType?.trim()) return [{ path: 'commissionType', message: 'Commission Type is required when Commission is Yes.' }];
    return [];
}
