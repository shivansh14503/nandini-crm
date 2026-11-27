import type { ContextBuildInput } from './contexts/contextTypes.js';
import { assembleQuotationContext, sampleCustomValues, type QuotationSource } from './contexts/quotationContext.js';
import type { PdfContext } from './pdf.types.js';

/**
 * Realistic dummy data for template previews when no record is picked. Goes through the same assembler as
 * real records, so formatting, visibility and columns behave identically.
 */

const SAMPLE_QUOTATION: Omit<QuotationSource, 'customValues'> = {
    id: 'sample',
    code: 'QT-00042',
    title: 'Network Infrastructure Upgrade',
    subject: 'Supply and installation of managed switches and Wi-Fi access points',
    date: '2026-11-05',
    validUntil: '2026-12-05',
    stage: 'Delivered',
    opportunityName: 'Head Office Network Refresh',
    opportunityCode: 'OP-00117',
    preparedFor: 'Mr. Rakesh Mehta',
    otherRef: 'RFQ/IT/2026/118',
    validationPeriod: '30 Days',
    issuingCompany: 'Nandini Infosys Pvt. Ltd.',
    currency: 'Indian Rupee: ₹',
    remarks: 'Installation will be scheduled within 7 working days of the purchase order.\nSite readiness to be confirmed by the customer.',
    organizationName: 'Shree Ganesh Textiles Pvt. Ltd.',
    mailingName: 'Shree Ganesh Textiles Pvt. Ltd.',
    gstNo: '24AAKCS1234M1Z5',
    contactName: 'Rakesh Mehta',
    contactMobile: '+91 98250 12345',
    contactEmail: 'rakesh.mehta@sgtextiles.example',
    billing: { street: 'Plot 14, GIDC Industrial Estate, Phase II', city: 'Surat', state: 'Gujarat', postalCode: '394230', country: 'India' },
    shipping: { street: 'Unit 3, Textile Market, Ring Road', city: 'Surat', state: 'Gujarat', postalCode: '395002', country: 'India' },
    salesPerson: { username: 'priya.s', fullName: 'Priya Sharma', phone: '+91 99099 88776', email: 'priya.sharma@nandini.example' },
    totals: { totalAmount: 288000, totalDiscount: 13850, lumpSumDiscount: 1200, subtotal: 274150, totalTax: 49347, grandTotal: 322297 },
    terms: {
        paymentTerms: '50% Advance, 50% on Delivery',
        paymentTermsDescription: '50% advance along with the purchase order.\nBalance 50% within 7 days of delivery.',
        termsAndCondition: 'Standard Terms',
        termsAndConditionDescription:
            'Prices are inclusive of GST as applicable.\nDelivery within 2–3 weeks from the date of the purchase order.\nWarranty as per the manufacturer’s terms.\nSubject to Surat jurisdiction.',
    },
    lineItems: [
        {
            productName: '24-Port Managed Gigabit Switch',
            description: 'Layer 2+ managed switch with 4 × SFP uplinks, rack mountable',
            note: '',
            quantity: 4,
            rate: 38000,
            grossAmount: 152000,
            discount: 5,
            discountAmount: 7600,
            taxRate: '18%',
            taxableAmount: 144400,
        },
        {
            productName: 'Wi-Fi 6 Access Point (Ceiling Mount)',
            description: 'Dual-band 802.11ax, PoE+ powered, cloud managed',
            note: 'Includes mounting kit',
            quantity: 10,
            rate: 12500,
            grossAmount: 125000,
            // An Amount discount (the other lines use a Percentage).
            discount: 6250,
            discountType: 'amount',
            discountAmount: 6250,
            taxRate: '18%',
            taxableAmount: 118750,
        },
        {
            productName: 'Installation & Configuration',
            description: 'On-site installation, VLAN configuration and handover documentation',
            note: '',
            quantity: 1,
            rate: 11000,
            grossAmount: 11000,
            discount: 0,
            discountAmount: 0,
            taxRate: '18%',
            taxableAmount: 11000,
        },
    ],
};

export function buildSampleQuotationContext(input: ContextBuildInput): PdfContext {
    return assembleQuotationContext({ ...SAMPLE_QUOTATION, customValues: sampleCustomValues(input.customFields) }, input);
}
