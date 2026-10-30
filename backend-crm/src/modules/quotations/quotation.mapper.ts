import type { Prisma, Quotation, QuotationLineItem } from '../../generated/prisma/client.js';
import { decimalToNumber, fromDateOnly, nullable, text, toDateOnly, toIso } from '../../utils/mappers.js';
import { toLineItemDtos, type LineItemDto, type LineItemTotals } from '../shared/lineItems.js';
import type { QuotationInput } from './quotation.validator.js';

export type QuotationRow = Quotation & {
    lineItems?: QuotationLineItem[];
    opportunity?: { opportunityCode: string } | null;
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
    opportunityName: string;
    company: string;
    validationPeriod: string;
    otherRef: string;
    paymentTerms: string;
    paymentTermsDescription: string;
    preparedFor: string;
    currency: string;
    groupName: string;
    lineItems: LineItemDto[];
    lumpSumDiscount: number;
    totalAmount: number;
    totalDiscount: number;
    subtotal: number;
    totalTax: number;
    grandTotal: number;
    organizationName: string;
    organizationId?: string;
    contactName: string;
    contactId?: string;
    contactMobile: string;
    mailingName: string;
    gstNo: string;
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
    contactNumber: string;
    emailAddress: string;
    notes: string;
    termsAndConditions: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
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
        termsAndCondition: row.termsAndCondition,
        termsAndConditionDescription: text(row.termsAndConditionDescription),
        assignedTo: row.assignedTo,
        opportunityName: row.opportunityName,
        company: row.company,
        validationPeriod: row.validationPeriod,
        otherRef: text(row.otherRef),
        paymentTerms: row.paymentTerms,
        paymentTermsDescription: text(row.paymentTermsDescription),
        preparedFor: row.preparedFor,
        currency: row.currency,
        groupName: text(row.groupName),
        lineItems: toLineItemDtos(row.lineItems),
        lumpSumDiscount: decimalToNumber(row.lumpSumDiscount),
        totalAmount: decimalToNumber(row.totalAmount),
        totalDiscount: decimalToNumber(row.totalDiscount),
        subtotal: decimalToNumber(row.subtotal),
        totalTax: decimalToNumber(row.totalTax),
        grandTotal: decimalToNumber(row.grandTotal),
        organizationName: text(row.organizationName),
        organizationId: row.organizationId ?? undefined,
        contactName: row.contactName,
        contactId: row.contactId ?? undefined,
        contactMobile: text(row.contactMobile),
        mailingName: text(row.mailingName),
        gstNo: text(row.gstNo),
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
        opportunityCode: row.opportunity?.opportunityCode ?? '',
        status: text(row.status),
        // Legacy aliases mirror the canonical columns.
        quoteDate: quotationDate,
        quotationSubject: text(row.quotationSubject),
        contactNumber: text(row.contactMobile),
        emailAddress: text(row.contactEmail),
        notes: text(row.notes),
        termsAndConditions: text(row.termsAndConditions),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
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
        quotationTitle: input.quotationTitle,
        quoteStage: input.quoteStage,
        quotationDate: fromDateOnly(input.quotationDate),
        validUntil: fromDateOnly(input.validUntil),
        remarks: nullable(input.remarks),
        termsAndCondition: input.termsAndCondition,
        termsAndConditionDescription: nullable(input.termsAndConditionDescription),
        assignedTo: input.assignedTo,
        opportunityName: input.opportunityName,
        company: input.company,
        validationPeriod: input.validationPeriod,
        otherRef: nullable(input.otherRef),
        paymentTerms: input.paymentTerms,
        paymentTermsDescription: nullable(input.paymentTermsDescription),
        preparedFor: input.preparedFor,
        currency: input.currency ?? DEFAULT_CURRENCY,
        groupName: nullable(input.groupName),
        lumpSumDiscount: input.lumpSumDiscount,
        ...totals,
        organizationName: nullable(input.organizationName),
        organizationId: links.organizationId,
        contactName: input.contactName,
        contactId: links.contactId,
        contactMobile: input.contactMobile ?? null,
        mailingName: nullable(input.mailingName),
        gstNo: input.gstNo ?? null,
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
