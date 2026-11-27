import type { Opportunity, OpportunityLineItem, Prisma } from '../../generated/prisma/client.js';
import { decimalToNumber, fromDateOnly, fromOptionalDateOnly, nullable, parseCustomFields, parseStringArray, serializeCustomFields, stringifyStringArray, text, toDateOnly, toIso } from '../../utils/mappers.js';
import { partnerCompanyFor } from '../shared/leadSource.js';
import { toGstType, toLineItemDtos, type GstType, type LineItemDto, type LineItemTotals } from '../shared/lineItems.js';
import { toRecordFileDto, type RecordFileDto } from '../files/recordFile.service.js';
import type { OpportunityDocumentRow } from '../documents/document.sync.js';
import { defaultCommissionType, hasCommission, type OpportunityInput } from './opportunity.validator.js';

export type OpportunityRow = Opportunity & {
    lineItems?: OpportunityLineItem[];
    /** The Documentation section's document (Document table), loaded with `OPPORTUNITY_DOCUMENT_INCLUDE`. */
    document?: OpportunityDocumentRow | null;
};

/** `Opportunity` from frontend-crm/src/types/opportunity.types.ts. */
export interface OpportunityDto {
    id: string;
    opportunityCode: string;
    opportunityName: string;
    productCategory: string[];
    contact: string;
    contactId?: string;
    organizationName: string;
    organizationId?: string;
    contactNumber: string;
    contactEmail: string;
    referredBy: string;
    /** The Referral picked as Referred By; absent for a legacy free-text value. */
    referredById?: string;
    partnerCompany: string;
    type: string;
    salesStage: string;
    leadSource: string;
    leadGivenBy: string;
    nextFollowupDate: string;
    nextFollowupTime: string;
    followupType: string;
    customerResponse: string;
    remarks: string;
    description: string;
    assignedTo: string;
    tallySerialNo: string;
    invoiceNo: string;
    invoiceDate: string;
    commission: string;
    /** Set only when Commission is Yes. */
    commissionAmount: number | null;
    /** Self / Other while Commission is Yes; empty otherwise. */
    commissionType: string;
    /** The commission payee's bank details (Commission Type Other only). */
    accountName: string;
    accountNo: string;
    bankName: string;
    ifscCode: string;
    panNumber: string;
    addDocument: string;
    /** The document's details and file (Upload Doc), kept only while Add Document is Yes. */
    documentNo: string;
    documentDate: string;
    documentFile: RecordFileDto | null;
    lineItems: LineItemDto[];
    lumpSumDiscount: number;
    /** Gross Amount. */
    totalAmount: number;
    totalDiscount: number;
    /** Total Taxable Amount. */
    subtotal: number;
    /** Actual (Before Tax): Total Taxable Amount − Lump Sum Discount. */
    actualBeforeTax: number;
    /** IGST or CGST_SGST as saved; null = plain GST (no company state then). */
    gstType: GstType | null;
    totalTax: number;
    /** Round Off checkbox. */
    roundOff: boolean;
    roundOffAmount: number;
    grandTotal: number;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    /** Username of the last editor; empty until the record is first modified. */
    updatedBy: string;
    /** Admin-defined custom field values keyed by FormFieldDefinition.fieldKey. */
    customFields: Record<string, unknown>;
}

export function toOpportunityDto(row: OpportunityRow): OpportunityDto {
    return {
        id: row.id,
        opportunityCode: row.opportunityCode,
        opportunityName: text(row.opportunityName),
        productCategory: parseStringArray(row.productCategoryJson),
        contact: row.contact,
        contactId: row.contactId ?? undefined,
        organizationName: row.organizationName,
        organizationId: row.organizationId ?? undefined,
        contactNumber: text(row.contactNumber),
        contactEmail: text(row.contactEmail),
        referredBy: text(row.referredBy),
        referredById: row.referredById ?? undefined,
        partnerCompany: text(row.partnerCompany),
        type: text(row.type),
        salesStage: row.salesStage,
        leadSource: text(row.leadSource),
        leadGivenBy: text(row.leadGivenBy),
        nextFollowupDate: toDateOnly(row.nextFollowupDate),
        nextFollowupTime: text(row.nextFollowupTime),
        followupType: text(row.followupType),
        customerResponse: text(row.customerResponse),
        remarks: text(row.remarks),
        description: text(row.description),
        assignedTo: row.assignedTo,
        tallySerialNo: text(row.tallySerialNo),
        invoiceNo: text(row.invoiceNo),
        invoiceDate: toDateOnly(row.invoiceDate),
        commission: text(row.commission),
        commissionAmount: row.commissionAmount === null ? null : decimalToNumber(row.commissionAmount),
        commissionType: text(row.commissionType),
        accountName: text(row.accountName),
        accountNo: text(row.accountNo),
        bankName: text(row.bankName),
        ifscCode: text(row.ifscCode),
        panNumber: text(row.panNumber),
        addDocument: text(row.addDocument),
        documentNo: text(row.document?.documentNo),
        documentDate: toDateOnly(row.document?.documentDate ?? null),
        documentFile: row.document?.documentFile ? toRecordFileDto(row.document.documentFile) : null,
        lineItems: toLineItemDtos(row.lineItems),
        lumpSumDiscount: decimalToNumber(row.lumpSumDiscount),
        totalAmount: decimalToNumber(row.totalAmount),
        totalDiscount: decimalToNumber(row.totalDiscount),
        subtotal: decimalToNumber(row.subtotal),
        actualBeforeTax: decimalToNumber(row.actualBeforeTax),
        gstType: toGstType(row.gstType),
        totalTax: decimalToNumber(row.totalTax),
        roundOff: row.roundOff,
        roundOffAmount: decimalToNumber(row.roundOffAmount),
        grandTotal: decimalToNumber(row.grandTotal),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        customFields: parseCustomFields(row.customDataJson),
    };
}

/** Commission Type (always set by the amount; the form can't edit it) and, for Other, the payee's bank details; all cleared without a commission. */
function commissionColumns(input: OpportunityInput) {
    const type = hasCommission(input) ? defaultCommissionType(input.commissionAmount) : null;
    const bank = (value: string | undefined) => (type === 'Other' ? nullable(value) : null);
    return {
        commissionType: type,
        accountName: bank(input.accountName),
        accountNo: bank(input.accountNo),
        bankName: bank(input.bankName),
        ifscCode: bank(input.ifscCode),
        panNumber: bank(input.panNumber),
    };
}

/** Writable scalar columns; links and computed totals come from the service. */
export function toOpportunityData(
    input: OpportunityInput,
    links: { organization: { id: string | null; name: string }; contact: { id: string | null; name: string } },
    totals: LineItemTotals,
    gstType: GstType | null,
): Omit<Prisma.OpportunityUncheckedCreateInput, 'opportunityCode' | 'createdBy'> {
    return {
        customDataJson: serializeCustomFields(input.customFields),
        opportunityName: nullable(input.opportunityName),
        productCategoryJson: stringifyStringArray(input.productCategory),
        contact: links.contact.name,
        contactId: links.contact.id,
        organizationName: links.organization.name,
        organizationId: links.organization.id,
        contactNumber: nullable(input.contactNumber),
        contactEmail: input.contactEmail ?? null,
        referredBy: nullable(input.referredBy),
        referredById: nullable(input.referredById),
        // Kept only for Lead Source Partner (the form shows the field only then).
        partnerCompany: partnerCompanyFor(input),
        type: nullable(input.type),
        salesStage: input.salesStage,
        leadSource: nullable(input.leadSource),
        leadGivenBy: nullable(input.leadGivenBy),
        nextFollowupDate: fromOptionalDateOnly(input.nextFollowupDate),
        nextFollowupTime: nullable(input.nextFollowupTime),
        followupType: input.followupType ?? 'Call',
        customerResponse: nullable(input.customerResponse),
        remarks: nullable(input.remarks),
        description: nullable(input.description),
        assignedTo: input.assignedTo,
        tallySerialNo: nullable(input.tallySerialNo),
        invoiceNo: nullable(input.invoiceNo),
        invoiceDate: input.invoiceDate ? fromDateOnly(input.invoiceDate) : null,
        commission: input.commission,
        commissionAmount: input.commission === 'Yes' ? (input.commissionAmount ?? null) : null,
        ...commissionColumns(input),
        // The document itself is written to the Document table (syncOpportunityDocument).
        addDocument: input.addDocument,
        lumpSumDiscount: input.lumpSumDiscount,
        roundOff: input.roundOff,
        gstType,
        ...totals,
    };
}
