import type { RecordFile } from './recordFile.types';

export interface OpportunityLineItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    amount: number; // Unit / List price
    discount: number;
    discountType: 'percentage' | 'direct';
    salePrice: number;
    taxRate: string; // e.g. '18%', '12%', '5%', 'None'
    taxAmount: number;
    total: number;
    description?: string;
    note?: string;
}

export interface OpportunityFormData {
    /** Admin-defined custom field values, keyed by FormFieldDefinition.fieldKey. */
    customFields?: Record<string, unknown>;

    opportunityName?: string;
    // Basic Details - Row 1
    productCategory: string[];

    // Basic Details - Row 2
    contact: string;
    contactId?: string;
    organizationName: string;
    organizationId?: string;

    // Basic Details - Row 3
    /** Optional. */
    contactNumber?: string;
    contactEmail?: string;

    // Basic Details - Row 4
    /** Shown, and required, when Lead Source is CA or Reference. */
    referredBy?: string;
    /** Shown, and required, when Lead Source is Partner (partner_nature, as on partner organizations). */
    partnerCompany?: string;

    // Basic Details - Row 5
    type: string;
    salesStage: string;

    // Basic Details - Row 6
    leadSource: string;
    leadGivenBy: string;

    // Basic Details - Row 7
    nextFollowupDate: string;
    nextFollowupTime?: string;
    followupType: string;
    /** What the customer said on the last follow-up (shared_customer_response); picked on every edit. */
    customerResponse?: string;

    // Basic Details - Row 8
    remarks: string;
    description?: string;

    // Basic Details - Row 9
    assignedTo: string;

    // Billing Details
    tallySerialNo?: string;
    invoiceNo?: string;
    invoiceDate?: string;

    // Commission Details
    /** Yes / No. */
    commission: string;
    /** Required when Commission is Yes; empty (null from the API) when No. */
    commissionAmount?: number | string | null;
    /** Self / Other while Commission is Yes (Self up to 1,000, Other above by default); empty otherwise. */
    commissionType?: string;
    /** The commission payee's bank details, shown while Commission Type is Other (as on the Organization form). */
    accountName?: string;
    accountNo?: string;
    bankName?: string;
    ifscCode?: string;
    panNumber?: string;

    // Documentation
    /** Yes / No; must be Yes at Sales Stage PO. */
    addDocument?: string;
    /** The document's details and file (Upload Doc), kept while Add Document is Yes. */
    documentNo?: string;
    documentDate?: string;
    documentRemarks?: string;
    documentFile?: RecordFile | null;

    // Line Items Tab
    currency: string;
    groupName: string;
    lineItems: OpportunityLineItem[];
    lumpSumDiscount: number;
    totalAmount: number;
    totalDiscount: number;
    subtotal: number;
    totalTax: number;
    grandTotal: number;
}

export interface Opportunity extends OpportunityFormData {
    id: string;
    opportunityCode: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
}

// Option Lists based on reference screenshots and Nandini Infosys products
export const OPPORTUNITY_SALES_STAGES: string[] = [
    'Qualification',
    'Demo',
    'Proposal/Price Quote',
    'Negotiation',
    'On Hold',
    'Closed Won',
    'Closed Lost',
    'PO',
    'Advance Received',
];

export const OPPORTUNITY_TYPES: string[] = [
    'Existing Business',
    'New Business',
    'Upgrade / Renewal',
    'Add-on Module',
    'Cloud Migration',
    'Customization & Training',
];

/** Fixed options (the API accepts only these); Yes asks for the Commission Amount. */
export const OPPORTUNITY_COMMISSIONS: string[] = ['No', 'Yes'];

/** Fixed Commission Type options (the API accepts only these); Other asks for the payee's bank details. */
export const OPPORTUNITY_COMMISSION_TYPES: string[] = ['Self', 'Other'];
/** Commission Amounts up to this default to Commission Type Self; larger ones to Other. */
export const SMALL_COMMISSION_LIMIT = 1000;
/** Sales Stage that needs a document: Add Document Yes, with the file (Upload Doc). */
export const PO_SALES_STAGE = 'PO';

export const OPPORTUNITY_CURRENCIES: string[] = [
    'Indian Rupee: ₹',
    'US Dollar: $',
    'Euro: €',
    'GBP: £',
    'AED: د.إ',
];

export const OPPORTUNITY_DOCUMENT_OPTIONS: string[] = [
    'No',
    'Yes',
];

export const OPPORTUNITY_TAX_RATES: string[] = [
    '--None--',
    'GST 18%',
    'GST 12%',
    'GST 5%',
    'GST 28%',
    'GST 0%',
];
