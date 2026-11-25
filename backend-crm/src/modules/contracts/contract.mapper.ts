import type { Contract, Prisma } from '../../generated/prisma/client.js';
import {
    decimalToString,
    fromOptionalDateOnly,
    fromWallClock,
    nullable,
    parseCustomFields,
    parseStringArray,
    serializeCustomFields,
    stringifyStringArray,
    text,
    toDateOnly,
    toIso,
    toWallClock,
} from '../../utils/mappers.js';
import type { ContractInput } from './contract.validator.js';

/** `Contract` from frontend-crm/src/types/contract.types.ts, plus the resolved organization / contact / opportunity links. */
export interface ContractDto {
    id: string;
    contractNumber: string;
    contractTitle: string;
    status: string;
    /** Decimal as a string; '' when empty. */
    contractValue: string;
    /** Contract Manager (username). */
    assignedTo: string;
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;
    /** Label of the opportunity as picked (or typed). */
    opportunity: string;
    opportunityId?: string;
    tallySerialNo: string;
    /** `YYYY-MM-DD` or ''. */
    startDate: string;
    endDate: string;
    contractPeriod: string;
    /** Wall-clock `YYYY-MM-DDTHH:mm`, exactly as entered; '' when empty. */
    renewalReminderDate: string;
    contractType: string[];
    billNumber: string;
    billDate: string;
    billAmount: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    /** Username of the last editor; empty until the record is first modified. */
    updatedBy: string;
    /** Admin-defined custom field values keyed by FormFieldDefinition.fieldKey. */
    customFields: Record<string, unknown>;
}

export function toContractDto(row: Contract): ContractDto {
    return {
        id: row.id,
        contractNumber: row.contractNumber,
        contractTitle: row.contractTitle,
        status: row.status,
        contractValue: decimalToString(row.contractValue),
        assignedTo: row.assignedTo,
        organizationName: row.organizationName,
        organizationId: row.organizationId ?? undefined,
        contact: row.contact,
        contactId: row.contactId ?? undefined,
        opportunity: text(row.opportunity),
        opportunityId: row.opportunityId ?? undefined,
        tallySerialNo: text(row.tallySerialNo),
        startDate: toDateOnly(row.startDate),
        endDate: toDateOnly(row.endDate),
        contractPeriod: text(row.contractPeriod),
        renewalReminderDate: row.renewalReminderDate ? toWallClock(row.renewalReminderDate) : '',
        contractType: parseStringArray(row.contractTypeJson),
        billNumber: text(row.billNumber),
        billDate: toDateOnly(row.billDate),
        billAmount: decimalToString(row.billAmount),
        description: text(row.description),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        customFields: parseCustomFields(row.customDataJson),
    };
}

export interface ContractLink {
    id: string | null;
    name: string;
}

/** Linked records as resolved by the service; `opportunity.name` is the label stored with the link ('' = none). */
export interface ContractLinks {
    organization: ContractLink;
    contact: ContractLink;
    opportunity: ContractLink;
}

/** Writable columns; links (and their display names) come from the service. */
export function toContractData(input: ContractInput, links: ContractLinks): Omit<Prisma.ContractUncheckedCreateInput, 'contractNumber' | 'createdBy'> {
    return {
        customDataJson: serializeCustomFields(input.customFields),
        contractTitle: input.contractTitle,
        status: input.status,
        contractValue: input.contractValue ?? null,
        assignedTo: input.assignedTo,
        organizationName: links.organization.name,
        organizationId: links.organization.id,
        contact: links.contact.name,
        contactId: links.contact.id,
        opportunity: nullable(links.opportunity.name),
        opportunityId: links.opportunity.id,
        tallySerialNo: nullable(input.tallySerialNo),
        startDate: fromOptionalDateOnly(input.startDate),
        endDate: fromOptionalDateOnly(input.endDate),
        contractPeriod: nullable(input.contractPeriod),
        renewalReminderDate: input.renewalReminderDate ? fromWallClock(input.renewalReminderDate) : null,
        contractTypeJson: stringifyStringArray(input.contractType),
        billNumber: nullable(input.billNumber),
        billDate: fromOptionalDateOnly(input.billDate),
        billAmount: input.billAmount ?? null,
        description: nullable(input.description),
    };
}
