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
    'Agriculture & Food Processing',
    'Apparel & Textiles',
    'Association / Society / NGO / Trust',
    'Automobile & Auto Components',
    'Biotechnology & Pharmaceuticals',
    'CA Firm / Accounting & Taxation',
    'Chemicals',
    'Communications & Telecommunications',
    'Construction & Real Estate',
    'Consulting & Professional Services',
    'Distributor / Trading / Wholesale',
    'E-commerce / Online Business',
    'Education & Training',
    'Electronics & Electricals',
    'Energy & Utilities',
    'Engineering',
    'Entertainment & Recreation',
    'Environmental Services',
    'Finance & Banking',
    'Government / Public Sector',
    'Healthcare & Medical',
    'Hospitality / Hotel / Restaurant',
    'Import / Export',
    'Insurance',
    'Jewellery & Gems',
    'Logistics & Warehousing',
    'Machinery & Industrial Equipment',
    'Manufacturing',
    'Media / Advertising / Marketing',
    'Printing / Packaging / Publishing',
    'Retail',
    'Technology / IT & Software',
    'Transportation & Logistics',
];

export const ACCOUNT_STATUSES: AccountStatus[] = ['Active', 'Inactive'];

export const ENTITY_TYPES: TypeOfEntity[] = [
    'Association',
    'Government',
    'HUF',
    'LLP',
    'NGO',
    'Partnership',
    'Private Limited',
    'Proprietorship',
    'PSU',
    'Public Limited',
    'RWA',
    'Section 8 Company',
    'Society',
    'Trust',
];

export const CUSTOMER_TYPES: CustomerType[] = [
    'BMW',
    'CEAT',
    'End User',
    'GAIA',
    'IFFCO',
    'Luxottica',
    'Partner',
    'Samsung',
    'Usha',
    'Valvoline',
    'ValvolineSFDC',
];

export const ANNUAL_TURNOVERS: AnnualTurnover[] = [
    'Less than 1.5 crore',
    '1.5 crore to 5 crore',
    '5 crore to 10 crore',
    'Greater than 10 crore',
];

export const EMPLOYEE_COUNTS: NumberOfEmployees[] = [
    'Less than 20',
    '21 To 50',
    '51 To 100',
    '101 To 250',
    '251 To 500',
    '501 To 1000',
    '1001 & Above',
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
