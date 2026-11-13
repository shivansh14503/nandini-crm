import type { Opportunity, OpportunityLineItem, Prisma } from '../../generated/prisma/client.js';
import { decimalToNumber, fromDateOnly, fromOptionalDateOnly, nullable, parseCustomFields, parseStringArray, serializeCustomFields, stringifyStringArray, text, toDateOnly, toIso } from '../../utils/mappers.js';
import { toLineItemDtos, type LineItemDto, type LineItemTotals } from '../shared/lineItems.js';
import type { OpportunityInput } from './opportunity.validator.js';

export type OpportunityRow = Opportunity & { lineItems?: OpportunityLineItem[] };

export const DEFAULT_CURRENCY = 'Indian Rupee: ₹';

/** `Opportunity` from frontend-crm/src/types/opportunity.types.ts. */
export interface OpportunityDto {
    id: string;
    opportunityCode: string;
    opportunityName: string;
    productCategory: string[];
    contactName: string;
    contactId?: string;
    organizationName: string;
    organizationId?: string;
    contactNumber: string;
    emailAddress: string;
    referredBy: string;
    type: string;
    salesStage: string;
    leadSource: string;
    leadGivenBy: string;
    nextFollowupDate: string;
    nextFollowupTime: string;
    followupType: string;
    addDescription: string;
    description: string;
    assignedTo: string;
    tallySerialNo: string;
    invoiceNo: string;
    invoiceDate: string;
    commission: string;
    addDocument: string;
    currency: string;
    groupName: string;
    lineItems: LineItemDto[];
    lumpSumDiscount: number;
    totalAmount: number;
    totalDiscount: number;
    subtotal: number;
    totalTax: number;
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
        contactName: row.contactName,
        contactId: row.contactId ?? undefined,
        organizationName: row.organizationName,
        organizationId: row.organizationId ?? undefined,
        contactNumber: row.contactNumber,
        emailAddress: text(row.emailAddress),
        referredBy: text(row.referredBy),
        type: text(row.type),
        salesStage: row.salesStage,
        leadSource: text(row.leadSource),
        leadGivenBy: text(row.leadGivenBy),
        nextFollowupDate: toDateOnly(row.nextFollowupDate),
        nextFollowupTime: text(row.nextFollowupTime),
        followupType: text(row.followupType),
        addDescription: text(row.addDescription),
        description: text(row.description),
        assignedTo: row.assignedTo,
        tallySerialNo: text(row.tallySerialNo),
        invoiceNo: text(row.invoiceNo),
        invoiceDate: toDateOnly(row.invoiceDate),
        commission: text(row.commission),
        addDocument: text(row.addDocument),
        currency: row.currency,
        groupName: text(row.groupName),
        lineItems: toLineItemDtos(row.lineItems),
        lumpSumDiscount: decimalToNumber(row.lumpSumDiscount),
        totalAmount: decimalToNumber(row.totalAmount),
        totalDiscount: decimalToNumber(row.totalDiscount),
        subtotal: decimalToNumber(row.subtotal),
        totalTax: decimalToNumber(row.totalTax),
        grandTotal: decimalToNumber(row.grandTotal),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        customFields: parseCustomFields(row.customDataJson),
    };
}

/** Writable scalar columns; links and computed totals come from the service. */
export function toOpportunityData(
    input: OpportunityInput,
    links: { organization: { id: string | null; name: string }; contact: { id: string | null; name: string } },
    totals: LineItemTotals,
): Omit<Prisma.OpportunityUncheckedCreateInput, 'opportunityCode' | 'createdBy'> {
    return {
        customDataJson: serializeCustomFields(input.customFields),
        opportunityName: nullable(input.opportunityName),
        productCategoryJson: stringifyStringArray(input.productCategory),
        contactName: links.contact.name,
        contactId: links.contact.id,
        organizationName: links.organization.name,
        organizationId: links.organization.id,
        contactNumber: input.contactNumber,
        emailAddress: input.emailAddress ?? null,
        referredBy: nullable(input.referredBy),
        type: nullable(input.type),
        salesStage: input.salesStage,
        leadSource: nullable(input.leadSource),
        leadGivenBy: nullable(input.leadGivenBy),
        nextFollowupDate: fromOptionalDateOnly(input.nextFollowupDate),
        nextFollowupTime: nullable(input.nextFollowupTime),
        followupType: input.followupType ?? 'Call',
        addDescription: nullable(input.addDescription),
        description: nullable(input.description),
        assignedTo: input.assignedTo,
        tallySerialNo: nullable(input.tallySerialNo),
        invoiceNo: nullable(input.invoiceNo),
        invoiceDate: input.invoiceDate ? fromDateOnly(input.invoiceDate) : null,
        commission: nullable(input.commission),
        addDocument: input.addDocument,
        currency: input.currency ?? DEFAULT_CURRENCY,
        groupName: nullable(input.groupName),
        lumpSumDiscount: input.lumpSumDiscount,
        ...totals,
    };
}
