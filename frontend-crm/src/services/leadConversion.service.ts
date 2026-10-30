import type { Lead } from '../types/lead.types';
import type { ExtendedOrganization } from '../types/organization.types';
import type { Contact } from '../types/contact.types';
import type { Opportunity } from '../types/opportunity.types';
import type { ConvertLeadFormValues } from '../validations/convertLead.schema';
import type { ApiResponse } from '../types/api.types';
import { leadService } from './lead.service';
import { notifyCrmUpdate } from './crmSync';
import { apiClient } from './apiClient';

export interface LeadConversionResult {
    organization: ExtendedOrganization;
    contact: Contact;
    opportunity: Opportunity;
    organizationCreated: boolean;
    contactCreated: boolean;
}

const normalize = (value?: string) => (value ?? '').trim().toLowerCase();
const digits = (value?: string) => (value ?? '').replace(/\D/g, '');

/** The organization conversion will reuse: by explicit id, else case-insensitive name (as the API matches). */
export function matchExistingOrganization(candidates: ExtendedOrganization[], name: string, id?: string): ExtendedOrganization | undefined {
    if (id) {
        const byId = candidates.find((o) => o.id === id);
        if (byId) return byId;
    }
    const target = normalize(name);
    return target ? candidates.find((o) => normalize(o.organizationName) === target) : undefined;
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

/** Maps a lead onto the initial values of the Convert Lead form. */
export function buildConvertLeadDefaults(lead: Lead): ConvertLeadFormValues {
    return {
        existingOrganizationId: '',
        organizationName: lead.organizationName ?? '',
        mailingName: lead.mailingName ?? '',
        natureOfBusiness: '',
        typeOfEntity: '',
        customerType: '',
        sourceOfLead: lead.leadSource ?? '',
        memberOf: '',
        organizationDescription: '',
        organizationAssignedTo: lead.assignedTo,

        existingContactId: '',
        contactName: lead.name,
        contactMobile: lead.mobile,
        contactPhone3: lead.otherPhone ?? '',
        contactEmails: lead.emailAddresses?.length
            ? lead.emailAddresses
            : [{ id: 'eml-1', email: '', isPrimary: true, isOptedOut: false, isInvalidBounce: false }],
        isPrimaryContact: true,
        designation: lead.designation ?? '',
        department: lead.department ?? '',
        communicationType: ['Call', 'Email'],
        doNotCall: false,
        contactDescription: '',
        contactAssignedTo: lead.assignedTo,

        productCategory: lead.productCategory ?? [],
        principalCompany: '',
        referredBy: lead.referredBy ?? '',
        opportunityType: 'New Business',
        nextFollowupDate: lead.nextFollowupDate,
        nextFollowupTime: lead.nextFollowupTime ?? '',
        followupType: lead.followupType ?? '',
        opportunityDescription: lead.addDescription ?? '',
        opportunityLeadSource: lead.leadSource ?? '',
        opportunityAssignedTo: lead.assignedTo,
        copyActivitiesTo: [],
    };
}

/**
 * POST /api/leads/:id/convert: reuses or creates the Organization and Contact, creates the Opportunity linked to
 * both and marks the lead Converted, all in one database transaction (nothing is left half-converted).
 */
export async function convertLead(leadId: string, values: ConvertLeadFormValues): Promise<LeadConversionResult> {
    const res = await apiClient.post<ApiResponse<LeadConversionResult>>(`${leadService.endpoint}/${encodeURIComponent(leadId)}/convert`, values);
    // Up to four entities changed; 'leadConversion' has no query keys of its own, so every cache refreshes.
    notifyCrmUpdate('leadConversion', leadId);
    return res.data;
}
