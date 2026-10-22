import type {
    NatureOfBusiness,
    AccountStatus,
    TypeOfEntity,
    CustomerType,
    AnnualTurnover,
    NumberOfEmployees,
    SourceOfLead,
} from '@/types/organization.types';

export const NATURE_OF_BUSINESS: NatureOfBusiness[] = [
    'Distributor / Wholesale Trading',
    'Manufacturing',
    'Retail',
    'Services',
    'IT / Software',
    'Healthcare',
    'Education',
    'Construction',
    'Transportation',
    'Consulting',
    'Government / PSU',
    'Other',
];

export const ACCOUNT_STATUSES: AccountStatus[] = ['Active', 'Inactive'];

export const ENTITY_TYPES: TypeOfEntity[] = [
    'Private Limited Company (Pvt. Ltd.)',
    'Public Limited Company (Ltd.)',
    'Limited Liability Partnership (LLP)',
    'Partnership Firm',
    'Sole Proprietorship',
    'Trust / NGO',
    'Government Body',
    'Foreign Entity',
    'Other',
];

export const CUSTOMER_TYPES: CustomerType[] = [
    'Authorized Reseller',
    'Direct Customer',
    'OEM Partner',
    'System Integrator',
    'End User',
    'Distributor',
    'Partner',
    'Internal',
];

export const ANNUAL_TURNOVERS: AnnualTurnover[] = [
    'Below ₹25 Lakhs',
    '₹25 Lakhs – ₹1 Cr',
    '₹1 Cr – ₹1.5 Cr',
    '₹1.5 Cr – ₹5 Cr',
    '₹5 Cr – ₹25 Cr',
    '₹25 Cr – ₹100 Cr',
    'Above ₹100 Cr',
];

export const EMPLOYEE_COUNTS: NumberOfEmployees[] = [
    '1 – 10 Staff Members',
    '11 – 50 Staff Members',
    '51 – 200 Staff Members',
    '201 – 500 Staff Members',
    '500+ Staff Members',
];

export const LEAD_SOURCES: SourceOfLead[] = [
    'Client Referral',
    'Website Enquiry',
    'Cold Call',
    'Email Campaign',
    'Exhibition / Trade Show',
    'LinkedIn / Social Media',
    'Partner Referral',
    'Other',
];
