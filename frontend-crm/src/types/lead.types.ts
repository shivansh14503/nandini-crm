import type { CorporateEmail } from './organization.types';

export interface LeadFormData {
    /** Admin-defined custom field values, keyed by FormFieldDefinition.fieldKey. */
    customFields?: Record<string, unknown>;

    // Overview - Left Column
    name: string;
    mobile: string;
    emailAddress: CorporateEmail[];
    mailingName?: string;
    tradeName?: string;
    designation?: string;
    leadSource: string;
    productCategory: string[];
    followupType: string;
    /** What the customer said on the last follow-up (shared_customer_response); picked on every edit. */
    customerResponse?: string;
    remarks: string;
    registrationType?: string;
    gstNumber?: string;
    turnover?: string;
    assignedTo: string;

    // Overview - Right Column
    otherPhone?: string;
    organizationName?: string;
    department?: string;
    leadType: string;
    /** Rating: Hot / Warm / Cold, set by the system (read-only, not on any form). */
    rating?: string;
    /** Why the current Rating (read-only). */
    ratingReason?: string;
    /** Consecutive unanswered calls (read-only). */
    unansweredCalls?: number;
    status: string;
    nextFollowupDate: string;
    nextFollowupTime?: string;
    description?: string;
    noOfEmployee?: string;
    /** Shown, and required, when Lead Source is CA or Reference: the referral's name (see referredById). */
    referredBy?: string;
    /** Id of the Referral picked as Referred By; empty for a value typed before the Referrals module existed. */
    referredById?: string;
    /** Shown, and required, when Lead Source is Partner (partner_nature, as on partner organizations). */
    partnerCompany?: string;

    // Billing Address - Left Column
    primaryAddress?: string;
    primaryCity?: string;
    primaryState?: string;
    primaryPostalCode?: string;
    primaryCountry?: string;
    primaryLatitude?: string;

    // Shipping Address - Right Column
    otherAddress?: string;
    otherCity?: string;
    otherState?: string;
    otherPostalCode?: string;
    otherCountry?: string;
    copyAddressFromLeft?: boolean;
    otherLongitude?: string;
}

export interface Lead extends LeadFormData {
    id: string;
    leadCode: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
}

// Option Lists based on reference screenshots & Nandini Infosys products
export const LEAD_SOURCES: string[] = [
    'Client Referral',
    'Website Enquiry',
    'Cold Call',
    'Email Campaign',
    'Exhibition / Trade Show',
    'LinkedIn / Social Media',
    'Partner Referral',
    'Tally Partner Network',
    'Direct Walk-in',
    'Google Search / Ad',
    'Other',
    // CA / Reference ask for Referred By, Partner for a Partner Company (see leadSourceDetailIssues).
    'CA',
    'Reference',
    'Partner',
];

export const PRODUCT_CATEGORIES: string[] = [
    'Acronis',
    'Biz Analyst',
    'Connect 21',
    'CredFlow',
    'CRM',
    'Data Warehouse',
    'Tally AMC',
    'Tally Customization',
    'Tally On Cloud',
    'Tally Service',
    'Tally Software Service (TSS)',
    'Tally Training',
    'Tally Upgrade',
    'TallyPrime',
    'TallyPrime Server',
    'Teramind',
    'TVU',
];

export const FOLLOWUP_TYPES: string[] = [
    'Call',
    'Meeting',
    'Demo / Presentation',
    'Email',
    'WhatsApp',
    'Site Visit',
];

/** Fallback Lead Type options while the admin configuration (`lead_type`) loads. */
export const LEAD_TYPES: string[] = ['Inbound', 'Outbound', 'Marketing'];

/** A lead's Rating (`Lead.rating`). Set by the system, never on a form; not the same thing as Lead Type. */
export const LEAD_RATINGS = ['Hot', 'Warm', 'Cold'] as const;

export const LEAD_STATUSES: string[] = [
    'New',
    'Contacted',
    'In Discussion',
    'Demo Scheduled',
    'Proposal Sent',
    'Qualified',
    'Negotiation',
    'Converted',
    'Unqualified / Lost',
];

export const LEAD_DESIGNATIONS: string[] = [
    'Managing Director / MD',
    'Director / Partner',
    'Chief Executive Officer (CEO)',
    'Chief Financial Officer (CFO)',
    'Purchase Head / Manager',
    'Accounts & Finance Head',
    'IT Manager / Systems Head',
    'Sales & Marketing Head',
    'Operations Manager',
    'Proprietor / Owner',
    'Senior Accountant',
    'Other',
];

export const LEAD_DEPARTMENTS: string[] = [
    'Executive Management',
    'Procurement & Purchase',
    'Finance & Accounts',
    'Information Technology (IT)',
    'Sales & Marketing',
    'Operations',
    'Human Resources (HR)',
    'Administration',
    'Other',
];

export const LEAD_REGISTRATION_TYPES: string[] = [
    'Registered',
    'Unregistered',
    'Composition Scheme',
    'Consumer',
    'Overseas / Export',
    'Special Economic Zone (SEZ)',
];

export const LEAD_TURNOVER_RANGES: string[] = [
    'Below ₹25 Lakhs',
    '₹25 Lakhs – ₹1 Cr',
    '₹1 Cr – ₹1.5 Cr',
    '₹1.5 Cr – ₹5 Cr',
    '₹5 Cr – ₹25 Cr',
    '₹25 Cr – ₹100 Cr',
    'Above ₹100 Cr',
];

export const LEAD_EMPLOYEE_RANGES: string[] = [
    '1 – 10 Staff Members',
    '11 – 50 Staff Members',
    '51 – 200 Staff Members',
    '201 – 500 Staff Members',
    '500+ Staff Members',
];

export const LEAD_ASSIGNED_USERS: string[] = [
    'mittal.sharma',
    'bhanu.pratap',
    'neha.gupta',
    'amit.verma',
    'priya.sharma',
];
