// ─── Organization Types ───────────────────────────────────────────────────────

export type NatureOfBusiness =
    | 'Agriculture & Food Processing'
    | 'Apparel & Textiles'
    | 'Association / Society / NGO / Trust'
    | 'Automobile & Auto Components'
    | 'Biotechnology & Pharmaceuticals'
    | 'CA Firm / Accounting & Taxation'
    | 'Chemicals'
    | 'Communications & Telecommunications'
    | 'Construction & Real Estate'
    | 'Consulting & Professional Services'
    | 'Distributor / Trading / Wholesale'
    | 'E-commerce / Online Business'
    | 'Education & Training'
    | 'Electronics & Electricals'
    | 'Energy & Utilities'
    | 'Engineering'
    | 'Entertainment & Recreation'
    | 'Environmental Services'
    | 'Finance & Banking'
    | 'Government / Public Sector'
    | 'Healthcare & Medical'
    | 'Hospitality / Hotel / Restaurant'
    | 'Import / Export'
    | 'Insurance'
    | 'Jewellery & Gems'
    | 'Logistics & Warehousing'
    | 'Machinery & Industrial Equipment'
    | 'Manufacturing'
    | 'Media / Advertising / Marketing'
    | 'Printing / Packaging / Publishing'
    | 'Retail'
    | 'Technology / IT & Software'
    | 'Transportation & Logistics'
    // Open fallback keeps legacy stored/mock values compiling.
    | (string & Record<never, never>);

export type AccountStatus = 'Active' | 'Inactive';

export type TypeOfEntity =
    | 'Association'
    | 'Government'
    | 'HUF'
    | 'LLP'
    | 'NGO'
    | 'Partnership'
    | 'Private Limited'
    | 'Proprietorship'
    | 'PSU'
    | 'Public Limited'
    | 'RWA'
    | 'Section 8 Company'
    | 'Society'
    | 'Trust'
    // Open fallback keeps legacy stored/mock values compiling.
    | (string & Record<never, never>);

export type CustomerType =
    | 'BMW'
    | 'CEAT'
    | 'End User'
    | 'GAIA'
    | 'IFFCO'
    | 'Luxottica'
    | 'Partner'
    | 'Samsung'
    | 'Usha'
    | 'Valvoline'
    | 'ValvolineSFDC'
    // Open fallback keeps legacy stored/mock values compiling.
    | (string & Record<never, never>);

export type AnnualTurnover =
    | 'Less than 1.5 crore'
    | '1.5 crore to 5 crore'
    | '5 crore to 10 crore'
    | 'Greater than 10 crore'
    // Open fallback keeps legacy stored/mock values compiling.
    | (string & Record<never, never>);

export type NumberOfEmployees =
    | 'Less than 20'
    | '21 To 50'
    | '51 To 100'
    | '101 To 250'
    | '251 To 500'
    | '501 To 1000'
    | '1001 & Above'
    // Open fallback keeps legacy stored/mock values compiling.
    | (string & Record<never, never>);

export type SourceOfLead =
    | 'Client Referral'
    | 'Website Enquiry'
    | 'Cold Call'
    | 'Email Campaign'
    | 'Exhibition / Trade Show'
    | 'LinkedIn / Social Media'
    | 'Partner Referral'
    | 'Direct Customer'
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
    /** Always equal to organizationName (read-only in the form). */
    mailingName: string;
    /** Defaults to organizationName until the user edits it. */
    tradeName?: string;
    natureOfBusiness: NatureOfBusiness | '';
    accountStatus: AccountStatus | '';
    /** Why the organization was set to Inactive (collected via CommonActionModal). */
    inactivityReason?: string;
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
    /** ISO timestamp of when accountVerified was switched on. */
    verifiedAt?: string;
    /** Username of whoever switched accountVerified on. */
    verifiedBy?: string;
    /** Active AMC entitlement. */
    activeAmc?: boolean;
    /** Active cloud hosting. */
    activeCloud?: boolean;
    provideSupport: 'Yes' | 'No';
    /** Username of the account executive who owns this organization. */
    assignedUser?: string;
    /** @deprecated Emails are managed on Contacts; kept optional so older records still load. */
    corporateEmails?: CorporateEmail[];

    // Billing Address
    billingAddress?: string;
    billingStreet?: string;
    billingCity?: string;
    billingState?: string;
    billingPostalCode?: string;
    billingCountry?: string;
    billingLatitude?: string;

    // Shipping Address
    shippingAddress?: string;
    shippingStreet?: string;
    shippingCity?: string;
    shippingState?: string;
    shippingPostalCode?: string;
    shippingCountry?: string;
    shippingLongitude?: string;
    copyAddressFromBilling?: boolean;

    // Tax & Bank Details
    registrationType?: 'Registered' | 'Unregistered' | string;
    panNumber?: string;
    msmeRegnNumber?: string;
    accountName?: string;
    bankName?: string;
    bankIfscCode?: string;
    gstNo?: string;
    gstNumber?: string;
    cinNo?: string;
    tanNumber?: string;
    accountNumber?: string;
    typeOfAccount?: string;
    bankAddress?: string;

    // Partner Company
    partnerCompanies?: string[];
}

export interface Organization extends OrganizationFormData {
    id: string;
    accountCode: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

export interface ExtendedOrganization extends Organization {
    assignedUser?: string;
    isRecentlyViewed?: boolean;
    isMyAccount?: boolean;
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
