import type { CorporateEmail } from './organization.types';

// ─── Referral Types ───────────────────────────────────────────────────────────
// Mirrors backend-crm/src/modules/referrals (ReferralDto / referralInputSchema). A referral has the Contact form's
// fields (same keys and labels) without Left Job, Phone 3–5, Is Primary Contact, Communication Type, DND and Notes,
// plus a free-text Company Name (not linked to an organization) and a Status: only Active referrals are offered as
// Referred By on leads and opportunities.

/** Options of the fixed `referral_status` dropdown. */
export const REFERRAL_STATUSES = ['Active', 'Inactive'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const ACTIVE_REFERRAL_STATUS: ReferralStatus = 'Active';
/** Dropdown category of the referral Status. */
export const REFERRAL_STATUS_CATEGORY = 'referral_status';

export interface ReferralFormData {
    /** Admin-defined custom field values, keyed by FormFieldDefinition.fieldKey. */
    customFields?: Record<string, unknown>;

    name: string;
    companyName: string;
    mobile: string;
    officePhone: string;
    emailAddress: CorporateEmail[];
    assignedTo: string;
    designation: string;
    department: string;
    status: ReferralStatus;
}

export interface Referral extends ReferralFormData {
    id: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
}
