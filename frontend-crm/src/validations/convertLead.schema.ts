import { z } from 'zod';
import { requiredString, optionalString, zodPhone, zodPhoneOptional } from './common';
import { corporateEmailSchema } from './contact.schema';

/**
 * Combined schema for the Convert Lead form. A lead conversion produces up to three records
 * (Contact, Organization, Opportunity), so all three sections are validated together.
 */
export const convertLeadFormSchema = z.object({
    // ── Organization ───────────────────────────────────────────────────────────
    existingOrganizationId: optionalString,
    organizationName: requiredString('Organization Name'),
    mailingName: optionalString,
    natureOfBusiness: requiredString('Nature of Business'),
    typeOfEntity: requiredString('Type of Entity'),
    customerType: requiredString('Customer Type'),
    sourceOfLead: optionalString,
    memberOf: optionalString,
    organizationDescription: optionalString,
    organizationAssignedTo: requiredString('Organization Assigned to'),

    // ── Contact ────────────────────────────────────────────────────────────────
    existingContactId: optionalString,
    contactName: requiredString('Contact Name').max(100, {
        message: 'Contact Name cannot exceed 100 characters.',
    }),
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
    contactDescription: optionalString,
    contactAssignedTo: requiredString('Contact Assigned to'),

    // ── Opportunity ────────────────────────────────────────────────────────────
    productCategory: z.array(z.string()).min(1, { message: 'Select at least one Product Category.' }),
    principalCompany: optionalString,
    referredBy: optionalString,
    opportunityType: requiredString('Opportunity Type'),
    nextFollowupDate: requiredString('Next Followup Date'),
    nextFollowupTime: optionalString,
    followupType: optionalString,
    opportunityDescription: optionalString,
    opportunityLeadSource: requiredString('Lead Source'),
    opportunityAssignedTo: requiredString('Opportunity Assigned to'),
    copyActivitiesTo: z.array(z.string()),
});

export type ConvertLeadFormValues = z.infer<typeof convertLeadFormSchema>;
