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
import { checkModulePayload, loadModuleFieldConfig, throwFieldIssues, type ModuleFieldConfig } from '../form-configs/customFieldValidator.js';
import { CONVERT_FIELD_NAMES, convertFieldUnavailableReason, type ConvertModuleKey } from '../form-configs/formConfig.defaults.js';
import type { ApiFieldError } from '../../utils/httpError.js';
import { createOrganizationRecord, findLiveOrganization } from '../organizations/organization.service.js';
import { organizationConversionSchema } from '../organizations/organization.validator.js';
import { assertRecordAccess } from '../shared/accessControl.js';
import { normalizeEmails } from '../shared/entityEmails.js';
import { lockRecords, runSerializable } from '../shared/transactions.js';
import { leadInclude, leadNotFound } from './lead.service.js';
import type { LeadRow } from './lead.mapper.js';
import { CONVERTED_STATUS, convertLeadSchema, type ConvertLeadInput } from './lead.validator.js';
import { assertNotInPast, businessToday, nextFollowupCheck } from '../../validators/notInPast.js';
import { toDateOnly } from '../../utils/mappers.js';
import { frozenRatingColumns } from './lead.followUp.js';
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
 * Built-in fields whose "required" setting Convert Lead doesn't check: names the conversion fills in itself and
 * checkboxes with their own defaults. Mirrors NOT_CHECKED_FOR_REQUIRED in frontend-crm convertLead.schema.ts.
 */
const NOT_CHECKED_FOR_REQUIRED = new Set(['organizationName', 'mailingName', 'isPrimaryContact', 'doNotCall']);

/** Fields of a record that Convert Lead shows beyond its own inputs (Form Builder › Convert Lead). */
function extraFieldDefs(config: ModuleFieldConfig, module: ConvertModuleKey) {
    return config.fields.filter(
        (f) => f.isActive && f.isVisibleInConvert && !(f.isSystem && f.fieldKey in CONVERT_FIELD_NAMES[module]) && !convertFieldUnavailableReason(module, f),
    );
}

/**
 * A record's payload with the extra Convert Lead values merged in: built-in fields onto the payload, custom fields
 * into `customFields`. Values of fields not shown on Convert Lead are ignored.
 */
function withExtraFields<T extends Record<string, unknown>>(payload: T, config: ModuleFieldConfig, module: ConvertModuleKey, extras: Record<string, unknown>) {
    const builtIn: Record<string, unknown> = {};
    const customFields: Record<string, unknown> = {};
    for (const field of extraFieldDefs(config, module)) {
        if (!(field.fieldKey in extras)) continue;
        (field.isSystem ? builtIn : customFields)[field.fieldKey] = extras[field.fieldKey];
    }
    return { ...payload, ...builtIn, customFields };
}

/**
 * Checks a new record against its own form's rules for the fields Convert Lead shows (required, formats, options),
 * as that form would. Issues name the Convert Lead form's fields. Returns the custom fields to store, or the issues.
 */
function checkConvertRecord(
    config: ModuleFieldConfig,
    module: ConvertModuleKey,
    payload: Record<string, unknown> & { customFields?: Record<string, unknown> },
): { customFields: Record<string, unknown>; issues: ApiFieldError[] } {
    // Convert Lead's own visibility stands in for the form's; a few names it fills itself are never "required".
    const shown: ModuleFieldConfig = {
        ...config,
        fields: config.fields.map((f) => ({
            ...f,
            isVisibleInForm: f.isVisibleInConvert && (!f.isSystem || f.fieldKey in CONVERT_FIELD_NAMES[module] || !convertFieldUnavailableReason(module, f)),
            isRequired: f.isRequired && !(f.isSystem && NOT_CHECKED_FOR_REQUIRED.has(f.fieldKey)),
        })),
    };
    const names: Record<string, string> = CONVERT_FIELD_NAMES[module];
    try {
        return { customFields: checkModulePayload(shown, payload, payload.customFields), issues: [] };
    } catch (err) {
        const errors = err instanceof HttpError ? err.errors : undefined;
        if (!errors) throw err;
        const issues = errors.map((issue) => {
            const [first, second] = issue.path.map(String);
            const fieldKey = first === 'customFields' ? second : first;
            const path = first !== 'customFields' && names[fieldKey] ? [names[fieldKey]] : ['extraFields', module, fieldKey];
            return { ...issue, path };
        });
        return { customFields: {}, issues };
    }
}

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
        remarks: description && description.length >= 3 ? description : (lead.remarks ?? undefined),
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
        // Each new record is held to its own form's rules for the fields Convert Lead shows, with the extra fields an
        // admin put there merged in. An existing contact or organization is linked as it is, so it isn't checked.
        const extras = values.extraFields;
        const contactDraft = withExtraFields(contactPayload(values, { id: '', organizationName: values.organizationName }), contactConfig, 'contacts', extras.contacts);
        const organizationDraft = withExtraFields(organizationPayload(values, lead), organizationConfig, 'organizations', extras.organizations);
        const opportunityDraft = withExtraFields(opportunityPayload(values, lead, null, null), opportunityConfig, 'opportunities', extras.opportunities);
        const contactCheck = existingContact ? null : checkConvertRecord(contactConfig, 'contacts', contactDraft);
        const organizationCheck = existingOrganization ? null : checkConvertRecord(organizationConfig, 'organizations', organizationDraft);
        const opportunityCheck = checkConvertRecord(opportunityConfig, 'opportunities', opportunityDraft);
        throwFieldIssues([...(contactCheck?.issues ?? []), ...(organizationCheck?.issues ?? []), ...opportunityCheck.issues]);

        const organization = existingOrganization
            ? toOrganizationDto(existingOrganization, { isMyAccount: existingOrganization.assignedTo === user.username, isRecentlyViewed: false })
            : await createOrganizationRecord(
                  tx,
                  organizationConversionSchema.parse({
                      ...withExtraFields(organizationPayload(values, lead), organizationConfig, 'organizations', extras.organizations),
                      customFields: organizationCheck?.customFields,
                  }),
                  user,
              );

        const contact = existingContact
            ? toContactDto(existingContact)
            : await createContactRecord(
                  tx,
                  contactInputSchema.parse({
                      ...withExtraFields(contactPayload(values, organization), contactConfig, 'contacts', extras.contacts),
                      customFields: contactCheck?.customFields,
                  }),
                  user,
              );

        const opportunity = await createOpportunityRecord(
            tx,
            opportunityInputSchema.parse({
                ...withExtraFields(opportunityPayload(values, lead, organization, contact), opportunityConfig, 'opportunities', extras.opportunities),
                customFields: opportunityCheck.customFields,
            }),
            user,
        );

        // Converting closes the lead (the opportunity carries the follow-up on): its Rating stays as it is today and
        // stops ageing, and its own next follow-up goes.
        const frozen = frozenRatingColumns(lead, businessToday());
        await tx.lead.update({
            where: { id: leadId },
            data: {
                status: CONVERTED_STATUS,
                convertedAt: new Date(),
                convertedBy: user.username,
                convertedOrganizationId: organization.id,
                convertedContactId: contact.id,
                convertedOpportunityId: opportunity.id,
                ...frozen,
                nextFollowupDate: null,
                nextFollowupTime: null,
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
                ...(frozen.rating !== lead.rating ? { rating: { from: lead.rating ?? '', to: frozen.rating ?? '' } } : {}),
                previousFollowUp: { date: toDateOnly(lead.nextFollowupDate), time: lead.nextFollowupTime ?? '' },
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
