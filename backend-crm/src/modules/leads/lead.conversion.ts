import { auditService } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { toContactDto, type ContactDto } from '../contacts/contact.mapper.js';
import { createContactRecord, findLiveContact } from '../contacts/contact.service.js';
import { contactInputSchema } from '../contacts/contact.validator.js';
import { createOpportunityRecord } from '../opportunities/opportunity.service.js';
import { opportunityInputSchema } from '../opportunities/opportunity.validator.js';
import type { OpportunityDto } from '../opportunities/opportunity.mapper.js';
import { toOrganizationDto, type OrganizationDto } from '../organizations/organization.mapper.js';
import { configuredRequiredIssues, loadModuleFieldConfig, throwFieldIssues } from '../form-configs/customFieldValidator.js';
import { createOrganizationRecord, findLiveOrganization } from '../organizations/organization.service.js';
import { organizationConversionSchema } from '../organizations/organization.validator.js';
import { assertRecordAccess } from '../shared/accessControl.js';
import { normalizeEmails } from '../shared/entityEmails.js';
import { lockRecords, runSerializable } from '../shared/transactions.js';
import { leadInclude, leadNotFound } from './lead.service.js';
import type { LeadRow } from './lead.mapper.js';
import { CONVERTED_STATUS, convertLeadSchema, type ConvertLeadInput } from './lead.validator.js';
import { assertNotInPast, nextFollowupCheck } from '../../validators/notInPast.js';
import { queueEmailVerification } from '../email-verification/emailVerification.service.js';

/** `LeadConversionResult` from frontend-crm/src/services/leadConversion.service.ts. */
export interface LeadConversionResult {
    organization: OrganizationDto;
    contact: ContactDto;
    opportunity: OpportunityDto;
    organizationCreated: boolean;
    contactCreated: boolean;
}

/**
 * Built-in fields of each module that the Convert Lead form collects (fieldKey → convert form field), with the
 * admin's "required" setting for them enforced as in that module's own form. Mirrors CONVERT_FIELD_NAMES in
 * frontend-crm/src/validations/convertLead.schema.ts (which also lists fields that are never "required" checked).
 */
const CONVERT_CONTACT_PATHS: Record<string, string> = {
    name: 'contactName',
    mobile: 'contactMobile',
    phone3: 'contactPhone3',
    emailAddress: 'contactEmails',
    designation: 'designation',
    department: 'department',
    communicationType: 'communicationType',
    addDescription: 'contactDescription',
    assignedTo: 'contactAssignedTo',
};

const CONVERT_ORGANIZATION_PATHS: Record<string, string> = {
    natureOfBusiness: 'natureOfBusiness',
    typeOfEntity: 'typeOfEntity',
    customerType: 'customerType',
    leadSource: 'leadSource',
    memberOf: 'memberOf',
    addDescriptionAndScope: 'organizationDescription',
    assignedTo: 'organizationAssignedTo',
};

const CONVERT_OPPORTUNITY_PATHS: Record<string, string> = {
    type: 'opportunityType',
    leadSource: 'opportunityLeadSource',
    productCategory: 'productCategory',
    referredBy: 'referredBy',
    nextFollowupDate: 'nextFollowupDate',
    followupType: 'followupType',
    followUpRemarks: 'opportunityDescription',
    assignedTo: 'opportunityAssignedTo',
};

const NEW_OPPORTUNITY_STAGE = 'Qualification';
const NEW_OPPORTUNITY_COMMISSION = 'Nil / Direct (0%)';

/** Leads and organizations share one Registration Type dropdown (shared_registration_type): carried over as-is. */
function registrationTypeFor(lead: LeadRow): string | undefined {
    return lead.registrationType?.trim() || undefined;
}

/** Port of `toOrganizationPayload`; also keeps the organization owner the form collects. */
function organizationPayload(values: ConvertLeadInput, lead: LeadRow) {
    return {
        organizationName: values.organizationName,
        mailingName: values.mailingName,
        // Carry over a trade name the user set on the lead; otherwise the organization defaults it to its name.
        tradeName: lead.tradeName && lead.tradeName !== lead.organizationName ? lead.tradeName : undefined,
        natureOfBusiness: values.natureOfBusiness,
        accountStatus: 'Active',
        typeOfEntity: values.typeOfEntity,
        customerType: values.customerType,
        leadSource: values.leadSource,
        memberOf: values.memberOf,
        addDescriptionAndScope: values.organizationDescription,
        accountVerified: false,
        provideSupport: 'No',
        assignedTo: values.organizationAssignedTo,
        billingAddress: lead.primaryAddress,
        billingCity: lead.primaryCity,
        billingState: lead.primaryState,
        billingPostalCode: lead.primaryPostalCode,
        billingCountry: lead.primaryCountry,
        registrationType: registrationTypeFor(lead),
        gstNumber: lead.gstNumber ?? undefined,
        partnerCompanies: [],
    };
}

/** Port of `toContactPayload`. */
function contactPayload(values: ConvertLeadInput, organization: Pick<OrganizationDto, 'id' | 'organizationName'>) {
    return {
        name: values.contactName,
        organizationName: organization.organizationName,
        organizationId: organization.id,
        mobile: values.contactMobile,
        phone3: values.contactPhone3,
        emailAddress: values.contactEmails,
        assignedTo: values.contactAssignedTo,
        isPrimaryContact: values.isPrimaryContact,
        designation: values.designation,
        department: values.department,
        leftJob: 'No',
        communicationType: values.communicationType,
        doNotCall: values.doNotCall,
        addDescription: values.contactDescription,
    };
}

/**
 * Port of `toOpportunityPayload`, with fallbacks for two fields the opportunity requires but the convert form
 * may leave empty: Add Description falls back to the lead's (required) description, and Lead Given By to the
 * lead's creator.
 */
function opportunityPayload(values: ConvertLeadInput, lead: LeadRow, organization: OrganizationDto | null, contact: ContactDto | null) {
    const primaryEmail = normalizeEmails(values.contactEmails).find((row) => row.isPrimary)?.email;
    const description = values.opportunityDescription;
    return {
        productCategory: values.productCategory,
        contact: contact?.name,
        contactId: contact?.id,
        organizationName: organization?.organizationName,
        organizationId: organization?.id,
        contactNumber: contact?.mobile,
        contactEmail: primaryEmail,
        referredBy: values.referredBy,
        type: values.opportunityType,
        salesStage: NEW_OPPORTUNITY_STAGE,
        leadSource: values.opportunityLeadSource,
        leadGivenBy: values.principalCompany || values.referredBy || lead.createdBy,
        nextFollowupDate: values.nextFollowupDate,
        nextFollowupTime: values.nextFollowupTime,
        followupType: values.followupType,
        followUpRemarks: description && description.length >= 3 ? description : (lead.followUpRemarks ?? undefined),
        description,
        assignedTo: values.opportunityAssignedTo,
        commission: NEW_OPPORTUNITY_COMMISSION,
        lineItems: [],
        lumpSumDiscount: 0,
    };
}

/**
 * POST /api/leads/:id/convert — the frontend's `convertLead` as one serializable transaction: find or create the
 * Organization (by id, then name) and the Contact (by id, then mobile), create the Opportunity, mark the lead
 * Converted with links to all three, and audit it. Any failure rolls the whole conversion back. The lead's record
 * lock (shared with lead edits) also makes concurrent conversions of one lead queue instead of deadlocking.
 */
export async function convertLead(leadId: string, body: unknown, user: AuthUser): Promise<LeadConversionResult> {
    const values = convertLeadSchema.parse(body);
    // The new opportunity's follow-up is a fresh value, so it can't be in the past.
    assertNotInPast([nextFollowupCheck(values)]);
    // Loaded before the transaction (a cache miss queries through the shared client).
    const [contactConfig, organizationConfig, opportunityConfig] = await Promise.all([
        loadModuleFieldConfig('contacts'),
        loadModuleFieldConfig('organizations'),
        loadModuleFieldConfig('opportunities'),
    ]);

    const result = await runSerializable(async (tx) => {
        await lockRecords(tx, 'lead', [leadId]);
        const lead = await tx.lead.findFirst({ where: { id: leadId, isDeleted: false }, include: leadInclude });
        if (!lead) throw leadNotFound();
        assertRecordAccess(user, lead);
        if (lead.status === CONVERTED_STATUS) throw HttpError.conflict('This lead has already been converted.');

        const existingOrganization = await findLiveOrganization(tx, values.organizationName, values.existingOrganizationId);
        const existingContact = await findLiveContact(tx, values.contactMobile, values.existingContactId);
        // Fields the admin made required on the contact / organization / opportunity forms, as the Convert Lead form
        // names them. An existing contact or organization is linked as it is, so only new ones are held to its form.
        const contactIssues = existingContact
            ? []
            : configuredRequiredIssues(contactConfig, contactPayload(values, { id: '', organizationName: values.organizationName }), CONVERT_CONTACT_PATHS);
        const organizationIssues = existingOrganization
            ? []
            : configuredRequiredIssues(organizationConfig, organizationPayload(values, lead), CONVERT_ORGANIZATION_PATHS);
        const opportunityIssues = configuredRequiredIssues(opportunityConfig, opportunityPayload(values, lead, null, null), CONVERT_OPPORTUNITY_PATHS);
        throwFieldIssues([...contactIssues, ...organizationIssues, ...opportunityIssues]);

        const organization = existingOrganization
            ? toOrganizationDto(existingOrganization, { isMyAccount: existingOrganization.assignedTo === user.username, isRecentlyViewed: false })
            : await createOrganizationRecord(tx, organizationConversionSchema.parse(organizationPayload(values, lead)), user);

        const contact = existingContact
            ? toContactDto(existingContact)
            : await createContactRecord(tx, contactInputSchema.parse(contactPayload(values, organization)), user);

        const opportunity = await createOpportunityRecord(
            tx,
            opportunityInputSchema.parse(opportunityPayload(values, lead, organization, contact)),
            user,
        );

        await tx.lead.update({
            where: { id: leadId },
            data: {
                status: CONVERTED_STATUS,
                convertedAt: new Date(),
                convertedBy: user.username,
                convertedOrganizationId: organization.id,
                convertedContactId: contact.id,
                convertedOpportunityId: opportunity.id,
                updatedBy: user.username,
            },
        });
        await auditService.record(tx, {
            entityType: 'Lead',
            entityId: leadId,
            action: 'CONVERT',
            changedBy: user.username,
            changes: {
                status: { from: lead.status, to: CONVERTED_STATUS },
                organizationId: organization.id,
                organizationCreated: !existingOrganization,
                contactId: contact.id,
                contactCreated: !existingContact,
                opportunityId: opportunity.id,
                copyActivitiesTo: values.copyActivitiesTo,
            },
        });

        return { organization, contact, opportunity, organizationCreated: !existingOrganization, contactCreated: !existingContact };
    });

    await Promise.all([
        cacheService.invalidateEntityCaches('leads'),
        cacheService.invalidateEntityCaches('opportunities'),
        ...(result.organizationCreated ? [cacheService.invalidateEntityCaches('organizations')] : []),
        ...(result.contactCreated ? [cacheService.invalidateEntityCaches('contacts')] : []),
    ]);
    if (result.organizationCreated) queueEmailVerification({ organizationId: result.organization.id });
    if (result.contactCreated) queueEmailVerification({ contactId: result.contact.id });
    return result;
}
