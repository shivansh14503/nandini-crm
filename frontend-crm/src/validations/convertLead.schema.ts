import { z } from 'zod';
import { requiredString, optionalString } from './common';
import { contactFormSchema } from './contact.schema';
import { organizationFieldsSchema } from './organization.schema';
import { opportunityFormSchema } from './opportunity.schema';

const contact = contactFormSchema.shape;
const organization = organizationFieldsSchema.shape;
const opportunity = opportunityFormSchema.shape;

/**
 * Combined schema for the Convert Lead form. A lead conversion produces up to three records (Contact, Organization,
 * Opportunity), so all three sections are validated together. Every field the conversion shares with a module form
 * uses that form's own rule (the same validator object), so the two can't drift apart. Fields an admin may relax are
 * required per the module's form configuration (CONVERT_CONFIGURED_FIELDS, checked by ConvertLeadForm).
 */
export const convertLeadFormSchema = z.object({
    // ── Organization (Organization form rules) ─────────────────────────────────
    existingOrganizationId: optionalString,
    organizationName: organization.organizationName,
    mailingName: organization.mailingName,
    natureOfBusiness: organization.natureOfBusiness,
    typeOfEntity: organization.typeOfEntity,
    customerType: organization.customerType,
    leadSource: organization.leadSource,
    memberOf: organization.memberOf,
    organizationDescription: organization.addDescriptionAndScope,
    // Locked and required on organizations (the API requires an owner).
    organizationAssignedTo: requiredString('Assigned Representative'),

    // ── Contact (Contact form rules) ───────────────────────────────────────────
    existingContactId: optionalString,
    contactName: contact.name,
    contactMobile: contact.mobile,
    contactPhone3: contact.phone3,
    // Required (or not) as the Contact form's configuration says, see CONVERT_CONFIGURED_FIELDS.
    contactEmails: contact.emailAddress,
    isPrimaryContact: contact.isPrimaryContact,
    designation: contact.designation,
    department: contact.department,
    communicationType: contact.communicationType,
    doNotCall: contact.doNotCall,
    contactDescription: contact.addDescription,
    contactAssignedTo: contact.assignedTo,

    // ── Opportunity (Opportunity form rules) ───────────────────────────────────
    productCategory: opportunity.productCategory,
    referredBy: opportunity.referredBy,
    opportunityType: opportunity.type,
    nextFollowupDate: opportunity.nextFollowupDate,
    nextFollowupTime: opportunity.nextFollowupTime,
    followupType: opportunity.followupType,
    opportunityDescription: opportunity.remarks,
    opportunityLeadSource: opportunity.leadSource,
    opportunityAssignedTo: opportunity.assignedTo,

    // Other fields an admin put on Convert Lead (Form Builder › Convert Lead), per record by `fieldKey`. Their
    // "required" rule is checked from the configuration (convertRequiredIssues); the API checks the rest.
    extraFields: z.object({
        contacts: z.record(z.string(), z.unknown()),
        organizations: z.record(z.string(), z.unknown()),
        opportunities: z.record(z.string(), z.unknown()),
    }),
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
        emailAddress: 'contactEmails',
        isPrimaryContact: 'isPrimaryContact',
        designation: 'designation',
        department: 'department',
        communicationType: 'communicationType',
        doNotCall: 'doNotCall',
        addDescription: 'contactDescription',
        assignedTo: 'contactAssignedTo',
    },
    organizations: {
        organizationName: 'organizationName',
        mailingName: 'mailingName',
        natureOfBusiness: 'natureOfBusiness',
        typeOfEntity: 'typeOfEntity',
        customerType: 'customerType',
        leadSource: 'leadSource',
        memberOf: 'memberOf',
        addDescriptionAndScope: 'organizationDescription',
        assignedTo: 'organizationAssignedTo',
    },
    opportunities: {
        productCategory: 'productCategory',
        organizationName: 'organizationName',
        referredBy: 'referredBy',
        type: 'opportunityType',
        leadSource: 'opportunityLeadSource',
        nextFollowupDate: 'nextFollowupDate',
        followupType: 'followupType',
        remarks: 'opportunityDescription',
        assignedTo: 'opportunityAssignedTo',
    },
} as const satisfies Record<ConvertModule, Record<string, keyof ConvertLeadFormValues>>;

/**
 * Built-in fields whose "required" setting isn't checked on Convert Lead: names the conversion fills in itself
 * (organization name / mailing name) and checkboxes (an unticked box isn't an empty answer). Everything else is
 * required exactly as on its own form (see convertRequiredIssues in utils/convertLeadFields.ts).
 */
export const NOT_CHECKED_FOR_REQUIRED: ReadonlySet<string> = new Set(['organizationName', 'mailingName', 'isPrimaryContact', 'doNotCall']);
