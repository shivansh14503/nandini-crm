import type { Lead } from '../types/lead.types';
import type { ExtendedOrganization } from '../types/organization.types';
import type { Contact } from '../types/contact.types';
import type { Opportunity } from '../types/opportunity.types';
import { CONVERT_FIELD_NAMES, type ConvertLeadFormValues, type ConvertModule } from '../validations/convertLead.schema';
import type { ApiResponse } from '../types/api.types';
import { leadService } from './lead.service';
import { notifyCrmUpdate } from './crmSync';
import { apiClient } from './apiClient';
import { getFormConfigs } from './masterData.store';
import { canonicalizeOrgName } from '../utils/organizationName';
import { builtInDropdownDefaults, isEmptyValue } from '../utils/formConfig';

export interface LeadConversionResult {
    organization: ExtendedOrganization;
    contact: Contact;
    /** Null when the conversion skipped creating one (`createOpportunity: false`). */
    opportunity: Opportunity | null;
    organizationCreated: boolean;
    contactCreated: boolean;
}

const normalize = (value?: string) => (value ?? '').trim().toLowerCase();
const digits = (value?: string) => (value ?? '').replace(/\D/g, '');

/**
 * The organization conversion will reuse (as the API matches): by explicit id, else case-insensitive name, else
 * the same legal name written differently ("ABC Private Limited" → existing "ABC Pvt Ltd").
 */
export function matchExistingOrganization(candidates: ExtendedOrganization[], name: string, id?: string): ExtendedOrganization | undefined {
    if (id) {
        const byId = candidates.find((o) => o.id === id);
        if (byId) return byId;
    }
    const target = normalize(name);
    if (!target) return undefined;
    const exact = candidates.find((o) => normalize(o.organizationName) === target);
    if (exact) return exact;
    const canonical = canonicalizeOrgName(name);
    return canonical ? candidates.find((o) => canonicalizeOrgName(o.organizationName) === canonical) : undefined;
}

/** The contact conversion will reuse: by explicit id, else mobile number (as the API matches). */
export function matchExistingContact(candidates: Contact[], mobile: string, id?: string): Contact | undefined {
    if (id) {
        const byId = candidates.find((c) => c.id === id);
        if (byId) return byId;
    }
    const target = digits(mobile);
    return target ? candidates.find((c) => digits(c.mobile) === target) : undefined;
}

/** Form fields that start from the lead's own value: it keeps them, the admin's dropdown defaults only fill gaps. */
const LEAD_CARRIED_FIELDS: readonly (keyof ConvertLeadFormValues)[] = [
    'designation',
    'department',
    'leadSource',
    'opportunityLeadSource',
    'productCategory',
    'followupType',
];

/**
 * `values` with each built-in dropdown of the contact / organization / opportunity forms on the admin's default
 * option (Form Builder › Dropdowns › ☆), as a new record of those forms starts. A dropdown without a default
 * starts empty so its placeholder shows. Values the lead supplied are kept.
 */
export function withAdminDropdownDefaults(values: ConvertLeadFormValues): ConvertLeadFormValues {
    const configs = getFormConfigs();
    if (!configs) return values;
    const result: Record<string, unknown> = { ...values };
    const current = values as Record<string, unknown>;
    for (const formModule of Object.keys(CONVERT_FIELD_NAMES) as ConvertModule[]) {
        const names: Record<string, string> = CONVERT_FIELD_NAMES[formModule];
        const base = Object.fromEntries(Object.entries(names).map(([fieldKey, name]) => [fieldKey, current[name]]));
        for (const [fieldKey, value] of Object.entries(builtInDropdownDefaults(configs, formModule, base))) {
            const name = names[fieldKey];
            const carried = (LEAD_CARRIED_FIELDS as readonly string[]).includes(name) && !isEmptyValue(current[name]);
            if (!carried) result[name] = value;
        }
    }
    return result as ConvertLeadFormValues;
}

const hasText = (value: unknown) => typeof value === 'string' && value.trim() !== '';

/**
 * Convert Lead fields whose value comes from the lead itself (not a form or admin default): shown read-only, as the
 * lead is their source. Organization Name stays editable, since it is how an existing organization is picked, and
 * so does the next follow-up, which schedules the new opportunity's next step.
 */
export function leadPrefilledFields(lead: Lead): Set<string> {
    const defaults = buildConvertLeadDefaults(lead);
    const fromLead: Record<string, unknown> = {
        contactName: lead.name,
        contactMobile: lead.mobile,
        contactPhone3: lead.otherPhone,
        contactEmails: lead.emailAddress?.some((e) => hasText(e.email)) ? 'yes' : '',
        designation: lead.designation,
        department: lead.department,
        leadSource: lead.leadSource,
        opportunityLeadSource: lead.leadSource,
        productCategory: lead.productCategory?.length ? 'yes' : '',
        referredBy: lead.referredBy,
        followupType: lead.followupType,
        opportunityDescription: lead.remarks,
    };
    for (const [key, value] of Object.entries(defaults.extraFields.organizations)) fromLead[`extraFields.organizations.${key}`] = value;
    return new Set(Object.keys(fromLead).filter((name) => hasText(fromLead[name])));
}

/** Maps a lead onto the initial values of the Convert Lead form. */
export function buildConvertLeadDefaults(lead: Lead): ConvertLeadFormValues {
    return withAdminDropdownDefaults({
        existingOrganizationId: '',
        organizationName: lead.organizationName ?? '',
        mailingName: lead.mailingName ?? '',
        natureOfBusiness: '',
        typeOfEntity: '',
        customerType: '',
        leadSource: lead.leadSource ?? '',
        memberOf: '',
        organizationDescription: '',

        existingContactId: '',
        contactName: lead.name,
        contactMobile: lead.mobile,
        contactPhone3: lead.otherPhone ?? '',
        contactEmails: lead.emailAddress?.length
            ? lead.emailAddress
            : [{ id: 'eml-1', email: '', isPrimary: true, isOptedOut: false, isInvalidBounce: false }],
        isPrimaryContact: true,
        designation: lead.designation ?? '',
        department: lead.department ?? '',
        communicationType: ['Call', 'Email'],
        doNotCall: false,
        contactDescription: '',

        createOpportunity: true,
        productCategory: lead.productCategory ?? [],
        referredBy: lead.referredBy ?? '',
        type: 'New Business',
        nextFollowupDate: lead.nextFollowupDate,
        nextFollowupTime: lead.nextFollowupTime ?? '',
        followupType: lead.followupType ?? '',
        opportunityDescription: lead.remarks ?? '',
        opportunityLeadSource: lead.leadSource ?? '',
        // Other fields an admin may put on Convert Lead start from what the conversion would carry over from the lead.
        extraFields: {
            contacts: {},
            organizations: {
                // As on the Organization form, Trade Name starts as the organization name (and follows it while they match).
                tradeName: lead.tradeName || lead.organizationName || '',
                billingAddress: lead.primaryAddress ?? '',
                billingCity: lead.primaryCity ?? '',
                billingState: lead.primaryState ?? '',
                billingPostalCode: lead.primaryPostalCode ?? '',
                billingCountry: lead.primaryCountry ?? '',
                registrationType: lead.registrationType ?? '',
                gstNumber: lead.gstNumber ?? '',
            },
            opportunities: {},
        },
    });
}

/**
 * POST /api/leads/:id/convert: reuses or creates the Organization and Contact, creates the Opportunity linked to
 * both (unless `createOpportunity` is off) and marks the lead Converted, all in one database transaction (nothing is left half-converted).
 */
export async function convertLead(leadId: string, values: ConvertLeadFormValues): Promise<LeadConversionResult> {
    const res = await apiClient.post<ApiResponse<LeadConversionResult>>(`${leadService.endpoint}/${encodeURIComponent(leadId)}/convert`, values);
    // Up to four entities changed; 'leadConversion' has no query keys of its own, so every cache refreshes.
    notifyCrmUpdate('leadConversion', leadId);
    return res.data;
}
