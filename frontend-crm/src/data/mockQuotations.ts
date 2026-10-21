import type { Quotation } from '../types/quotation.types';
import { TERMS_TEMPLATE_DESCRIPTIONS, PAYMENT_TERMS_DESCRIPTIONS } from '../types/quotation.types';

export const QUOTATIONS_STORAGE_KEY = 'crm_mock_quotations_v2';

export const INITIAL_MOCK_QUOTATIONS: Quotation[] = [
    {
        id: 'qt-1001',
        quotationCode: 'QT-2026-1001',

        // Tab 1: Overview
        quotationTitle: 'B-Softwares Enterprise Deal',
        quoteStage: 'Draft',
        quotationDate: '2026-10-18',
        validUntil: '2026-11-17',
        remarks: 'Price includes standard installation and 1 year TSS subscription renewal.',
        termsAndCondition: 'Standard Terms & Conditions',
        termsAndConditionDescription: TERMS_TEMPLATE_DESCRIPTIONS['Standard Terms & Conditions'],
        assignedTo: 'mittal.sharma',

        opportunityName: 'B-Softwares Enterprise Deal',
        opportunityId: 'opp-1001',
        opportunityCode: 'OPP-1001',
        company: 'Nandini Infosystems',
        validationPeriod: '30 Days',
        otherRef: 'REF-2026-091',
        paymentTerms: '50% Advance & 50% on Delivery',
        paymentTermsDescription: PAYMENT_TERMS_DESCRIPTIONS['50% Advance & 50% on Delivery'],
        preparedFor: 'Customer',

        // Tab 2: Line items
        currency: 'Indian Rupee: ₹',
        groupName: 'Software Licenses & Add-ons',
        lineItems: [
            {
                id: 'item-101',
                productId: 'prd-tally-gold',
                productName: 'TallyPrime Gold (Multi-User Enterprise)',
                quantity: 2,
                amount: 54000,
                discount: 5,
                discountType: 'percentage',
                salePrice: 51300,
                taxRate: 'GST 18%',
                taxAmount: 18468,
                total: 121068,
                description: 'Multi-user concurrent network licenses with 1 year TSS subscription.',
                note: 'Deployment on local LAN with remote access enabled.',
            },
            {
                id: 'item-102',
                productId: 'prd-biz-analyst',
                productName: 'Biz Analyst Mobile Dashboard (10 Users)',
                quantity: 1,
                amount: 18000,
                discount: 10,
                discountType: 'percentage',
                salePrice: 16200,
                taxRate: 'GST 18%',
                taxAmount: 2916,
                total: 19116,
                description: 'Real-time sales, outstanding, and ledger analytics on iOS/Android.',
                note: 'Configured for sync with central Tally Server.',
            },
        ],
        lumpSumDiscount: 0,
        totalAmount: 126000,
        totalDiscount: 7200,
        subtotal: 118800,
        totalTax: 21384,
        grandTotal: 140184,

        // Tab 3: Address Information
        organizationName: 'Apex Industrial Solutions Pvt Ltd',
        organizationId: 'org-001',
        contactName: 'Vikram Malhotra',
        contactId: 'con-1001',
        contactMobile: '+91 98112 45890',
        mailingName: 'Apex Industrial Solutions Pvt. Ltd.',
        gstNo: '07AAAAA0000A1Z5',
        contactEmail: 'vikram.m@apexindustries.in',

        billingAddress: 'Plot 45, Phase III, Okhla Industrial Area',
        billingCity: 'New Delhi',
        billingState: 'Delhi',
        billingPostalCode: '110020',
        billingCountry: 'India',

        shippingAddress: 'Plot 45, Phase III, Okhla Industrial Area',
        shippingCity: 'New Delhi',
        shippingState: 'Delhi',
        shippingPostalCode: '110020',
        shippingCountry: 'India',
        copyAddressFromBilling: true,

        // Aliases & Context
        status: 'Draft',
        quoteDate: '2026-10-18',
        quotationSubject: 'B-Softwares Enterprise Deal',
        contactNumber: '+91 98112 45890',
        emailAddress: 'vikram.m@apexindustries.in',
        notes: 'Price includes standard installation and 1 year TSS subscription renewal.',
        termsAndConditions: TERMS_TEMPLATE_DESCRIPTIONS['Standard Terms & Conditions'],

        createdAt: '2026-10-18T10:00:00Z',
        updatedAt: '2026-10-18T10:00:00Z',
        createdBy: 'mittal.sharma',
    },
];

export function getStoredQuotations(): Quotation[] {
    if (typeof window === 'undefined') {
        return INITIAL_MOCK_QUOTATIONS;
    }
    try {
        const item = localStorage.getItem(QUOTATIONS_STORAGE_KEY);
        if (!item) {
            localStorage.setItem(QUOTATIONS_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_QUOTATIONS));
            return INITIAL_MOCK_QUOTATIONS;
        }
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
    } catch {
        // Fallback on error
    }
    return INITIAL_MOCK_QUOTATIONS;
}

export function saveStoredQuotations(quotations: Quotation[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(QUOTATIONS_STORAGE_KEY, JSON.stringify(quotations));
    } catch {
        // Storage limit reached or private mode
    }
}

export function getStoredQuotationById(id: string): Quotation | null {
    const list = getStoredQuotations();
    return list.find((q) => q.id === id) || null;
}

export function addStoredQuotation(data: Partial<Quotation>): Quotation {
    const list = getStoredQuotations();
    const count = list.length + 1;
    const year = new Date().getFullYear();
    const quotationCode = `QT-${year}-${String(1000 + count).slice(-4)}`;
    const now = new Date().toISOString();

    const newQuotation: Quotation = {
        id: `qt-${Date.now()}`,
        quotationCode,
        createdAt: now,
        updatedAt: now,
        createdBy: data.assignedTo || 'mittal.sharma',

        quotationTitle: data.quotationTitle || data.quotationSubject || 'Quotation',
        quoteStage: data.quoteStage || (data.status as never) || 'Draft',
        quotationDate: data.quotationDate || data.quoteDate || now.split('T')[0],
        validUntil: data.validUntil || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        remarks: data.remarks || data.notes || '',
        termsAndCondition: data.termsAndCondition || 'Standard Terms & Conditions',
        termsAndConditionDescription: data.termsAndConditionDescription || data.termsAndConditions || '',
        assignedTo: data.assignedTo || 'mittal.sharma',

        opportunityName: data.opportunityName || data.quotationTitle || '',
        company: data.company || 'Nandini Infosystems',
        validationPeriod: data.validationPeriod || '30 Days',
        otherRef: data.otherRef || '',
        paymentTerms: data.paymentTerms || '50% Advance & 50% on Delivery',
        paymentTermsDescription: data.paymentTermsDescription || '',
        preparedFor: data.preparedFor || 'Customer',

        currency: data.currency || 'Indian Rupee: ₹',
        groupName: data.groupName || 'Software Licenses & Add-ons',
        lineItems: data.lineItems || [],
        lumpSumDiscount: data.lumpSumDiscount || 0,
        totalAmount: data.totalAmount || 0,
        totalDiscount: data.totalDiscount || 0,
        subtotal: data.subtotal || 0,
        totalTax: data.totalTax || 0,
        grandTotal: data.grandTotal || 0,

        organizationName: data.organizationName || '',
        organizationId: data.organizationId || '',
        contactName: data.contactName || '',
        contactId: data.contactId || '',
        contactMobile: data.contactMobile || data.contactNumber || '',
        mailingName: data.mailingName || data.organizationName || '',
        gstNo: data.gstNo || '',
        contactEmail: data.contactEmail || data.emailAddress || '',

        billingAddress: data.billingAddress || '',
        billingCity: data.billingCity || '',
        billingState: data.billingState || 'Delhi',
        billingPostalCode: data.billingPostalCode || '',
        billingCountry: data.billingCountry || 'India',

        shippingAddress: data.shippingAddress || data.billingAddress || '',
        shippingCity: data.shippingCity || data.billingCity || '',
        shippingState: data.shippingState || data.billingState || 'Delhi',
        shippingPostalCode: data.shippingPostalCode || data.billingPostalCode || '',
        shippingCountry: data.shippingCountry || data.billingCountry || 'India',
        copyAddressFromBilling: data.copyAddressFromBilling ?? true,

        opportunityId: data.opportunityId || '',
        opportunityCode: data.opportunityCode || '',
        status: data.quoteStage || data.status || 'Draft',
        quoteDate: data.quotationDate || data.quoteDate || now.split('T')[0],
        quotationSubject: data.quotationTitle || data.quotationSubject || '',
        contactNumber: data.contactMobile || data.contactNumber || '',
        emailAddress: data.contactEmail || data.emailAddress || '',
        notes: data.remarks || data.notes || '',
        termsAndConditions: data.termsAndConditionDescription || data.termsAndConditions || '',
    };

    const updated = [newQuotation, ...list];
    saveStoredQuotations(updated);
    return newQuotation;
}

export function updateStoredQuotation(id: string, updates: Partial<Quotation>): Quotation | null {
    const list = getStoredQuotations();
    const index = list.findIndex((q) => q.id === id);
    if (index === -1) return null;

    const existing = list[index];
    const updated: Quotation = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
    };

    list[index] = updated;
    saveStoredQuotations(list);
    return updated;
}

export function deleteStoredQuotation(id: string): boolean {
    const list = getStoredQuotations();
    const filtered = list.filter((q) => q.id !== id);
    if (filtered.length !== list.length) {
        saveStoredQuotations(filtered);
        return true;
    }
    return false;
}

export function deleteMultipleStoredQuotations(ids: string[]): number {
    const idSet = new Set(ids);
    const list = getStoredQuotations();
    const filtered = list.filter((q) => !idSet.has(q.id));
    const deletedCount = list.length - filtered.length;
    saveStoredQuotations(filtered);
    return deletedCount;
}
