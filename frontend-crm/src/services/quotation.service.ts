import type { Opportunity } from '../types/opportunity.types';
import type { ExtendedOrganization } from '../types/organization.types';
import type { Contact } from '../types/contact.types';
import type { Quotation, QuotationFormData, QuotationLineItem } from '../types/quotation.types';
import { DEFAULT_CURRENCY, toGstType, toLineItem, toRoundOff, totalsOf } from '../lib/line-items';
import { TERMS_TEMPLATE_DESCRIPTIONS, PAYMENT_TERMS_DESCRIPTIONS } from '../types/quotation.types';
import { createCrudService } from './base.service';
import { DEFAULT_COUNTRY_CODE, normalizeLegacyStateName } from '../data/addressMaster';
import { normalizeCountryValue } from '../utils/address';
import { notifyCrmUpdate } from './crmSync';

const baseQuotationService = createCrudService<Quotation, QuotationFormData, Partial<QuotationFormData>>('/api/quotations');

/** Billing / shipping address for a quote, taken from the opportunity's organization (loaded by the caller). */
export function resolveQuoteAddress(org?: ExtendedOrganization): {
    hasCompleteAddress: boolean;
    billingStreet: string;
    billingCity: string;
    billingState: string;
    billingPostalCode: string;
    billingCountry: string;
    shippingStreet: string;
    shippingCity: string;
    shippingState: string;
    shippingPostalCode: string;
    shippingCountry: string;
} {
    const billingStreet = (org?.billingStreet || '').trim();
    const billingCity = (org?.billingCity || '').trim();
    const billingCountry = normalizeCountryValue(org?.billingCountry);
    const billingState = normalizeLegacyStateName(org?.billingState, billingCountry);
    const billingPostalCode = (org?.billingPostalCode || '').trim();

    const shippingStreet = (org?.shippingStreet || billingStreet).trim();
    const shippingCity = (org?.shippingCity || billingCity).trim();
    const shippingCountry = normalizeCountryValue(org?.shippingCountry || billingCountry);
    const shippingState = normalizeLegacyStateName(org?.shippingState || billingState, shippingCountry);
    const shippingPostalCode = (org?.shippingPostalCode || billingPostalCode).trim();

    const hasCompleteAddress = Boolean(
        billingStreet && billingCity && billingState && billingPostalCode
    );

    return {
        hasCompleteAddress,
        billingStreet,
        billingCity,
        billingState,
        billingPostalCode,
        billingCountry,
        shippingStreet,
        shippingCity,
        shippingState,
        shippingPostalCode,
        shippingCountry,
    };
}

/**
 * Pre-populates Quotation form defaults from a source Opportunity and its linked Account/Contact.
 */
export function buildQuotationDefaultsFromOpportunity(
    opportunity: Opportunity,
    organization?: ExtendedOrganization,
    contact?: Contact
): QuotationFormData {
    const addr = resolveQuoteAddress(organization);
    const today = new Date().toISOString().split('T')[0];
    const validityDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // The opportunity's lines, as they are (same fields on both); none starts the quote on one empty line.
    const mappedLineItems: QuotationLineItem[] = (opportunity.lineItems ?? []).map((item) => toLineItem({ ...item }));


    const quoteTitle = opportunity.opportunityName || opportunity.organizationName || 'B-Softwares';

    return {
        // Tab 1: Overview
        quotationTitle: quoteTitle,
        quoteStage: 'Draft',
        quotationDate: today,
        validUntil: validityDate,
        remarks: opportunity.remarks || '',
        termsAndCondition: 'Standard Terms & Conditions',
        termsAndConditionDescription: TERMS_TEMPLATE_DESCRIPTIONS['Standard Terms & Conditions'],
        assignedTo: opportunity.assignedTo || '',

        opportunity: quoteTitle,
        company: 'Nandini Infosystems',
        validationPeriod: '30 Days',
        otherRef: '',
        paymentTerms: '50% Advance & 50% on Delivery',
        paymentTermsDescription: PAYMENT_TERMS_DESCRIPTIONS['50% Advance & 50% on Delivery'],
        preparedFor: 'Customer',

        // Tab 2: Line Items
        // Opportunities have no currency (₹); the quotation's can be changed on its Line Items tab.
        currency: DEFAULT_CURRENCY,
        lineItems: mappedLineItems,
        lumpSumDiscount: opportunity.lumpSumDiscount || 0,
        roundOff: toRoundOff(opportunity.roundOff),
        // The opportunity's GST split until the quotation's own address is checked (the Line Items editor does it).
        gstType: toGstType(opportunity.gstType),
        // Recomputed from the lines, exactly as the API checks them.
        ...totalsOf(mappedLineItems, { lumpSumDiscount: opportunity.lumpSumDiscount || 0, roundOff: opportunity.roundOff, gstType: opportunity.gstType }),

        // Tab 3: Address Information
        organizationName: opportunity.organizationName,
        organizationId: opportunity.organizationId || organization?.id,
        contact: opportunity.contact,
        contactId: opportunity.contactId || contact?.id,
        contactNumber: opportunity.contactNumber || contact?.mobile || '',
        mailingName: organization?.mailingName || opportunity.organizationName,
        gstNumber: organization?.gstNumber || '',
        contactEmail: opportunity.contactEmail || contact?.emailAddress?.[0]?.email || '',

        billingAddress: addr.billingStreet,
        billingCity: addr.billingCity,
        billingState: addr.billingState || '',
        billingPostalCode: addr.billingPostalCode,
        billingCountry: addr.billingCountry || DEFAULT_COUNTRY_CODE,

        shippingAddress: addr.shippingStreet,
        shippingCity: addr.shippingCity,
        shippingState: addr.shippingState || '',
        shippingPostalCode: addr.shippingPostalCode,
        shippingCountry: addr.shippingCountry || DEFAULT_COUNTRY_CODE,
        copyAddressFromBilling: true,

        // Aliases / Context
        opportunityId: opportunity.id,
        opportunityCode: opportunity.opportunityCode,
        status: 'Draft',
        quoteDate: today,
        quotationSubject: quoteTitle,
        notes: opportunity.remarks || '',
        termsAndConditions: TERMS_TEMPLATE_DESCRIPTIONS['Standard Terms & Conditions'],
    };
}

/**
 * Creates a quotation for an opportunity. The API advances the opportunity to "Proposal/Price Quote" in the same
 * transaction (unless it is already closed), so the opportunity's cache is refreshed too.
 */
export async function createQuotationFromOpportunity(opportunityId: string, values: QuotationFormData): Promise<Quotation> {
    const quotation = await baseQuotationService.create({ ...values, opportunityId });
    notifyCrmUpdate('/api/opportunities', opportunityId);
    return quotation;
}

export const quotationService = {
    ...baseQuotationService,
    buildQuotationDefaultsFromOpportunity,
    createQuotationFromOpportunity,
    resolveQuoteAddress,
};
