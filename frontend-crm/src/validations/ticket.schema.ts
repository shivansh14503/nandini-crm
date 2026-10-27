import { z } from 'zod';
import { requiredString, optionalString, zodPhoneOptional, zodEmailOptional } from './common';
import {
    NATURES_OF_CALL,
    SUPPORT_MODES,
    SUPPORT_TYPES,
    TICKET_PRIORITIES,
    TICKET_SOURCES,
    TICKET_STATUSES,
} from '../types/ticket.types';

/** Enum whose empty/unknown value surfaces as "<Field> is required." instead of zod's generic enum message. */
const requiredEnum = <T extends string>(values: readonly [T, ...T[]], fieldName: string) =>
    z.enum(values, { error: () => `${fieldName} is required.` });

const asTuple = <T extends string>(values: T[]) => values as [T, ...T[]];

export const ticketFormSchema = z.object({
    // Overview — left column
    amcFlag: z.boolean().default(false),
    ticketSubject: optionalString,
    organizationName: requiredString('Organization Name'),
    contactPersonName: requiredString('Contact Person Name'),
    contactNumber: zodPhoneOptional,
    ticketPriority: requiredEnum(asTuple(TICKET_PRIORITIES), 'Ticket Priority'),
    source: z.enum(asTuple(TICKET_SOURCES)).default('Call'),
    supportType: z.enum(asTuple(SUPPORT_TYPES)).default('Free'),
    problemReported: requiredString('Problem Reported'),
    resolution: optionalString,
    reasonForEscalatedCalls: optionalString,
    assignedTo: requiredString('Assigned to'),

    // Overview — right column
    cloudFlag: z.boolean().default(false),
    natureOfCall: requiredEnum(asTuple(NATURES_OF_CALL), 'Nature Of Call'),
    accountAddress: optionalString,
    contactEmail: zodEmailOptional,
    leftJob: z.enum(['No', 'Yes']).default('No'),
    ticketStatus: z.enum(asTuple(TICKET_STATUSES)).default('New'),
    dueDate: requiredString('Due Date').refine((v) => !Number.isNaN(new Date(v).getTime()), {
        message: 'Due Date must be a valid date and time.',
    }),
    supportMode: requiredEnum(asTuple(SUPPORT_MODES), 'Support Mode'),
    problemObserved: optionalString,
    rca: optionalString,
    addDescription: optionalString,

    // Partner Company tab
    partnerCompany: optionalString,
    partnerCompanyContact: optionalString,
});

export type TicketFormSchemaType = z.infer<typeof ticketFormSchema>;
