// ─── Partner Company Types ────────────────────────────────────────────────────

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
