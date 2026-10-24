import type { Lead } from '../types/lead.types';
import type {
    ExtendedOrganization,
    OrganizationFormData,
    NatureOfBusiness,
    TypeOfEntity,
    CustomerType,
    SourceOfLead,
} from '../types/organization.types';
import type { Contact, ContactFormData } from '../types/contact.types';
import type { Opportunity, OpportunityFormData } from '../types/opportunity.types';
import type { ConvertLeadFormValues } from '../validations/convertLead.schema';
import { leadService } from './lead.service';
import { organizationService } from './organization.service';
import { contactService } from './contact.service';
import { opportunityService } from './opportunity.service';
import { notifyCrmUpdate } from './crmSync';

export interface LeadConversionResult {
    organization: ExtendedOrganization;
    contact: Contact;
    opportunity: Opportunity;
    organizationCreated: boolean;
    contactCreated: boolean;
}

const normalize = (value?: string) => (value ?? '').trim().toLowerCase();
const digits = (value?: string) => (value ?? '').replace(/\D/g, '');

/** Finds an existing organization by explicit id or case-insensitive name. */
export function findExistingOrganization(name: string, id?: string): ExtendedOrganization | undefined {
    const all = organizationService.getAllSync();
    if (id) {
        const byId = all.find((o) => o.id === id);
        if (byId) return byId;
    }
    const target = normalize(name);
    return target ? all.find((o) => normalize(o.organizationName) === target) : undefined;
}

/** Finds an existing contact by explicit id or by matching mobile number. */
export function findExistingContact(mobile: string, id?: string): Contact | undefined {
    const all = contactService.getAllSync();
    if (id) {
        const byId = all.find((c) => c.id === id);
        if (byId) return byId;
    }
    const target = digits(mobile);
    return target ? all.find((c) => digits(c.mobile) === target) : undefined;
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
        location: lead.primaryCity ?? '',
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

function toOrganizationPayload(v: ConvertLeadFormValues, lead: Lead): OrganizationFormData {
    return {
        organizationName: v.organizationName,
        mailingName: v.mailingName ?? '',
        natureOfBusiness: v.natureOfBusiness as NatureOfBusiness,
        accountStatus: 'Active',
        typeOfEntity: v.typeOfEntity as TypeOfEntity,
        customerType: v.customerType as CustomerType,
        sapCodeTallyId: '',
        showroomBranchCode: '',
        sourceOfLead: (v.sourceOfLead ?? '') as SourceOfLead | '',
        memberOfParentCorp: v.memberOf ?? '',
        numberOfEmployees: '',
        annualTurnover: '',
        description: v.organizationDescription ?? '',
        accountVerified: false,
        provideSupport: 'No',
        billingStreet: lead.primaryAddress,
        billingCity: lead.primaryCity,
        billingState: lead.primaryState,
        billingPostalCode: lead.primaryPostalCode,
        billingCountry: lead.primaryCountry,
        registrationType: lead.registrationType,
        partnerCompanies: [],
    };
}

function toContactPayload(
    v: ConvertLeadFormValues,
    organization: ExtendedOrganization
): ContactFormData {
    return {
        name: v.contactName,
        organizationName: organization.organizationName,
        organizationId: organization.id,
        mobile: v.contactMobile,
        officePhone: '',
        phone3: v.contactPhone3 ?? '',
        phone4: '',
        phone5: '',
        emailAddresses: v.contactEmails,
        assignedTo: v.contactAssignedTo,
        isPrimaryContact: v.isPrimaryContact,
        designation: v.designation ?? '',
        department: v.department ?? '',
        location: v.location ?? '',
        leftJob: 'No',
        communicationType: v.communicationType,
        doNotCall: v.doNotCall,
        description: v.contactDescription ?? '',
    };
}

function toOpportunityPayload(
    v: ConvertLeadFormValues,
    organization: ExtendedOrganization,
    contact: Contact
): OpportunityFormData {
    const primaryEmail = v.contactEmails.find((e) => e.isPrimary && e.email) ?? v.contactEmails.find((e) => e.email);
    return {
        productCategory: v.productCategory,
        contactName: contact.name,
        contactId: contact.id,
        organizationName: organization.organizationName,
        organizationId: organization.id,
        contactNumber: contact.mobile,
        emailAddress: primaryEmail?.email,
        referredBy: v.referredBy,
        type: v.opportunityType,
        salesStage: 'Qualification',
        leadSource: v.opportunityLeadSource,
        leadGivenBy: v.principalCompany || v.referredBy || '',
        nextFollowupDate: v.nextFollowupDate,
        nextFollowupTime: v.nextFollowupTime,
        followupType: v.followupType ?? '',
        addDescription: v.opportunityDescription ?? '',
        description: v.opportunityDescription,
        assignedTo: v.opportunityAssignedTo,
        commission: 'Nil / Direct (0%)',
        currency: 'Indian Rupee: ₹',
        groupName: '',
        lineItems: [],
        lumpSumDiscount: 0,
        totalAmount: 0,
        totalDiscount: 0,
        subtotal: 0,
        totalTax: 0,
        grandTotal: 0,
    };
}

/**
 * Orchestrates a lead conversion: reuses or creates the Organization and Contact, creates the
 * Opportunity linked to both, and finally marks the lead as `Converted`.
 */
export async function convertLead(
    leadId: string,
    values: ConvertLeadFormValues
): Promise<LeadConversionResult> {
    const lead = await leadService.getById(leadId);
    if (!lead) throw new Error('Lead not found.');
    if (lead.status === 'Converted') throw new Error('This lead has already been converted.');

    let organization = findExistingOrganization(values.organizationName, values.existingOrganizationId);
    const organizationCreated = !organization;
    if (!organization) {
        organization = (await organizationService.create(toOrganizationPayload(values, lead))) as ExtendedOrganization;
    }

    let contact = findExistingContact(values.contactMobile, values.existingContactId);
    const contactCreated = !contact;
    if (!contact) {
        contact = await contactService.create(toContactPayload(values, organization));
    }

    const opportunity = await opportunityService.create(toOpportunityPayload(values, organization, contact));
    await leadService.update(leadId, { status: 'Converted' });
    notifyCrmUpdate('leadConversion', leadId);

    return { organization, contact, opportunity, organizationCreated, contactCreated };
}
