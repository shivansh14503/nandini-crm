import { z } from 'zod';
import { optionalString } from './common';
import { isPartnerCustomerType, NATURE_OF_PARTNER_REQUIRED_MESSAGE } from '../config/constants';
import { leadSourceDetailIssues } from '../utils/leadSource';
import { contactFormSchema } from './contact.schema';
import { organizationFieldsSchema } from './organization.schema';
import { opportunityFormSchema } from './opportunity.schema';

const contact = contactFormSchema.shape;
const organization = organizationFieldsSchema.shape;
const opportunity = opportunityFormSchema.shape;

/** The Opportunity form's rules for the opportunity fields; checked only when the conversion creates one. */
const opportunityRules = z.object({
    productCategory: opportunity.productCategory,
    referredBy: opportunity.referredBy,
    opportunityNatureOfPartner: opportunity.natureOfPartner,
    type: opportunity.type,
    nextFollowupDate: opportunity.nextFollowupDate,
    nextFollowupTime: opportunity.nextFollowupTime,
    followupType: opportunity.followupType,
    opportunityDescription: opportunity.remarks,
    opportunityLeadSource: opportunity.leadSource,
});
type OpportunityValues = z.output<typeof opportunityRules>;
/** A field typed as its opportunity rule's output but not checked by itself (see the refinement below). */
const deferred = <K extends keyof OpportunityValues>() => z.custom<OpportunityValues[K]>(() => true);

/**
 * Combined schema for the Convert Lead form. A lead conversion produces up to three records (Contact, Organization,
 * Opportunity), so all three sections are validated together. Every field the conversion shares with a module form
 * uses that form's own rule (the same validator object), so the two can't drift apart. Fields an admin may relax are
 * required per the module's form configuration (CONVERT_CONFIGURED_FIELDS, checked by ConvertLeadForm).
 * Assigned To isn't on it: the new records go to the lead's own Assigned To (set by the API).
 */
export const convertLeadFormSchema = z.object({
    // ── Organization (Organization form rules) ─────────────────────────────────
    existingOrganizationId: optionalString,
    organizationName: organization.organizationName,
    mailingName: organization.mailingName,
    natureOfBusiness: organization.natureOfBusiness,
    typeOfEntity: organization.typeOfEntity,
    customerType: organization.customerType,
    // Shown, and required, for a Partner organization (the Organization form's rule, below).
    natureOfPartner: organization.natureOfPartner,
    leadSource: organization.leadSource,
    memberOf: organization.memberOf,
    organizationDescription: organization.addDescriptionAndScope,

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

    // ── Opportunity (Opportunity form rules, only when one is created) ────────
    // Off when the deal already has an opportunity: the lead converts into the contact and organization only.
    createOpportunity: z.boolean(),
    productCategory: deferred<'productCategory'>(),
    // Shown, and required, by the opportunity's Lead Source: CA / Reference → Referred By, Partner → Nature of Partner.
    referredBy: deferred<'referredBy'>(),
    opportunityNatureOfPartner: deferred<'opportunityNatureOfPartner'>(),
    type: deferred<'type'>(),
    nextFollowupDate: deferred<'nextFollowupDate'>(),
    nextFollowupTime: deferred<'nextFollowupTime'>(),
    followupType: deferred<'followupType'>(),
    opportunityDescription: deferred<'opportunityDescription'>(),
    opportunityLeadSource: deferred<'opportunityLeadSource'>(),

    // Other fields an admin put on Convert Lead (Form Builder › Convert Lead), per record by `fieldKey`. Their
    // "required" rule is checked from the configuration (convertRequiredIssues); the API checks the rest.
    extraFields: z.object({
        contacts: z.record(z.string(), z.unknown()),
        organizations: z.record(z.string(), z.unknown()),
        opportunities: z.record(z.string(), z.unknown()),
    }),
}).superRefine(
    (values, ctx) => {
        // A new partner organization gives its Nature of Partner; an existing one is linked as it is.
        if (!values.existingOrganizationId && isPartnerCustomerType(values.customerType) && !values.natureOfPartner?.trim()) {
            ctx.addIssue({ code: 'custom', message: NATURE_OF_PARTNER_REQUIRED_MESSAGE, path: ['natureOfPartner'] });
        }
        if (!values.createOpportunity) return;
        const parsed = opportunityRules.safeParse(values);
        for (const issue of parsed.error?.issues ?? []) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
        const sourceIssues = leadSourceDetailIssues(
            { leadSource: values.opportunityLeadSource, referredBy: values.referredBy, natureOfPartner: values.opportunityNatureOfPartner },
            { natureOfPartner: 'opportunityNatureOfPartner' },
        );
        for (const issue of sourceIssues) ctx.addIssue({ code: 'custom', message: issue.message, path: [issue.path] });
    },
    // Checked alongside the other sections' errors, not only once those are fixed.
    { when: () => true },
);

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
    },
    organizations: {
        organizationName: 'organizationName',
        mailingName: 'mailingName',
        natureOfBusiness: 'natureOfBusiness',
        typeOfEntity: 'typeOfEntity',
        customerType: 'customerType',
        natureOfPartner: 'natureOfPartner',
        leadSource: 'leadSource',
        memberOf: 'memberOf',
        addDescriptionAndScope: 'organizationDescription',
    },
    opportunities: {
        productCategory: 'productCategory',
        organizationName: 'organizationName',
        referredBy: 'referredBy',
        natureOfPartner: 'opportunityNatureOfPartner',
        type: 'type',
        leadSource: 'opportunityLeadSource',
        nextFollowupDate: 'nextFollowupDate',
        followupType: 'followupType',
        remarks: 'opportunityDescription',
    },
} as const satisfies Record<ConvertModule, Record<string, keyof ConvertLeadFormValues>>;

/**
 * Built-in fields whose "required" setting isn't checked on Convert Lead: names the conversion fills in itself
 * (organization name / mailing name) and checkboxes (an unticked box isn't an empty answer). Everything else is
 * required exactly as on its own form (see convertRequiredIssues in utils/convertLeadFields.ts).
 */
export const NOT_CHECKED_FOR_REQUIRED: ReadonlySet<string> = new Set(['organizationName', 'mailingName', 'isPrimaryContact', 'doNotCall']);
