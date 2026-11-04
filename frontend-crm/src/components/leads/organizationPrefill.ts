import type { LeadFormData } from '@/types/lead.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import { DEFAULT_COUNTRY_CODE } from '@/data/addressMaster';
import { normalizeAddressFields } from '@/utils/address';

/** Organization turnover brackets → the closest Lead bracket (the two masters use different ranges). */
const ORG_TO_LEAD_TURNOVER: Record<string, string> = {
    'Less than 1.5 crore': '₹1 Cr – ₹1.5 Cr',
    '1.5 crore to 5 crore': '₹1.5 Cr – ₹5 Cr',
    '5 crore to 10 crore': '₹5 Cr – ₹25 Cr',
    'Greater than 10 crore': '₹25 Cr – ₹100 Cr',
};

/** Organization employee brackets → the Lead bracket that contains them. */
const ORG_TO_LEAD_EMPLOYEES: Record<string, string> = {
    'Less than 20': '1 – 10 Staff Members',
    '21 To 50': '11 – 50 Staff Members',
    '51 To 100': '51 – 200 Staff Members',
    '101 To 250': '51 – 200 Staff Members',
    '251 To 500': '201 – 500 Staff Members',
    '501 To 1000': '500+ Staff Members',
    '1001 & Above': '500+ Staff Members',
};

/** Comparison key that ignores case, spacing and dash style ("₹5 Cr - ₹25 Cr" ≡ "₹5 Cr – ₹25 Cr"). */
const bracketKey = (value: string) =>
    value
        .toLowerCase()
        .replace(/[‐-―−-]/g, '-')
        .replace(/\s+/g, '');

/** The offered option equal to `value` under {@link bracketKey}, returned in the option's own spelling. */
const findOption = (value: string, options: readonly string[]) => {
    const key = bracketKey(value);
    return options.find((o) => bracketKey(o) === key);
};

/** Uses the value when the Lead options already offer it, else the mapped bracket (if that is offered). */
function mapToLeadOption(value: string | undefined, mapping: Record<string, string>, leadOptions: readonly string[]): string | undefined {
    const raw = value?.trim();
    if (!raw) return undefined;
    const direct = findOption(raw, leadOptions);
    if (direct) return direct;
    const mappedKey = Object.keys(mapping).find((k) => bracketKey(k) === bracketKey(raw));
    return mappedKey ? findOption(mapping[mappedKey], leadOptions) : undefined;
}

export const mapOrgTurnoverToLead = (turnover: string | undefined, leadOptions: readonly string[]) =>
    mapToLeadOption(turnover, ORG_TO_LEAD_TURNOVER, leadOptions);

export const mapOrgEmployeesToLead = (employees: string | undefined, leadOptions: readonly string[]) =>
    mapToLeadOption(employees, ORG_TO_LEAD_EMPLOYEES, leadOptions);

type LeadAddressValues = Required<
    Pick<
        LeadFormData,
        | 'primaryAddress'
        | 'primaryCity'
        | 'primaryState'
        | 'primaryPostalCode'
        | 'primaryCountry'
        | 'otherAddress'
        | 'otherCity'
        | 'otherState'
        | 'otherPostalCode'
        | 'otherCountry'
        | 'copyAddressFromLeft'
    >
>;

const LEAD_ADDRESS_PAIRS = [
    ['primaryCountry', 'primaryState'],
    ['otherCountry', 'otherState'],
] as const;

/**
 * The organization's billing / shipping address as Lead primary / other address values, with countries as ISO2
 * codes and states as the address master's names so the Address tab's selects show them.
 */
export function organizationAddressToLead(org: ExtendedOrganization): LeadAddressValues {
    const primary = {
        primaryAddress: org.billingAddress || org.billingStreet || '',
        primaryCity: org.billingCity || '',
        primaryState: org.billingState || '',
        primaryPostalCode: org.billingPostalCode || '',
        primaryCountry: org.billingCountry || DEFAULT_COUNTRY_CODE,
    };
    const copy = Boolean(org.copyAddressFromBilling);
    const values: LeadAddressValues = {
        ...primary,
        otherAddress: copy ? primary.primaryAddress : org.shippingAddress || org.shippingStreet || '',
        otherCity: copy ? primary.primaryCity : org.shippingCity || '',
        otherState: copy ? primary.primaryState : org.shippingState || '',
        otherPostalCode: copy ? primary.primaryPostalCode : org.shippingPostalCode || '',
        otherCountry: copy ? primary.primaryCountry : org.shippingCountry || DEFAULT_COUNTRY_CODE,
        copyAddressFromLeft: copy,
    };
    const normalized = normalizeAddressFields(values, LEAD_ADDRESS_PAIRS);
    // Unknown values come back empty from the master: keep what the organization had rather than blank it.
    return {
        ...normalized,
        primaryState: normalized.primaryState || values.primaryState,
        otherState: normalized.otherState || values.otherState,
        primaryCountry: normalized.primaryCountry || values.primaryCountry,
        otherCountry: normalized.otherCountry || values.otherCountry,
    };
}
