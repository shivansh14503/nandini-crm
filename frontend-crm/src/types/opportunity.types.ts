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
    // Basic Details - Row 1
    productCategory: string[];

    // Basic Details - Row 2
    contactName: string;
    contactId?: string;
    organizationName: string;
    organizationId?: string;

    // Basic Details - Row 3
    contactNumber: string;
    emailAddress?: string;

    // Basic Details - Row 4
    referredBy?: string;

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

    // Basic Details - Row 8
    addDescription: string;
    description?: string;

    // Basic Details - Row 9
    assignedTo: string;

    // Billing Details
    tallySerialNo?: string;
    invoiceNo?: string;
    invoiceDate?: string;

    // Commission Details
    commission: string;

    // Document
    addDocument?: string;

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
}

// Option Lists based on reference screenshots and Nandini Infosys products
export const OPPORTUNITY_SALES_STAGES: string[] = [
    'Qualification',
    'Needs Analysis',
    'Value Proposition',
    'Id. Decision Makers',
    'Perception Analysis',
    'Proposal/Price Quote',
    'Negotiation/Review',
    'Closed Won',
    'Closed Lost',
];

export const OPPORTUNITY_TYPES: string[] = [
    'Existing Business',
    'New Business',
    'Upgrade / Renewal',
    'Add-on Module',
    'Cloud Migration',
    'Customization & Training',
];

export const OPPORTUNITY_COMMISSIONS: string[] = [
    'Standard (10%)',
    'Executive (15%)',
    'Partner Split (20%)',
    'Direct (5%)',
    'Nil / Direct (0%)',
];

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
