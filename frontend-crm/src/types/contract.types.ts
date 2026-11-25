// ─── Contract Types ───────────────────────────────────────────────────────────
// Mirrors backend-crm/src/modules/contracts (ContractDto / contractInputSchema).

export interface ContractFormData {
    /** Admin-defined custom field values, keyed by FormFieldDefinition.fieldKey. */
    customFields?: Record<string, unknown>;

    // Contract Details
    /** Option of the admin-customizable `contract_title` dropdown. */
    contractTitle: string;
    /** Option of the `contract_status` dropdown ('Not Started' and 'Expired' are system options). */
    status: string;
    /** Decimal amount as text (`''` when empty), like Product cost / MRP. */
    contractValue: string;
    /** Contract Manager (username). */
    assignedTo: string;
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;
    /** Label of the linked opportunity at the time it was picked (see `opportunityLabel`), or typed text. */
    opportunity: string;
    opportunityId?: string;
    tallySerialNo: string;

    // Term & Renewal
    /** `YYYY-MM-DD` or `''`. */
    startDate: string;
    /** `YYYY-MM-DD` or `''`; never before the start date. */
    endDate: string;
    contractPeriod: string;
    /** Local date-time, `YYYY-MM-DDTHH:mm`, or `''`. */
    renewalReminderDate: string;
    contractType: string[];

    // Billing
    billNumber: string;
    /** `YYYY-MM-DD` or `''`. */
    billDate: string;
    billAmount: string;
    description: string;
}

export interface Contract extends ContractFormData {
    id: string;
    /** e.g. "CTR-0001", or the admin series (`NIPL/C/26-27/3437`). */
    contractNumber: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
}

/** Dropdown category of the contract status (score cards read its options). */
export const CONTRACT_STATUS_CATEGORY = 'contract_status';

// Fallback option lists (the form configuration's defaults) for when the dropdowns haven't loaded.
export const CONTRACT_STATUSES = ['Not Started', 'In Progress', 'Signed', 'Expired'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_TITLES: string[] = ['Tally TSS', 'Tally On Cloud', 'Tally On AWS', 'Other'];

export const CONTRACT_PERIODS: string[] = ['1 Year', '13 Months', 'Other'];

export const CONTRACT_TYPES: string[] = ['No of Visit', 'Remote Support'];

/**
 * Length in months of a Contract Period option ('2 Years' → 24, '13 Months' → 13), or null when it names no
 * length (e.g. 'Other'), so admin-added periods also set the End Date.
 */
export function contractPeriodMonths(period: string): number | null {
    const years = /(\d+)\s*years?/i.exec(period);
    if (years) return Number(years[1]) * 12;
    const months = /(\d+)\s*months?/i.exec(period);
    if (months) return Number(months[1]);
    return null;
}
