import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    customFieldsSchema,
    GST_REGEX,
    optionalDate,
    optionalDescription,
    optionalGst,
    optionalPhone,
    optionalPostalCode,
    optionalText,
    optionalUpperText,
    phone,
    refinePostalCodeForCountry,
    requiredPersonName,
    requiredText,
    requiredUpperText,
    stringList,
    textWithDefault,
} from '../../validators/common.js';
import { corporateEmailListSchema } from '../shared/entityEmails.js';
import { isGstRegistrationType } from '../shared/registrationType.js';

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

/**
 * Field rules shared by the lead form and bulk import. Only locked fields (docs/field-locking-policy.md) are
 * required here; fields an admin may relax are optional and enforced from the form configuration
 * (`validateModulePayload`).
 */
const leadFields = z.object({
    name: requiredPersonName('Lead Name', L.personName),
    mobile: optionalPhone('Mobile'),
    emailAddress: corporateEmailListSchema.default([]),
    mailingName: optionalText('Mailing Name', L.organizationName),
    tradeName: optionalUpperText('Trade Name', L.organizationName),
    designation: optionalText('Designation', L.option),
    leadSource: optionalText('Lead Source', L.option),
    productCategory: stringList('Product Category', 30, L.option).default([]),
    followupType: optionalText('Followup Type', L.option),
    customerResponse: optionalText('Customer Response', L.option),
    remarks: optionalDescription('Remarks'),
    registrationType: optionalText('Registration Type', 30),
    gstNumber: optionalGst,
    turnover: optionalText('Turnover', 30),
    assignedTo: requiredText('Assigned Representative', L.username),

    otherPhone: optionalPhone('Other Phone'),
    organizationName: optionalUpperText('Organization Name', L.organizationName),
    department: optionalText('Department', L.option),
    leadType: optionalText('Lead Type', L.option),
    // Admin-customizable (lead_status); 'New' / 'Converted' are system options and keep their meaning.
    status: textWithDefault('Status', 30, 'New'),
    nextFollowupDate: optionalDate('Next Followup Date'),
    nextFollowupTime: optionalText('Next Followup Time', 20),
    description: optionalText('Description', L.longText),
    noOfEmployee: optionalText('No of Employee', 30),
    referredBy: optionalText('Referred By', L.organizationName),

    primaryAddress: optionalText('Billing Street', L.address),
    primaryCity: optionalText('Billing City', L.shortText),
    primaryState: optionalText('Billing State', L.shortText),
    primaryPostalCode: optionalPostalCode,
    primaryCountry: optionalText('Billing Country', L.shortText),
    primaryLatitude: optionalText('Billing Latitude', 30),

    otherAddress: optionalText('Shipping Street', L.address),
    otherCity: optionalText('Shipping City', L.shortText),
    otherState: optionalText('Shipping State', L.shortText),
    otherPostalCode: optionalPostalCode,
    otherCountry: optionalText('Shipping Country', L.shortText),
    otherLongitude: optionalText('Shipping Longitude', 30),
    copyAddressFromLeft: z.boolean().default(false),
    customFields: customFieldsSchema,
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

/** A 'Registered' / SEZ lead must carry a valid GSTIN (other registration types store none). */
function refineLeadGst(lead: { registrationType?: string; gstNumber?: string }, ctx: z.RefinementCtx): void {
    if (!isGstRegistrationType(lead.registrationType)) return;
    const gst = lead.gstNumber?.trim();
    if (!gst) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `GST Number is required when Registration Type is ${lead.registrationType}.`, path: ['gstNumber'] });
    } else if (!GST_REGEX.test(gst.toUpperCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please enter a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).', path: ['gstNumber'] });
    }
}

/** `LeadFormData` rules from frontend-crm/src/validations/lead.schema.ts. */
export const leadInputSchema = leadFields.superRefine((lead, ctx) => {
    refineLeadPostalCodes(lead, ctx);
    refineLeadGst(lead, ctx);
});

/** Bulk import: the template has no GSTIN column, so the GST rule is skipped. */
export const leadImportSchema = leadFields.superRefine(refineLeadPostalCodes);

export type LeadInput = z.infer<typeof leadInputSchema>;

/**
 * `ConvertLeadFormValues` rules from frontend-crm/src/validations/convertLead.schema.ts. Organization and
 * opportunity fields an admin may relax are optional here; `convertLead` enforces them from the organization and
 * opportunity form configurations.
 */
/** One record's extra Convert Lead values (fieldKey → value). */
const extraFieldValues = z.record(z.string().max(80), z.unknown()).default({});

export const convertLeadSchema = z.object({
    // Organization
    existingOrganizationId: optionalText('Organization', 50),
    organizationName: requiredUpperText('Organization Name', L.organizationName),
    mailingName: optionalText('Mailing Name', L.organizationName),
    natureOfBusiness: optionalText('Nature of Business', L.option),
    typeOfEntity: optionalText('Type of Entity', L.option),
    customerType: optionalText('Customer Type', L.option),
    // Required when Customer Type is Partner (checked by the conversion for a new organization).
    natureOfPartner: optionalText('Nature of Partner', L.option),
    leadSource: optionalText('Lead Source', L.option),
    memberOf: optionalText('Member of', L.organizationName),
    organizationDescription: optionalText('Organization Description', L.longText),
    // No Assigned To: the new organization, contact and opportunity go to the lead's own Assigned To.

    // Contact
    existingContactId: optionalText('Contact', 50),
    contactName: requiredPersonName('Contact Name', L.personName),
    contactMobile: phone('Mobile'),
    contactPhone3: optionalPhone('Phone 3'),
    // Required (or not) as the Contact form's configuration says: `convertLead` checks it.
    contactEmails: corporateEmailListSchema,
    isPrimaryContact: z.boolean().default(true),
    designation: optionalText('Designation', L.option),
    department: optionalText('Department', L.option),
    communicationType: stringList('Communication Type', 10, 30).default(['Call', 'Email']),
    doNotCall: z.boolean().default(false),
    contactDescription: optionalText('Contact Description', L.longText),

    // Opportunity. `createOpportunity: false` converts without one (the deal already has an opportunity); the
    // opportunity fields are then ignored.
    createOpportunity: z.boolean().default(true),
    productCategory: stringList('Product Category', 30, L.option).default([]),
    referredBy: optionalText('Referred By', L.organizationName),
    type: optionalText('Type', L.option),
    nextFollowupDate: optionalDate('Next Followup Date'),
    nextFollowupTime: optionalText('Next Followup Time', 20),
    followupType: optionalText('Followup Type', L.option),
    opportunityDescription: optionalText('Opportunity Description', L.longText),
    opportunityLeadSource: optionalText('Lead Source', L.option),

    /**
     * Values of the other fields an admin put on Convert Lead (Form Builder › Convert Lead), per record, keyed by the
     * field's `fieldKey` (built-in and custom). `convertLead` keeps only fields shown there and checks them by the
     * record's own form rules.
     */
    extraFields: z
        .object({
            contacts: extraFieldValues,
            organizations: extraFieldValues,
            opportunities: extraFieldValues,
        })
        .default({ contacts: {}, organizations: {}, opportunities: {} }),
});

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

export const leadListQuerySchema = z.object({
    status: csvQuery,
    /** e.g. `excludeStatus=Converted` to hide converted leads. */
    excludeStatus: csvQuery,
    leadType: csvQuery,
    /** Hot / Warm / Cold. */
    rating: csvQuery,
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
    'rating',
    'leadSource',
    'nextFollowupDate',
    'assignedTo',
] as const;

/** GET /api/leads/check-duplicates: informational "already in the CRM" lookup for the lead / contact forms. */
export const checkLeadDuplicatesQuerySchema = z.object({
    mobile: z.string().trim().max(30).optional(),
    emails: csvQuery,
    /** The record being edited, so its own mobile / emails aren't reported. */
    excludeId: z.string().trim().max(64).optional(),
    /** Which kind of record `excludeId` is (defaults to a lead). */
    excludeType: z.enum(['lead', 'contact', 'organization']).optional(),
});
