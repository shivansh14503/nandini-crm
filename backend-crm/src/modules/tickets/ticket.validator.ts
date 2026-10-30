import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    enumWithDefault,
    optionalEmail,
    optionalPhone,
    optionalText,
    requiredText,
    requiredWallClock,
} from '../../validators/common.js';

// Option lists from frontend-crm/src/types/ticket.types.ts.
export const TICKET_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
export const TICKET_STATUSES = ['New', 'Assigned', 'In Progress', 'Pending Customer', 'Escalated', 'Resolved', 'Closed'] as const;
export const TICKET_CLOSED_STATUSES: readonly string[] = ['Resolved', 'Closed'];
export const TICKET_SOURCES = ['Call', 'Email', 'Web Portal', 'Chat', 'In-Person', 'WhatsApp'] as const;
export const SUPPORT_TYPES = ['Free', 'Paid', 'AMC', 'Warranty'] as const;
export const SUPPORT_MODES = ['Offsite Support', 'Onsite Support', 'Remote Support (AnyDesk/TeamViewer)', 'Phone Consultation'] as const;

const requiredEnum = <const T extends readonly [string, ...string[]]>(field: string, values: T) =>
    z.enum(values, { error: `${field} is required.` });

/** `TicketFormData` rules from frontend-crm/src/validations/ticket.schema.ts (Nature of Call is checked against the master). */
export const ticketInputSchema = z.object({
    amcFlag: z.boolean().default(false),
    ticketSubject: optionalText('Ticket Subject', L.title),
    organizationName: requiredText('Organization Name', L.organizationName),
    contactPersonName: requiredText('Contact Person Name', L.personName),
    contactNumber: optionalPhone('Contact Number'),
    ticketPriority: requiredEnum('Ticket Priority', TICKET_PRIORITIES),
    source: enumWithDefault('Source', TICKET_SOURCES, 'Call'),
    supportType: enumWithDefault('Support Type', SUPPORT_TYPES, 'Free'),
    problemReported: requiredText('Problem Reported', L.longText),
    resolution: optionalText('Resolution', L.longText),
    reasonForEscalatedCalls: optionalText('Reason For Escalated Calls', L.longText),
    assignedTo: requiredText('Assigned to', L.username),

    cloudFlag: z.boolean().default(false),
    natureOfCall: requiredText('Nature Of Call', L.option),
    accountAddress: optionalText('Account Address', L.address),
    contactEmail: optionalEmail,
    leftJob: enumWithDefault('Left Job', ['No', 'Yes'], 'No'),
    ticketStatus: enumWithDefault('Ticket Status', TICKET_STATUSES, 'New'),
    dueDate: requiredWallClock('Due Date'),
    supportMode: requiredEnum('Support Mode', SUPPORT_MODES),
    problemObserved: optionalText('Problem Observed', L.longText),
    rca: optionalText('RCA', L.longText),
    addDescription: optionalText('Add Description', L.longText),

    partnerCompany: optionalText('Partner Company', L.organizationName),
    partnerCompanyContact: optionalText('Partner Company Contact', L.personName),
});

export type TicketInput = z.infer<typeof ticketInputSchema>;

export const ticketListQuerySchema = z.object({
    ticketStatus: csvQuery,
    /** e.g. `excludeStatus=Resolved,Closed` for the Open tab. */
    excludeStatus: csvQuery,
    ticketPriority: csvQuery,
    supportType: csvQuery,
    supportMode: csvQuery,
    organizationId: z.string().trim().max(50).optional(),
    /** Tickets raised by one contact. */
    contactId: z.string().trim().max(50).optional(),
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Only tickets assigned to the signed-in user. */
    mine: booleanQuery,
    /** Open tickets whose due date (business timezone) has passed. */
    overdue: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const TICKET_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'ticketNumber',
    'ticketPriority',
    'ticketStatus',
    'dueDate',
    'assignedTo',
    'organizationName',
] as const;
