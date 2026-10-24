import type { CorporateEmail } from './organization.types';

export interface LeadFormData {
    // Overview - Left Column
    name: string;
    mobile: string;
    emailAddresses: CorporateEmail[];
    mailingName?: string;
    designation?: string;
    leadSource: string;
    productCategory: string[];
    followupType: string;
    addDescription: string;
    registrationType?: string;
    turnover?: string;
    assignedTo: string;

    // Overview - Right Column
    otherPhone?: string;
    organizationName?: string;
    department?: string;
    leadType: string;
    status: string;
    nextFollowupDate: string;
    nextFollowupTime?: string;
    description?: string;
    noOfEmployee?: string;
    referredBy?: string;

    // Primary Address - Left Column
    primaryAddress?: string;
    primaryCity?: string;
    primaryState?: string;
    primaryPostalCode?: string;
    primaryCountry?: string;
    primaryLatitude?: string;

    // Other Address - Right Column
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

export const LEAD_TYPES: string[] = [
    'Hot',
    'Warm',
    'Cold',
    'Corporate',
    'SME',
    'Enterprise',
];

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
