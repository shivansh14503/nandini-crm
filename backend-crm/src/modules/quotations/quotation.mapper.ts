import type { Prisma, Quotation, QuotationLineItem } from '../../generated/prisma/client.js';
import { decimalToNumber, fromDateOnly, nullable, parseCustomFields, serializeCustomFields, text, toDateOnly, toIso } from '../../utils/mappers.js';
import { toGstType, toLineItemDtos, type GstType, type LineItemDto, type LineItemTotals } from '../shared/lineItems.js';
import type { QuotationInput } from './quotation.validator.js';

export type QuotationRow = Quotation & {
    lineItems?: QuotationLineItem[];
    opportunityRecord?: { opportunityCode: string } | null;
};

const DEFAULT_CURRENCY = 'Indian Rupee: ₹';
const DEFAULT_COUNTRY = 'IN';

/** `Quotation` from frontend-crm/src/types/quotation.types.ts (including its legacy aliases). */
export interface QuotationDto {
    id: string;
    quotationCode: string;
    quotationTitle: string;
    quoteStage: string;
    quotationDate: string;
    validUntil: string;
    remarks: string;
    termsAndCondition: string;
    termsAndConditionDescription: string;
    assignedTo: string;
    opportunity: string;
    company: string;
    validationPeriod: string;
    otherRef: string;
    paymentTerms: string;
    paymentTermsDescription: string;
    preparedFor: string;
    currency: string;
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
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;
    contactNumber: string;
    mailingName: string;
    gstNumber: string;
    contactEmail: string;
    billingAddress: string;
    billingCity: string;
    billingState: string;
    billingPostalCode: string;
    billingCountry: string;
    shippingAddress: string;
    shippingCity: string;
    shippingState: string;
    shippingPostalCode: string;
    shippingCountry: string;
    copyAddressFromBilling: boolean;
    opportunityId?: string;
    opportunityCode: string;
    status: string;
    quoteDate: string;
    quotationSubject: string;
    notes: string;
    termsAndConditions: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    /** Username of the last editor; empty until the record is first modified. */
    updatedBy: string;
    /** Admin-defined custom field values keyed by FormFieldDefinition.fieldKey. */
    customFields: Record<string, unknown>;
}

export function toQuotationDto(row: QuotationRow): QuotationDto {
    const quotationDate = toDateOnly(row.quotationDate);
    return {
        id: row.id,
        quotationCode: row.quotationCode,
        quotationTitle: row.quotationTitle,
        quoteStage: row.quoteStage,
        quotationDate,
        validUntil: toDateOnly(row.validUntil),
        remarks: text(row.remarks),
        termsAndCondition: text(row.termsAndCondition),
        termsAndConditionDescription: text(row.termsAndConditionDescription),
        assignedTo: row.assignedTo,
        opportunity: row.opportunity,
        company: row.company,
        validationPeriod: text(row.validationPeriod),
        otherRef: text(row.otherRef),
        paymentTerms: text(row.paymentTerms),
        paymentTermsDescription: text(row.paymentTermsDescription),
        preparedFor: row.preparedFor,
        currency: row.currency,
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
        organizationName: text(row.organizationName),
        organizationId: row.organizationId ?? undefined,
        contact: row.contact,
        contactId: row.contactId ?? undefined,
        contactNumber: text(row.contactNumber),
        mailingName: text(row.mailingName),
        gstNumber: text(row.gstNumber),
        contactEmail: text(row.contactEmail),
        billingAddress: row.billingAddress,
        billingCity: row.billingCity,
        billingState: row.billingState,
        billingPostalCode: row.billingPostalCode,
        billingCountry: row.billingCountry,
        shippingAddress: text(row.shippingAddress),
        shippingCity: text(row.shippingCity),
        shippingState: text(row.shippingState),
        shippingPostalCode: text(row.shippingPostalCode),
        shippingCountry: text(row.shippingCountry),
        copyAddressFromBilling: row.copyAddressFromBilling,
        opportunityId: row.opportunityId ?? undefined,
        opportunityCode: row.opportunityRecord?.opportunityCode ?? '',
        status: text(row.status),
        // Legacy aliases mirror the canonical columns.
        quoteDate: quotationDate,
        quotationSubject: text(row.quotationSubject),
        notes: text(row.notes),
        termsAndConditions: text(row.termsAndConditions),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        customFields: parseCustomFields(row.customDataJson),
    };
}

export interface QuotationLinks {
    opportunityId: string | null;
    organizationId: string | null;
    contactId: string | null;
}

export function toQuotationData(
    input: QuotationInput,
    links: QuotationLinks,
    totals: LineItemTotals,
    gstType: GstType | null,
): Omit<Prisma.QuotationUncheckedCreateInput, 'quotationCode' | 'createdBy'> {
    const billing = {
        address: input.billingAddress,
        city: input.billingCity,
        state: input.billingState,
        postalCode: input.billingPostalCode ?? '',
        country: input.billingCountry ?? DEFAULT_COUNTRY,
    };
    // "Copy address from billing" is enforced here rather than trusted from the client.
    const shipping = input.copyAddressFromBilling
        ? billing
        : {
              address: nullable(input.shippingAddress),
              city: nullable(input.shippingCity),
              state: nullable(input.shippingState),
              postalCode: nullable(input.shippingPostalCode),
              country: input.shippingCountry ?? billing.country,
          };

    return {
        customDataJson: serializeCustomFields(input.customFields),
        quotationTitle: input.quotationTitle,
        quoteStage: input.quoteStage,
        quotationDate: fromDateOnly(input.quotationDate),
        validUntil: fromDateOnly(input.validUntil),
        remarks: nullable(input.remarks),
        termsAndCondition: nullable(input.termsAndCondition),
        termsAndConditionDescription: nullable(input.termsAndConditionDescription),
        assignedTo: input.assignedTo,
        opportunity: input.opportunity,
        company: input.company,
        validationPeriod: nullable(input.validationPeriod),
        otherRef: nullable(input.otherRef),
        paymentTerms: nullable(input.paymentTerms),
        paymentTermsDescription: nullable(input.paymentTermsDescription),
        preparedFor: input.preparedFor,
        currency: input.currency ?? DEFAULT_CURRENCY,
        lumpSumDiscount: input.lumpSumDiscount,
        roundOff: input.roundOff,
        gstType,
        ...totals,
        organizationName: nullable(input.organizationName),
        organizationId: links.organizationId,
        contact: input.contact,
        contactId: links.contactId,
        contactNumber: input.contactNumber ?? null,
        mailingName: nullable(input.mailingName),
        gstNumber: input.gstNumber ?? null,
        contactEmail: input.contactEmail ?? null,
        billingAddress: billing.address,
        billingCity: billing.city,
        billingState: billing.state,
        billingPostalCode: billing.postalCode,
        billingCountry: billing.country,
        shippingAddress: shipping.address,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingPostalCode: shipping.postalCode,
        shippingCountry: shipping.country,
        copyAddressFromBilling: input.copyAddressFromBilling,
        opportunityId: links.opportunityId,
        status: input.status ?? 'Draft',
        quotationSubject: nullable(input.quotationSubject),
        notes: nullable(input.notes),
        termsAndConditions: nullable(input.termsAndConditions),
    };
}
