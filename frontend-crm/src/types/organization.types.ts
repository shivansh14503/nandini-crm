// ─── Organization Types ───────────────────────────────────────────────────────

export type NatureOfBusiness =
    | 'Distributor / Wholesale Trading'
    | 'Manufacturing'
    | 'Retail'
    | 'Services'
    | 'IT / Software'
    | 'Healthcare'
    | 'Education'
    | 'Government / PSU'
    | 'Other';

export type AccountStatus = 'Active' | 'Inactive' | 'Prospect' | 'Blacklisted';

export type TypeOfEntity =
    | 'Private Limited Company (Pvt. Ltd.)'
    | 'Public Limited Company (Ltd.)'
    | 'Limited Liability Partnership (LLP)'
    | 'Partnership Firm'
    | 'Sole Proprietorship'
    | 'Trust / NGO'
    | 'Government Body'
    | 'Foreign Entity'
    | 'Other';

export type CustomerType =
    | 'Authorized Reseller'
    | 'Direct Customer'
    | 'OEM Partner'
    | 'System Integrator'
    | 'End User'
    | 'Distributor'
    | 'Internal';

export type AnnualTurnover =
    | 'Below ₹25 Lakhs'
    | '₹25 Lakhs – ₹1 Cr'
    | '₹1 Cr – ₹1.5 Cr'
    | '₹1.5 Cr – ₹5 Cr'
    | '₹5 Cr – ₹25 Cr'
    | '₹25 Cr – ₹100 Cr'
    | 'Above ₹100 Cr';

export type NumberOfEmployees =
    | '1 – 10 Staff Members'
    | '11 – 50 Staff Members'
    | '51 – 200 Staff Members'
    | '201 – 500 Staff Members'
    | '500+ Staff Members';

export type SourceOfLead =
    | 'Client Referral'
    | 'Website Enquiry'
    | 'Cold Call'
    | 'Email Campaign'
    | 'Exhibition / Trade Show'
    | 'LinkedIn / Social Media'
    | 'Partner Referral'
    | 'Other';

export interface CorporateEmail {
    id: string;
    email: string;
    isPrimary: boolean;
    isOptedOut: boolean;
    isInvalidBounce: boolean;
}

export interface OrganizationFormData {
    organizationName: string;
    mailingName: string;
    natureOfBusiness: NatureOfBusiness | '';
    accountStatus: AccountStatus | '';
    typeOfEntity: TypeOfEntity | '';
    customerType: CustomerType | '';
    sapCodeTallyId: string;
    showroomBranchCode: string;
    sourceOfLead: SourceOfLead | '';
    memberOfParentCorp: string;
    numberOfEmployees: NumberOfEmployees | '';
    annualTurnover: AnnualTurnover | '';
    description: string;
    accountVerified: boolean;
    provideSupport: 'Yes' | 'No';
    corporateEmails: CorporateEmail[];
}

export interface Organization extends OrganizationFormData {
    id: string;
    accountCode: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

export interface CreateOrganizationResponse {
    success: boolean;
    data: Organization;
    message: string;
}

export interface OrganizationListResponse {
    success: boolean;
    data: Organization[];
    total: number;
    page: number;
    limit: number;
}
