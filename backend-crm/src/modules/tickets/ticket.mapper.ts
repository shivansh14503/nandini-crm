import type { Prisma, Ticket } from '../../generated/prisma/client.js';
import { fromWallClock, nullable, text, toIso, toWallClock } from '../../utils/mappers.js';
import type { TicketInput } from './ticket.validator.js';

/** `Ticket` from frontend-crm/src/types/ticket.types.ts, plus the resolved organization / contact links. */
export interface TicketDto {
    id: string;
    ticketNumber: string;
    amcFlag: boolean;
    ticketSubject: string;
    organizationName: string;
    organizationId?: string;
    contactPersonName: string;
    contactId?: string;
    contactNumber: string;
    ticketPriority: string;
    source: string;
    supportType: string;
    problemReported: string;
    resolution: string;
    reasonForEscalatedCalls: string;
    assignedTo: string;
    cloudFlag: boolean;
    natureOfCall: string;
    accountAddress: string;
    contactEmail: string;
    leftJob: string;
    ticketStatus: string;
    /** Wall-clock `YYYY-MM-DDTHH:mm`, exactly as entered. */
    dueDate: string;
    supportMode: string;
    problemObserved: string;
    rca: string;
    addDescription: string;
    partnerCompany: string;
    partnerCompanyContact: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

export function toTicketDto(row: Ticket): TicketDto {
    return {
        id: row.id,
        ticketNumber: row.ticketNumber,
        amcFlag: row.amcFlag,
        ticketSubject: text(row.ticketSubject),
        organizationName: row.organizationName,
        organizationId: row.organizationId ?? undefined,
        contactPersonName: row.contactPersonName,
        contactId: row.contactId ?? undefined,
        contactNumber: text(row.contactNumber),
        ticketPriority: row.ticketPriority,
        source: row.source,
        supportType: row.supportType,
        problemReported: row.problemReported,
        resolution: text(row.resolution),
        reasonForEscalatedCalls: text(row.reasonForEscalatedCalls),
        assignedTo: row.assignedTo,
        cloudFlag: row.cloudFlag,
        natureOfCall: row.natureOfCall,
        accountAddress: text(row.accountAddress),
        contactEmail: text(row.contactEmail),
        leftJob: row.leftJob,
        ticketStatus: row.ticketStatus,
        dueDate: toWallClock(row.dueDate),
        supportMode: row.supportMode,
        problemObserved: text(row.problemObserved),
        rca: text(row.rca),
        addDescription: text(row.addDescription),
        partnerCompany: text(row.partnerCompany),
        partnerCompanyContact: text(row.partnerCompanyContact),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
    };
}

export function toTicketData(
    input: TicketInput,
    resolved: { natureOfCall: string; organizationId: string | null; contactId: string | null },
): Omit<Prisma.TicketUncheckedCreateInput, 'ticketNumber' | 'createdBy'> {
    return {
        amcFlag: input.amcFlag,
        cloudFlag: input.cloudFlag,
        ticketSubject: nullable(input.ticketSubject),
        organizationName: input.organizationName,
        organizationId: resolved.organizationId,
        contactPersonName: input.contactPersonName,
        contactId: resolved.contactId,
        contactNumber: input.contactNumber ?? null,
        contactEmail: input.contactEmail ?? null,
        ticketPriority: input.ticketPriority,
        source: input.source,
        supportType: input.supportType,
        supportMode: input.supportMode,
        natureOfCall: resolved.natureOfCall,
        ticketStatus: input.ticketStatus,
        dueDate: fromWallClock(input.dueDate),
        problemReported: input.problemReported,
        problemObserved: nullable(input.problemObserved),
        resolution: nullable(input.resolution),
        reasonForEscalatedCalls: nullable(input.reasonForEscalatedCalls),
        rca: nullable(input.rca),
        addDescription: nullable(input.addDescription),
        accountAddress: nullable(input.accountAddress),
        leftJob: input.leftJob,
        assignedTo: input.assignedTo,
        partnerCompany: nullable(input.partnerCompany),
        partnerCompanyContact: nullable(input.partnerCompanyContact),
    };
}
