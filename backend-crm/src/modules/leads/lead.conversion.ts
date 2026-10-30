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
import { createOrganizationRecord, findLiveOrganization } from '../organizations/organization.service.js';
import { organizationConversionSchema } from '../organizations/organization.validator.js';
import { normalizeEmails } from '../shared/entityEmails.js';
import { lockRecords, runSerializable } from '../shared/transactions.js';
import { leadInclude, leadNotFound } from './lead.service.js';
import type { LeadRow } from './lead.mapper.js';
import { CONVERTED_STATUS, convertLeadSchema, type ConvertLeadInput } from './lead.validator.js';

/** `LeadConversionResult` from frontend-crm/src/services/leadConversion.service.ts. */
export interface LeadConversionResult {
    organization: OrganizationDto;
    contact: ContactDto;
    opportunity: OpportunityDto;
    organizationCreated: boolean;
    contactCreated: boolean;
}

const UNREGISTERED_TYPES = new Set(['unregistered', 'consumer']);
const NEW_OPPORTUNITY_STAGE = 'Qualification';
const NEW_OPPORTUNITY_COMMISSION = 'Nil / Direct (0%)';

/** The lead's GST registration bucket ('Composition Scheme' etc. are registered under GST). */
function registrationTypeFor(lead: LeadRow): 'Registered' | 'Unregistered' | undefined {
    const value = lead.registrationType?.trim().toLowerCase();
    if (!value) return undefined;
    return UNREGISTERED_TYPES.has(value) ? 'Unregistered' : 'Registered';
}

/** Port of `toOrganizationPayload`; also keeps the organization owner the form collects. */
function organizationPayload(values: ConvertLeadInput, lead: LeadRow) {
    return {
        organizationName: values.organizationName,
        mailingName: values.mailingName,
        natureOfBusiness: values.natureOfBusiness,
        accountStatus: 'Active',
        typeOfEntity: values.typeOfEntity,
        customerType: values.customerType,
        sourceOfLead: values.sourceOfLead,
        memberOfParentCorp: values.memberOf,
        description: values.organizationDescription,
        accountVerified: false,
        provideSupport: 'No',
        assignedUser: values.organizationAssignedTo,
        billingAddress: lead.primaryAddress,
        billingCity: lead.primaryCity,
        billingState: lead.primaryState,
        billingPostalCode: lead.primaryPostalCode,
        billingCountry: lead.primaryCountry,
        registrationType: registrationTypeFor(lead),
        partnerCompanies: [],
    };
}

/** Port of `toContactPayload`. */
function contactPayload(values: ConvertLeadInput, organization: OrganizationDto) {
    return {
        name: values.contactName,
        organizationName: organization.organizationName,
        organizationId: organization.id,
        mobile: values.contactMobile,
        phone3: values.contactPhone3,
        emailAddresses: values.contactEmails,
        assignedTo: values.contactAssignedTo,
        isPrimaryContact: values.isPrimaryContact,
        designation: values.designation,
        department: values.department,
        leftJob: 'No',
        communicationType: values.communicationType,
        doNotCall: values.doNotCall,
        description: values.contactDescription,
    };
}

/**
 * Port of `toOpportunityPayload`, with fallbacks for two fields the opportunity requires but the convert form
 * may leave empty: Add Description falls back to the lead's (required) description, and Lead Given By to the
 * lead's creator.
 */
function opportunityPayload(values: ConvertLeadInput, lead: LeadRow, organization: OrganizationDto, contact: ContactDto) {
    const primaryEmail = normalizeEmails(values.contactEmails).find((row) => row.isPrimary)?.email;
    const description = values.opportunityDescription;
    return {
        productCategory: values.productCategory,
        contactName: contact.name,
        contactId: contact.id,
        organizationName: organization.organizationName,
        organizationId: organization.id,
        contactNumber: contact.mobile,
        emailAddress: primaryEmail,
        referredBy: values.referredBy,
        type: values.opportunityType,
        salesStage: NEW_OPPORTUNITY_STAGE,
        leadSource: values.opportunityLeadSource,
        leadGivenBy: values.principalCompany || values.referredBy || lead.createdBy,
        nextFollowupDate: values.nextFollowupDate,
        nextFollowupTime: values.nextFollowupTime,
        followupType: values.followupType,
        addDescription: description && description.length >= 3 ? description : lead.addDescription,
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

    const result = await runSerializable(async (tx) => {
        await lockRecords(tx, 'lead', [leadId]);
        const lead = await tx.lead.findFirst({ where: { id: leadId, isDeleted: false }, include: leadInclude });
        if (!lead) throw leadNotFound();
        if (lead.status === CONVERTED_STATUS) throw HttpError.conflict('This lead has already been converted.');

        const existingOrganization = await findLiveOrganization(tx, values.organizationName, values.existingOrganizationId);
        const organization = existingOrganization
            ? toOrganizationDto(existingOrganization, { isMyAccount: existingOrganization.assignedUser === user.username, isRecentlyViewed: false })
            : await createOrganizationRecord(tx, organizationConversionSchema.parse(organizationPayload(values, lead)), user);

        const existingContact = await findLiveContact(tx, values.contactMobile, values.existingContactId);
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
    return result;
}
