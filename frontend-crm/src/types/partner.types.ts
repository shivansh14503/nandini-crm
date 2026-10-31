import type { CorporateEmail } from './organization.types';

// ─── Partner Company Types ────────────────────────────────────────────────────

export const NATURE_OF_PARTNER_OPTIONS = [
    'ISODA',
    'TALLY-REFERRAL PARTNER',
    'TALLY-3STAR',
    'TALLY-3STAR PARTNER',
    'TALLY-5STAR-SS',
    'TALLY-5STARSI',
    'TALLY-AP',
    'Other',
] as const;

export type NatureOfPartner = (typeof NATURE_OF_PARTNER_OPTIONS)[number];

/** Values edited by the Partner Company form (Company Information, Address Information, Statutory). */
export interface PartnerCompanyFormData {
    // Company information
    companyName: string;
    natureOfPartner: string;
    /** Office phone (E.164). */
    phone: string;
    website: string;
    emailAddresses: CorporateEmail[];
    addDescription: string;
    description: string;
    /** Username of the internal owner. */
    assignedTo: string;
    principalCompany: string;

    // Bank details
    bankName: string;
    bankBranch: string;
    accountNumber: string;
    bankIfscCode: string;

    // Billing address
    billingAddress: string;
    billingStreet: string;
    billingCity: string;
    billingState: string;
    billingPostalCode: string;
    billingCountry: string;

    // Shipping address
    shippingAddress: string;
    shippingStreet: string;
    shippingCity: string;
    shippingState: string;
    shippingPostalCode: string;
    shippingCountry: string;
    copyAddressFromBilling: boolean;

    // Statutory
    gstNo: string;
    panNumber: string;
    cinNo: string;
    msmeRegnNumber: string;
    tanNumber: string;
}

/** A partner company as returned by `/api/partner-companies`. */
export interface ExtendedPartnerCompany extends PartnerCompanyFormData {
    id: string;
    /** Alias of `phone`. */
    officePhone: string;
    /** Primary address of `emailAddresses`. */
    email: string;
    /** Alias of `billingCity`. */
    city: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
}

/** A channel / referral partner firm (e.g. a Tally partner) involved in support tickets. */
export interface PartnerCompany {
    id: string;
    companyName: string;
    natureOfPartner: string;
    phone: string;
    email: string;
    city: string;
    billingCountry: string;
    /** Username of the internal owner. */
    assignedTo: string;
    /** ISO timestamp the partner was created. */
    createdAt?: string;
}

/** A person at a partner company. */
export interface PartnerCompanyContact {
    id: string;
    name: string;
    designation: string;
    /** `companyName` of the partner this contact works for. */
    partnerCompany: string;
    mobile: string;
    officePhone?: string;
    email: string;
    location: string;
}
