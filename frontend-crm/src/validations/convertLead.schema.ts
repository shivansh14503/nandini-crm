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
    // Required (or not) as the Contact form's configuration says, see CONVERT_CONFIGURED_FIELDS.
    contactEmails: z.array(corporateEmailSchema),
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

/** The three records a conversion produces; each has its own form configuration (Form Builder). */
export type ConvertModule = 'contacts' | 'organizations' | 'opportunities';

/**
 * Built-in fields of each module that the Convert Lead form collects: the module's `fieldKey` → this form's field
 * name. The form builder's settings for a field (label, required, hidden, placeholder, width, dropdown options,
 * order) apply to the form field it names here. Mirrors CONVERT_*_PATHS in backend-crm lead.conversion.ts.
 */
export const CONVERT_FIELD_NAMES = {
    contacts: {
        name: 'contactName',
        mobile: 'contactMobile',
        phone3: 'contactPhone3',
        organizationName: 'organizationName',
        emailAddresses: 'contactEmails',
        isPrimaryContact: 'isPrimaryContact',
        designation: 'designation',
        department: 'department',
        communicationType: 'communicationType',
        doNotCall: 'doNotCall',
        description: 'contactDescription',
        assignedTo: 'contactAssignedTo',
    },
    organizations: {
        organizationName: 'organizationName',
        mailingName: 'mailingName',
        natureOfBusiness: 'natureOfBusiness',
        typeOfEntity: 'typeOfEntity',
        customerType: 'customerType',
        sourceOfLead: 'sourceOfLead',
        memberOfParentCorp: 'memberOf',
        description: 'organizationDescription',
        assignedUser: 'organizationAssignedTo',
    },
    opportunities: {
        productCategory: 'productCategory',
        organizationName: 'organizationName',
        referredBy: 'referredBy',
        type: 'opportunityType',
        leadSource: 'opportunityLeadSource',
        nextFollowupDate: 'nextFollowupDate',
        followupType: 'followupType',
        addDescription: 'opportunityDescription',
        assignedTo: 'opportunityAssignedTo',
    },
} as const satisfies Record<ConvertModule, Record<string, keyof ConvertLeadFormValues>>;

/**
 * Built-in fields whose "required" setting isn't checked here: names the conversion fills in itself (organization
 * name / mailing name), checkboxes (an unticked box isn't an empty answer), and Add Description, where the backend
 * falls back to the lead's description when the form leaves it empty.
 */
const NOT_CHECKED_FOR_REQUIRED = new Set(['organizationName', 'mailingName', 'isPrimaryContact', 'doNotCall', 'addDescription']);

/** Built-in fields whose admin "required" rule the Convert Lead form enforces: module, fieldKey and form field name. */
export const CONVERT_CONFIGURED_FIELDS: readonly { module: ConvertModule; fieldKey: string; name: keyof ConvertLeadFormValues }[] = (
    Object.entries(CONVERT_FIELD_NAMES) as [ConvertModule, Record<string, keyof ConvertLeadFormValues>][]
).flatMap(([module, names]) =>
    Object.entries(names)
        .filter(([fieldKey]) => !NOT_CHECKED_FOR_REQUIRED.has(fieldKey))
        .map(([fieldKey, name]) => ({ module, fieldKey, name })),
);
