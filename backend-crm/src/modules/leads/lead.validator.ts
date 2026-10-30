import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    enumWithDefault,
    optionalDate,
    optionalPhone,
    optionalPostalCode,
    optionalText,
    phone,
    refinePostalCodeForCountry,
    requiredDate,
    requiredText,
    stringList,
} from '../../validators/common.js';
import { corporateEmailListSchema } from '../shared/entityEmails.js';

/** LEAD_STATUSES from frontend-crm/src/types/lead.types.ts. */
export const LEAD_STATUSES = [
    'New',
    'Contacted',
    'In Discussion',
    'Demo Scheduled',
    'Proposal Sent',
    'Qualified',
    'Negotiation',
    'Converted',
    'Unqualified / Lost',
] as const;
export const CONVERTED_STATUS = 'Converted';

/** Field rules shared by the lead form and bulk import. */
const leadFields = z.object({
    name: requiredText('Lead Name', L.personName),
    mobile: phone('Mobile'),
    emailAddresses: corporateEmailListSchema.default([]),
    mailingName: optionalText('Mailing Name', L.organizationName),
    designation: optionalText('Designation', L.option),
    leadSource: requiredText('Lead Source', L.option),
    productCategory: stringList('Product Category', 30, L.option).min(1, { message: 'Please select at least one Product Category.' }),
    followupType: optionalText('Followup Type', L.option),
    addDescription: requiredText('Add Description', L.longText).min(3, { message: 'Add Description must be at least 3 characters.' }),
    registrationType: optionalText('Registration Type', 30),
    turnover: optionalText('Turnover', 30),
    assignedTo: requiredText('Assigned Representative', L.username),

    otherPhone: optionalPhone('Other Phone'),
    organizationName: optionalText('Organization Name', L.organizationName),
    department: optionalText('Department', L.option),
    leadType: requiredText('Lead Type', L.option),
    status: enumWithDefault('Status', LEAD_STATUSES, 'New'),
    nextFollowupDate: requiredDate('Next Followup Date'),
    nextFollowupTime: optionalText('Next Followup Time', 20),
    description: optionalText('Description', L.longText),
    noOfEmployee: optionalText('No of Employee', 30),
    referredBy: optionalText('Referred By', L.organizationName),

    primaryAddress: optionalText('Primary Street', L.address),
    primaryCity: optionalText('Primary City', L.shortText),
    primaryState: optionalText('Primary State', L.shortText),
    primaryPostalCode: optionalPostalCode,
    primaryCountry: optionalText('Primary Country', L.shortText),
    primaryLatitude: optionalText('Primary Latitude', 30),

    otherAddress: optionalText('Other Street', L.address),
    otherCity: optionalText('Other City', L.shortText),
    otherState: optionalText('Other State', L.shortText),
    otherPostalCode: optionalPostalCode,
    otherCountry: optionalText('Other Country', L.shortText),
    otherLongitude: optionalText('Other Longitude', 30),
    copyAddressFromLeft: z.boolean().default(false),
});

function refineLeadPostalCodes(
    lead: { primaryPostalCode?: string; primaryCountry?: string; otherPostalCode?: string; otherCountry?: string; copyAddressFromLeft: boolean },
    ctx: z.RefinementCtx,
): void {
    refinePostalCodeForCountry(ctx, 'primaryPostalCode', lead.primaryPostalCode, lead.primaryCountry);
    if (!lead.copyAddressFromLeft) {
        refinePostalCodeForCountry(ctx, 'otherPostalCode', lead.otherPostalCode, lead.otherCountry);
    }
}

/** `LeadFormData` rules from frontend-crm/src/validations/lead.schema.ts. */
export const leadInputSchema = leadFields.superRefine(refineLeadPostalCodes);

/** Bulk import: the template has no Product Category column, so it may be empty. */
export const leadImportSchema = leadFields
    .extend({ productCategory: stringList('Product Category', 30, L.option).default([]) })
    .superRefine(refineLeadPostalCodes);

export type LeadInput = z.infer<typeof leadInputSchema>;

/** `ConvertLeadFormValues` rules from frontend-crm/src/validations/convertLead.schema.ts. */
export const convertLeadSchema = z.object({
    // Organization
    existingOrganizationId: optionalText('Organization', 50),
    organizationName: requiredText('Organization Name', L.organizationName),
    mailingName: optionalText('Mailing Name', L.organizationName),
    natureOfBusiness: requiredText('Nature of Business', L.option),
    typeOfEntity: requiredText('Type of Entity', L.option),
    customerType: requiredText('Customer Type', L.option),
    sourceOfLead: optionalText('Source of Lead', L.option),
    memberOf: optionalText('Member of', L.organizationName),
    organizationDescription: optionalText('Organization Description', L.longText),
    organizationAssignedTo: requiredText('Organization Assigned to', L.username),

    // Contact
    existingContactId: optionalText('Contact', 50),
    contactName: requiredText('Contact Name', L.personName),
    contactMobile: phone('Mobile'),
    contactPhone3: optionalPhone('Phone 3'),
    contactEmails: corporateEmailListSchema.refine((emails) => emails.some((row) => row.email), {
        message: 'Email Address is required.',
    }),
    isPrimaryContact: z.boolean().default(true),
    designation: optionalText('Designation', L.option),
    department: optionalText('Department', L.option),
    communicationType: stringList('Communication Type', 10, 30).default(['Call', 'Email']),
    doNotCall: z.boolean().default(false),
    contactDescription: optionalText('Contact Description', L.longText),
    contactAssignedTo: requiredText('Contact Assigned to', L.username),

    // Opportunity
    productCategory: stringList('Product Category', 30, L.option).min(1, { message: 'Select at least one Product Category.' }),
    principalCompany: optionalText('Principal Company', L.organizationName),
    referredBy: optionalText('Referred By', L.organizationName),
    opportunityType: requiredText('Opportunity Type', L.option),
    nextFollowupDate: requiredDate('Next Followup Date'),
    nextFollowupTime: optionalText('Next Followup Time', 20),
    followupType: optionalText('Followup Type', L.option),
    opportunityDescription: optionalText('Opportunity Description', L.longText),
    opportunityLeadSource: requiredText('Lead Source', L.option),
    opportunityAssignedTo: requiredText('Opportunity Assigned to', L.username),
    copyActivitiesTo: stringList('Copy Activities to', 10, 30).default([]),
});

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

export const leadListQuerySchema = z.object({
    status: csvQuery,
    /** e.g. `excludeStatus=Converted` to hide converted leads. */
    excludeStatus: csvQuery,
    leadType: csvQuery,
    leadSource: csvQuery,
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Leads for one organization (leads keep the name as text; compared case-insensitively by SQL Server). */
    organizationName: z.string().trim().max(L.organizationName).optional(),
    /** Only leads assigned to the signed-in user ("My Leads"). */
    mine: booleanQuery,
    /** Exact follow-up date, e.g. today's date for the "Follow-up Today" tab. */
    nextFollowupDate: optionalDate('Next Followup Date'),
    createdWithinDays: createdWithinDaysQuery,
});

export const LEAD_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'leadCode',
    'name',
    'organizationName',
    'status',
    'leadType',
    'leadSource',
    'nextFollowupDate',
    'assignedTo',
] as const;
