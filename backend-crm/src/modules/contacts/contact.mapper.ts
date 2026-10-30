import type { Contact, EntityEmail, Prisma } from '../../generated/prisma/client.js';
import { nullable, parseStringArray, stringifyStringArray, text, toIso } from '../../utils/mappers.js';
import { toEmailDtos, type CorporateEmailDto } from '../shared/entityEmails.js';
import type { ContactInput } from './contact.validator.js';

export type ContactRow = Contact & { emailAddresses?: EntityEmail[] };

/** `Contact` from frontend-crm/src/types/contact.types.ts. */
export interface ContactDto {
    id: string;
    contactCode: string;
    name: string;
    organizationName: string;
    organizationId?: string;
    mobile: string;
    officePhone: string;
    phone3: string;
    phone4: string;
    phone5: string;
    emailAddresses: CorporateEmailDto[];
    assignedTo: string;
    isPrimaryContact: boolean;
    designation: string;
    department: string;
    leftJob: 'No' | 'Yes';
    communicationType: string[];
    doNotCall: boolean;
    description: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

export function toContactDto(row: ContactRow): ContactDto {
    return {
        id: row.id,
        contactCode: row.contactCode,
        name: row.name,
        organizationName: row.organizationName,
        organizationId: row.organizationId ?? undefined,
        mobile: row.mobile,
        officePhone: text(row.officePhone),
        phone3: text(row.phone3),
        phone4: text(row.phone4),
        phone5: text(row.phone5),
        emailAddresses: toEmailDtos(row.emailAddresses),
        assignedTo: row.assignedTo,
        isPrimaryContact: row.isPrimaryContact,
        designation: text(row.designation),
        department: text(row.department),
        leftJob: row.leftJob === 'Yes' ? 'Yes' : 'No',
        communicationType: parseStringArray(row.communicationTypeJson),
        doNotCall: row.doNotCall,
        description: text(row.description),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
    };
}

/** Writable columns; the organization link is resolved by the service. */
export function toContactData(
    input: ContactInput,
    organization: { id: string | null; name: string },
): Omit<Prisma.ContactUncheckedCreateInput, 'contactCode' | 'createdBy'> {
    return {
        name: input.name,
        organizationName: organization.name,
        organizationId: organization.id,
        mobile: input.mobile,
        officePhone: input.officePhone ?? null,
        phone3: input.phone3 ?? null,
        phone4: input.phone4 ?? null,
        phone5: input.phone5 ?? null,
        assignedTo: input.assignedTo,
        isPrimaryContact: input.isPrimaryContact,
        designation: nullable(input.designation),
        department: nullable(input.department),
        leftJob: input.leftJob,
        communicationTypeJson: stringifyStringArray(input.communicationType),
        doNotCall: input.doNotCall,
        description: nullable(input.description),
    };
}
