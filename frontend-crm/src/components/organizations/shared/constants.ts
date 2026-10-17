import type {
    NatureOfBusiness,
    AccountStatus,
    TypeOfEntity,
    CustomerType,
    AnnualTurnover,
    NumberOfEmployees,
    SourceOfLead,
} from '../../../types/organization.types';

// ─── Option lists ─────────────────────────────────────────────────────────────
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

export const ACCOUNT_STATUSES: AccountStatus[] = ['Active', 'Inactive', 'Prospect', 'Blacklisted'];

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

export const INDIAN_STATES: string[] = [
    'Andhra Pradesh',
    'Arunachal Pradesh',
    'Assam',
    'Bihar',
    'Chhattisgarh',
    'Goa',
    'Gujarat',
    'Haryana',
    'Himachal Pradesh',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Sikkim',
    'Tamil Nadu',
    'Telangana',
    'Tripura',
    'Uttar Pradesh',
    'Uttarakhand',
    'West Bengal',
    'Andaman and Nicobar Islands',
    'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi',
    'Jammu and Kashmir',
    'Ladakh',
    'Lakshadweep',
    'Puducherry',
];

export const COUNTRIES: string[] = [
    'India',
    'United States',
    'United Kingdom',
    'United Arab Emirates',
    'Singapore',
    'Germany',
    'Australia',
    'Canada',
    'Other',
];

export const REGISTRATION_TYPES: string[] = [
    'Registered',
    'Unregistered',
    'Composition Scheme',
    'Consumer',
    'Overseas / Export',
    'Special Economic Zone (SEZ)',
];

export const ACCOUNT_TYPES: string[] = [
    'Current Account',
    'Savings Account',
    'Cash Credit (CC)',
    'Overdraft (OD)',
    'Escrow Account',
    'Other',
];

// ─── Shared field styles ──────────────────────────────────────────────────────
export const fieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: '#fff',
        fontSize: '0.85rem',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2563EB' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#2563EB',
            borderWidth: '1.5px',
        },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: '#2563EB' },
};
