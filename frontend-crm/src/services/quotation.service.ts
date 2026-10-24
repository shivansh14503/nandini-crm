import type { Opportunity } from '../types/opportunity.types';
import type { ExtendedOrganization } from '../types/organization.types';
import type { Contact } from '../types/contact.types';
import type { Quotation, QuotationFormData, QuotationLineItem } from '../types/quotation.types';
import { TERMS_TEMPLATE_DESCRIPTIONS, PAYMENT_TERMS_DESCRIPTIONS } from '../types/quotation.types';
import {
    getStoredQuotations,
    saveStoredQuotations,
    getStoredQuotationById,
    addStoredQuotation,
    updateStoredQuotation,
    deleteStoredQuotation,
    deleteMultipleStoredQuotations,
} from '../data/mockQuotations';
import { createCrudService } from './base.service';
import { DEFAULT_COUNTRY_CODE, normalizeLegacyStateName } from '../data/addressMaster';
import { normalizeCountryValue } from '../utils/address';
import { opportunityService } from './opportunity.service';
import { organizationService } from './organization.service';

const baseQuotationService = createCrudService<
    Quotation,
    QuotationFormData,
    Partial<QuotationFormData>
>('/api/quotations', {
    getAll: getStoredQuotations,
    getById: (id: string) => getStoredQuotationById(id) || undefined,
    create: addStoredQuotation,
    update: updateStoredQuotation,
    delete: deleteStoredQuotation,
    deleteBulk: (ids: string[]) => deleteMultipleStoredQuotations(ids) > 0,
    saveAll: saveStoredQuotations,
});

/**
 * Resolves an address for an opportunity either directly or via its linked organization.
 */
export function resolveOpportunityAddress(
    opportunity: Opportunity,
    organization?: ExtendedOrganization
): {
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
    const org =
        organization ||
        (opportunity.organizationId
            ? organizationService.getByIdSync(opportunity.organizationId)
            : organizationService
                  .getAllSync()
                  .find(
                      (o) =>
                          o.organizationName.trim().toLowerCase() ===
                          opportunity.organizationName.trim().toLowerCase()
                  ));

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
    const addr = resolveOpportunityAddress(opportunity, organization);
    const today = new Date().toISOString().split('T')[0];
    const validityDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const mappedLineItems: QuotationLineItem[] =
        opportunity.lineItems && opportunity.lineItems.length > 0
            ? opportunity.lineItems.map((item) => ({
                  id: item.id || `line-${Date.now()}`,
                  productId: item.productId || '',
                  productName: item.productName || '',
                  quantity: item.quantity || 1,
                  amount: item.amount || 0,
                  discount: item.discount || 0,
                  discountType: item.discountType || 'percentage',
                  salePrice: item.salePrice || item.amount || 0,
                  taxRate: item.taxRate || 'GST 18%',
                  taxAmount: item.taxAmount || 0,
                  total: item.total || 0,
                  description: item.description || '',
                  note: item.note || '',
              }))
            : [
                  {
                      id: `item-${Date.now()}`,
                      productId: '',
                      productName: 'TallyPrime Gold (Multi-User Enterprise)',
                      quantity: 1,
                      amount: 54000,
                      discount: 0,
                      discountType: 'percentage',
                      salePrice: 54000,
                      taxRate: 'GST 18%',
                      taxAmount: 9720,
                      total: 63720,
                      description: 'Standard enterprise package license',
                      note: '',
                  },
              ];

    const quoteTitle = opportunity.opportunityName || opportunity.organizationName || 'B-Softwares';

    return {
        // Tab 1: Overview
        quotationTitle: quoteTitle,
        quoteStage: 'Draft',
        quotationDate: today,
        validUntil: validityDate,
        remarks: opportunity.addDescription || '',
        termsAndCondition: 'Standard Terms & Conditions',
        termsAndConditionDescription: TERMS_TEMPLATE_DESCRIPTIONS['Standard Terms & Conditions'],
        assignedTo: opportunity.assignedTo || 'mittal.sharma',

        opportunityName: quoteTitle,
        company: 'Nandini Infosystems',
        validationPeriod: '30 Days',
        otherRef: '',
        paymentTerms: '50% Advance & 50% on Delivery',
        paymentTermsDescription: PAYMENT_TERMS_DESCRIPTIONS['50% Advance & 50% on Delivery'],
        preparedFor: 'Customer',

        // Tab 2: Line Items
        currency: opportunity.currency || 'Indian Rupee: ₹',
        groupName: opportunity.groupName || 'Software Licenses & Add-ons',
        lineItems: mappedLineItems,
        lumpSumDiscount: opportunity.lumpSumDiscount || 0,
        totalAmount: opportunity.totalAmount || 0,
        totalDiscount: opportunity.totalDiscount || 0,
        subtotal: opportunity.subtotal || 0,
        totalTax: opportunity.totalTax || 0,
        grandTotal: opportunity.grandTotal || 0,

        // Tab 3: Address Information
        organizationName: opportunity.organizationName,
        organizationId: opportunity.organizationId || organization?.id,
        contactName: opportunity.contactName,
        contactId: opportunity.contactId || contact?.id,
        contactMobile: opportunity.contactNumber || contact?.mobile || '',
        mailingName: organization?.mailingName || opportunity.organizationName,
        gstNo: organization?.gstNumber || '',
        contactEmail: opportunity.emailAddress || contact?.emailAddresses?.[0]?.email || '',

        billingAddress: addr.billingStreet,
        billingCity: addr.billingCity,
        billingState: addr.billingState || 'Delhi',
        billingPostalCode: addr.billingPostalCode,
        billingCountry: addr.billingCountry || DEFAULT_COUNTRY_CODE,

        shippingAddress: addr.shippingStreet,
        shippingCity: addr.shippingCity,
        shippingState: addr.shippingState || 'Delhi',
        shippingPostalCode: addr.shippingPostalCode,
        shippingCountry: addr.shippingCountry || DEFAULT_COUNTRY_CODE,
        copyAddressFromBilling: true,

        // Aliases / Context
        opportunityId: opportunity.id,
        opportunityCode: opportunity.opportunityCode,
        status: 'Draft',
        quoteDate: today,
        quotationSubject: quoteTitle,
        contactNumber: opportunity.contactNumber || contact?.mobile || '',
        emailAddress: opportunity.emailAddress || contact?.emailAddresses?.[0]?.email || '',
        notes: opportunity.addDescription || '',
        termsAndConditions: TERMS_TEMPLATE_DESCRIPTIONS['Standard Terms & Conditions'],
    };
}

/**
 * Creates a quotation record from an opportunity and progresses the opportunity's sales stage.
 */
export async function createQuotationFromOpportunity(
    opportunityId: string,
    values: QuotationFormData
): Promise<Quotation> {
    const newQuote = await baseQuotationService.create(values);

    // Update opportunity stage to "Proposal/Price Quote" if not already closed
    try {
        const opp = await opportunityService.getById(opportunityId);
        if (
            opp &&
            opp.salesStage !== 'Closed Won' &&
            opp.salesStage !== 'Closed Lost' &&
            opp.salesStage !== 'Proposal/Price Quote'
        ) {
            await opportunityService.update(opportunityId, {
                salesStage: 'Proposal/Price Quote',
            });
        }
    } catch {
        // Non-blocking stage update
    }

    return newQuote;
}

export const quotationService = {
    ...baseQuotationService,
    getAllQuotations: baseQuotationService.getAllSync,
    getQuotationById: baseQuotationService.getByIdSync,
    createQuotation: baseQuotationService.create,
    updateQuotation: baseQuotationService.update,
    deleteQuotation: baseQuotationService.delete,
    bulkDeleteQuotations: baseQuotationService.deleteBulk,
    buildQuotationDefaultsFromOpportunity,
    createQuotationFromOpportunity,
    resolveOpportunityAddress,
};
