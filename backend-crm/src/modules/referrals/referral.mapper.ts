import type { EntityEmail, Prisma, Referral } from '../../generated/prisma/client.js';
import { nullable, parseCustomFields, serializeCustomFields, text, toIso } from '../../utils/mappers.js';
import { toEmailDtos, type CorporateEmailDto } from '../shared/entityEmails.js';
import { ACTIVE_REFERRAL_STATUS, REFERRAL_STATUSES, type ReferralInput, type ReferralStatus } from './referral.validator.js';

export type ReferralRow = Referral & { emailAddress?: EntityEmail[] };

/** `Referral` from frontend-crm/src/types/referral.types.ts. */
export interface ReferralDto {
    id: string;
    name: string;
    companyName: string;
    mobile: string;
    officePhone: string;
    emailAddress: CorporateEmailDto[];
    assignedTo: string;
    designation: string;
    department: string;
    status: ReferralStatus;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    /** Username of the last editor; empty until the record is first modified. */
    updatedBy: string;
    /** Admin-defined custom field values keyed by FormFieldDefinition.fieldKey. */
    customFields: Record<string, unknown>;
}

const toStatus = (value: string): ReferralStatus =>
    (REFERRAL_STATUSES as readonly string[]).includes(value) ? (value as ReferralStatus) : ACTIVE_REFERRAL_STATUS;

export function toReferralDto(row: ReferralRow): ReferralDto {
    return {
        id: row.id,
        name: row.name,
        companyName: text(row.companyName),
        mobile: row.mobile,
        officePhone: text(row.officePhone),
        emailAddress: toEmailDtos(row.emailAddress),
        assignedTo: row.assignedTo,
        designation: text(row.designation),
        department: text(row.department),
        status: toStatus(row.status),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        customFields: parseCustomFields(row.customDataJson),
    };
}

/** Writable columns. */
export function toReferralData(input: ReferralInput): Omit<Prisma.ReferralUncheckedCreateInput, 'createdBy'> {
    return {
        customDataJson: serializeCustomFields(input.customFields),
        name: input.name,
        companyName: nullable(input.companyName),
        mobile: input.mobile,
        officePhone: input.officePhone ?? null,
        assignedTo: input.assignedTo,
        designation: nullable(input.designation),
        department: nullable(input.department),
        status: input.status,
    };
}
