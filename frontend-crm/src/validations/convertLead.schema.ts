import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { requiredString, optionalString, requiredText, optionalText, zodPhone, zodPhoneOptional } from './common';
import { corporateEmailSchema } from './contact.schema';

/**
 * Combined schema for the Convert Lead form. A lead conversion produces up to three records
 * (Contact, Organization, Opportunity), so all three sections are validated together.
 */
export const convertLeadFormSchema = z.object({
    // ── Organization ───────────────────────────────────────────────────────────
    existingOrganizationId: optionalString,
    organizationName: requiredText('Organization Name', L.organizationName),
    mailingName: optionalText('Mailing Name', L.organizationName),
    natureOfBusiness: requiredString('Nature of Business'),
    typeOfEntity: requiredString('Type of Entity'),
    customerType: requiredString('Customer Type'),
    sourceOfLead: optionalString,
    memberOf: optionalText('Member of', L.organizationName),
    organizationDescription: optionalText('Organization Description', L.longText),
    organizationAssignedTo: requiredString('Organization Assigned to'),

    // ── Contact ────────────────────────────────────────────────────────────────
    existingContactId: optionalString,
    contactName: requiredText('Contact Name', L.personName),
    contactMobile: zodPhone,
    contactPhone3: zodPhoneOptional,
    contactEmails: z
        .array(corporateEmailSchema)
        .refine((emails) => emails.some((e) => (e.email || '').trim().length > 0), {
            message: 'Email Address is required.',
        }),
    isPrimaryContact: z.boolean(),
    designation: optionalString,
    department: optionalString,
    communicationType: z.array(z.string()),
    doNotCall: z.boolean(),
    contactDescription: optionalText('Contact Description', L.longText),
    contactAssignedTo: requiredString('Contact Assigned to'),

    // ── Opportunity ────────────────────────────────────────────────────────────
    productCategory: z.array(z.string()).min(1, { message: 'Select at least one Product Category.' }),
    principalCompany: optionalText('Principal Company', L.organizationName),
    referredBy: optionalString,
    opportunityType: requiredString('Opportunity Type'),
    nextFollowupDate: requiredString('Next Followup Date'),
    nextFollowupTime: optionalString,
    followupType: optionalString,
    opportunityDescription: optionalText('Opportunity Description', L.longText),
    opportunityLeadSource: requiredString('Lead Source'),
    opportunityAssignedTo: requiredString('Opportunity Assigned to'),
    copyActivitiesTo: z.array(z.string()),
});

export type ConvertLeadFormValues = z.infer<typeof convertLeadFormSchema>;
