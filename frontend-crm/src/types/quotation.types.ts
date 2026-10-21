export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected';

export type QuoteStage =
    | 'Draft'
    | 'Negotiation'
    | 'Delivered'
    | 'On Hold'
    | 'Confirmed'
    | 'Closed Accepted'
    | 'Closed Lost'
    | 'Closed Dead';

export const QUOTE_STAGES: QuoteStage[] = [
    'Draft',
    'Negotiation',
    'Delivered',
    'On Hold',
    'Confirmed',
    'Closed Accepted',
    'Closed Lost',
    'Closed Dead',
];

export const QUOTE_COMPANIES: string[] = [
    'Nandini Infosystems',
    'Nandini Infosys Pvt. Ltd.',
];

export const QUOTE_VALIDATION_PERIODS: string[] = [
    '7 Days',
    '15 Days',
    '30 Days',
    '45 Days',
    '60 Days',
    '90 Days',
];

export const QUOTE_TERMS_TEMPLATES: string[] = [
    'Standard Terms & Conditions',
    'Software Licensing Terms',
    'AMC / Support Terms',
    'Custom Terms',
];

export const TERMS_TEMPLATE_DESCRIPTIONS: Record<string, string> = {
    'Standard Terms & Conditions':
        '1. Prices are subject to applicable GST taxes unless indicated otherwise.\n2. Payment terms as agreed upon quotation confirmation.\n3. Software license keys will be electronically delivered within 24-48 business hours after realization of payment.',
    'Software Licensing Terms':
        '1. Annual software licenses and TSS subscriptions are non-refundable once activated.\n2. Remote technical installation and basic configuration are included.\n3. Upgrades and updates are covered during the active TSS subscription validity period.',
    'AMC / Support Terms':
        '1. Annual Maintenance Contract includes periodic software maintenance, database re-indexing, and priority issue resolution.\n2. Critical server incidents will be addressed within 24 hours of escalation.\n3. Hardware replacement and cabling are excluded from software AMC.',
    'Custom Terms':
        '1. Custom agreed terms and conditions between Nandini Infosystems and client.',
};

export const QUOTE_PAYMENT_TERMS: string[] = [
    '100% Advance',
    '50% Advance & 50% on Delivery',
    'Net 15 Days',
    'Net 30 Days',
    'Against Delivery',
];

export const QUOTATION_PAYMENT_TERMS = QUOTE_PAYMENT_TERMS;

export const PAYMENT_TERMS_DESCRIPTIONS: Record<string, string> = {
    '100% Advance':
        '100% Advance payment required prior to software delivery, license provisioning, or deployment commencement.',
    '50% Advance & 50% on Delivery':
        '50% Advance along with purchase order confirmation, remaining 50% upon successful delivery and software deployment.',
    'Net 15 Days':
        'Payment due within 15 calendar days from the date of final invoice delivery.',
    'Net 30 Days':
        'Payment due within 30 calendar days from the date of final invoice delivery.',
    'Against Delivery':
        'Full payment required immediately upon delivery and handover of software licensing.',
};

export const QUOTE_PREPARED_FOR_OPTIONS: string[] = [
    'Customer',
    'Partner',
    'End User',
    'Management',
];

export interface QuotationLineItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    amount: number; // Unit / List price
    discount: number;
    discountType: 'percentage' | 'direct';
    salePrice: number;
    taxRate: string; // e.g. 'GST 18%', 'GST 12%', etc.
    taxAmount: number;
    total: number;
    description?: string;
    note?: string;
}

export interface QuotationFormData {
    // ── Tab 1: Overview ───────────────────────────────────────────
    quotationTitle: string;
    quoteStage: QuoteStage;
    quotationDate: string;
    validUntil: string;
    remarks?: string;
    termsAndCondition: string;
    termsAndConditionDescription?: string;
    assignedTo: string;

    opportunityName: string;
    company: string;
    validationPeriod: string;
    otherRef?: string;
    paymentTerms: string;
    paymentTermsDescription?: string;
    preparedFor: string;

    // ── Tab 2: Line Items ─────────────────────────────────────────
    currency: string;
    groupName?: string;
    lineItems: QuotationLineItem[];
    lumpSumDiscount: number;
    totalAmount: number;
    totalDiscount: number;
    subtotal: number;
    totalTax: number;
    grandTotal: number;

    // ── Tab 3: Address Information ────────────────────────────────
    organizationName?: string;
    organizationId?: string;
    contactName: string;
    contactId?: string;
    contactMobile?: string;
    mailingName?: string;
    gstNo?: string;
    contactEmail?: string;

    billingAddress: string;
    billingCity: string;
    billingState: string;
    billingPostalCode: string;
    billingCountry: string;

    shippingAddress?: string;
    shippingCity?: string;
    shippingState?: string;
    shippingPostalCode?: string;
    shippingCountry?: string;
    copyAddressFromBilling: boolean;

    // ── Linked Context & Backward Compatibility Aliases ───────────
    opportunityId?: string;
    opportunityCode?: string;
    status?: QuotationStatus | QuoteStage;
    quoteDate?: string;
    quotationSubject?: string;
    contactNumber?: string;
    emailAddress?: string;
    notes?: string;
    termsAndConditions?: string;
}

export interface Quotation extends QuotationFormData {
    id: string;
    quotationCode: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

export const QUOTATION_STATUSES: QuotationStatus[] = [
    'Draft',
    'Sent',
    'Accepted',
    'Rejected',
];
