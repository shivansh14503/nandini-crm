import type { EntityEmail, Lead, Prisma } from '../../generated/prisma/client.js';
import { fromDateOnly, fromOptionalDateOnly, nullable, parseCustomFields, parseStringArray, serializeCustomFields, stringifyStringArray, text, toDateOnly, toIso, toIsoOrUndefined } from '../../utils/mappers.js';
import { toEmailDtos, type CorporateEmailDto } from '../shared/entityEmails.js';
import { isGstRegistrationType } from '../shared/registrationType.js';
import type { LeadInput } from './lead.validator.js';

export type LeadRow = Lead & { emailAddress?: EntityEmail[] };

/** `Lead` from frontend-crm/src/types/lead.types.ts, plus conversion links once converted. */
export interface LeadDto {
    id: string;
    leadCode: string;
    name: string;
    mobile: string;
    emailAddress: CorporateEmailDto[];
    mailingName: string;
    tradeName: string;
    designation: string;
    leadSource: string;
    productCategory: string[];
    followupType: string;
    customerResponse: string;
    remarks: string;
    registrationType: string;
    gstNumber: string;
    turnover: string;
    assignedTo: string;
    otherPhone: string;
    organizationName: string;
    department: string;
    leadType: string;
    /** Hot / Warm / Cold, set by the system (read-only: not part of the lead input). */
    rating: string;
    /** Why the current Rating (read-only). */
    ratingReason: string;
    /** Consecutive unanswered calls (read-only). */
    unansweredCalls: number;
    status: string;
    nextFollowupDate: string;
    nextFollowupTime: string;
    description: string;
    noOfEmployee: string;
    referredBy: string;
    primaryAddress: string;
    primaryCity: string;
    primaryState: string;
    primaryPostalCode: string;
    primaryCountry: string;
    primaryLatitude: string;
    otherAddress: string;
    otherCity: string;
    otherState: string;
    otherPostalCode: string;
    otherCountry: string;
    otherLongitude: string;
    copyAddressFromLeft: boolean;
    convertedAt?: string;
    convertedBy?: string;
    convertedOrganizationId?: string;
    convertedContactId?: string;
    convertedOpportunityId?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    /** Username of the last editor; empty until the record is first modified. */
    updatedBy: string;
    /** Admin-defined custom field values keyed by FormFieldDefinition.fieldKey. */
    customFields: Record<string, unknown>;
}

export function toLeadDto(row: LeadRow): LeadDto {
    return {
        id: row.id,
        leadCode: row.leadCode,
        name: row.name,
        mobile: text(row.mobile),
        emailAddress: toEmailDtos(row.emailAddress),
        mailingName: text(row.mailingName),
        tradeName: text(row.tradeName),
        designation: text(row.designation),
        leadSource: text(row.leadSource),
        productCategory: parseStringArray(row.productCategoryJson),
        followupType: text(row.followupType),
        customerResponse: text(row.customerResponse),
        remarks: text(row.remarks),
        registrationType: text(row.registrationType),
        gstNumber: text(row.gstNumber),
        turnover: text(row.turnover),
        assignedTo: row.assignedTo,
        otherPhone: text(row.otherPhone),
        organizationName: text(row.organizationName),
        department: text(row.department),
        leadType: text(row.leadType),
        rating: text(row.rating),
        ratingReason: text(row.ratingReason),
        unansweredCalls: row.unansweredCalls,
        status: row.status,
        nextFollowupDate: toDateOnly(row.nextFollowupDate),
        nextFollowupTime: text(row.nextFollowupTime),
        description: text(row.description),
        noOfEmployee: text(row.noOfEmployee),
        referredBy: text(row.referredBy),
        primaryAddress: text(row.primaryAddress),
        primaryCity: text(row.primaryCity),
        primaryState: text(row.primaryState),
        primaryPostalCode: text(row.primaryPostalCode),
        primaryCountry: text(row.primaryCountry),
        primaryLatitude: text(row.primaryLatitude),
        otherAddress: text(row.otherAddress),
        otherCity: text(row.otherCity),
        otherState: text(row.otherState),
        otherPostalCode: text(row.otherPostalCode),
        otherCountry: text(row.otherCountry),
        otherLongitude: text(row.otherLongitude),
        copyAddressFromLeft: row.copyAddressFromLeft,
        convertedAt: toIsoOrUndefined(row.convertedAt),
        convertedBy: row.convertedBy ?? undefined,
        convertedOrganizationId: row.convertedOrganizationId ?? undefined,
        convertedContactId: row.convertedContactId ?? undefined,
        convertedOpportunityId: row.convertedOpportunityId ?? undefined,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        customFields: parseCustomFields(row.customDataJson),
    };
}

const DEFAULT_COUNTRY = 'IN';

export function toLeadData(input: LeadInput): Omit<Prisma.LeadUncheckedCreateInput, 'leadCode' | 'createdBy'> {
    const primary = {
        address: nullable(input.primaryAddress),
        city: nullable(input.primaryCity),
        state: nullable(input.primaryState),
        postalCode: nullable(input.primaryPostalCode),
        country: input.primaryCountry ?? DEFAULT_COUNTRY,
    };
    // "Copy address from left" is enforced here rather than trusted from the client.
    const other = input.copyAddressFromLeft
        ? primary
        : {
              address: nullable(input.otherAddress),
              city: nullable(input.otherCity),
              state: nullable(input.otherState),
              postalCode: nullable(input.otherPostalCode),
              country: input.otherCountry ?? DEFAULT_COUNTRY,
          };

    return {
        customDataJson: serializeCustomFields(input.customFields),
        name: input.name,
        mobile: nullable(input.mobile),
        // Mailing name always follows the organization name (read-only in the form).
        mailingName: nullable(input.organizationName),
        // Trade name defaults to the organization name, as on organizations.
        tradeName: nullable(input.tradeName) ?? nullable(input.organizationName),
        designation: nullable(input.designation),
        leadSource: nullable(input.leadSource),
        productCategoryJson: stringifyStringArray(input.productCategory),
        followupType: input.followupType ?? 'Call',
        customerResponse: nullable(input.customerResponse),
        remarks: nullable(input.remarks),
        registrationType: nullable(input.registrationType),
        gstNumber: isGstRegistrationType(input.registrationType) ? nullable(input.gstNumber?.toUpperCase()) : null,
        turnover: nullable(input.turnover),
        assignedTo: input.assignedTo,
        otherPhone: input.otherPhone ?? null,
        organizationName: nullable(input.organizationName),
        department: nullable(input.department),
        leadType: nullable(input.leadType),
        status: input.status,
        nextFollowupDate: fromOptionalDateOnly(input.nextFollowupDate),
        nextFollowupTime: nullable(input.nextFollowupTime),
        description: nullable(input.description),
        noOfEmployee: nullable(input.noOfEmployee),
        referredBy: nullable(input.referredBy),
        primaryAddress: primary.address,
        primaryCity: primary.city,
        primaryState: primary.state,
        primaryPostalCode: primary.postalCode,
        primaryCountry: primary.country,
        primaryLatitude: nullable(input.primaryLatitude),
        otherAddress: other.address,
        otherCity: other.city,
        otherState: other.state,
        otherPostalCode: other.postalCode,
        otherCountry: other.country,
        otherLongitude: nullable(input.otherLongitude),
        copyAddressFromLeft: input.copyAddressFromLeft,
    };
}
