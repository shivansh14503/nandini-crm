import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { requiredString, optionalString, requiredText, optionalText, zodPhone, zodPhoneOptional } from './common';
import { corporateEmailSchema } from './contact.schema';

/**
 * Combined schema for the Convert Lead form. A lead conversion produces up to three records
 * (Contact, Organization, Opportunity), so all three sections are validated together. Organization and
 * opportunity fields an admin may relax are optional here; ConvertLeadForm requires them per the organization and
 * opportunity form configurations (CONVERT_CONFIGURED_FIELDS).
 */
export const convertLeadFormSchema = z.object({
    // ── Organization ───────────────────────────────────────────────────────────
    existingOrganizationId: optionalString,
    organizationName: requiredText('Organization Name', L.organizationName),
    mailingName: optionalText('Mailing Name', L.organizationName),
    natureOfBusiness: optionalString,
    typeOfEntity: optionalString,
    customerType: optionalString,
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
    productCategory: z.array(z.string()),
    principalCompany: optionalText('Principal Company', L.organizationName),
    referredBy: optionalString,
    opportunityType: optionalString,
    nextFollowupDate: optionalString,
    nextFollowupTime: optionalString,
    followupType: optionalString,
    opportunityDescription: optionalText('Opportunity Description', L.longText),
    opportunityLeadSource: optionalString,
    opportunityAssignedTo: requiredString('Opportunity Assigned to'),
    copyActivitiesTo: z.array(z.string()),
});

export type ConvertLeadFormValues = z.infer<typeof convertLeadFormSchema>;

/**
 * Organization / opportunity built-in fields the Convert Lead form collects: module, the module's fieldKey and
 * this form's field name. Mirrors CONVERT_*_PATHS in backend-crm lead.conversion.ts. Opportunity Add Description
 * is left out here: the backend falls back to the lead's description when the form leaves it empty.
 */
export const CONVERT_CONFIGURED_FIELDS = [
    { module: 'organizations', fieldKey: 'natureOfBusiness', name: 'natureOfBusiness' },
    { module: 'organizations', fieldKey: 'typeOfEntity', name: 'typeOfEntity' },
    { module: 'organizations', fieldKey: 'customerType', name: 'customerType' },
    { module: 'opportunities', fieldKey: 'type', name: 'opportunityType' },
    { module: 'opportunities', fieldKey: 'leadSource', name: 'opportunityLeadSource' },
    { module: 'opportunities', fieldKey: 'productCategory', name: 'productCategory' },
    { module: 'opportunities', fieldKey: 'nextFollowupDate', name: 'nextFollowupDate' },
] as const satisfies readonly { module: 'organizations' | 'opportunities'; fieldKey: string; name: keyof ConvertLeadFormValues }[];
