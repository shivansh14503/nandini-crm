import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
    zodPhoneOptional,
    zodEmailOptional,
} from './common';
import { getNatureOfCalls } from '../data/mockNatureOfCalls';
import {
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
    ticketSubject: optionalText('Ticket Subject', L.title),
    organizationName: requiredText('Organization Name', L.organizationName),
    contactPersonName: requiredText('Contact Person Name', L.personName),
    contactNumber: zodPhoneOptional,
    ticketPriority: requiredEnum(asTuple(TICKET_PRIORITIES), 'Ticket Priority'),
    source: z.enum(asTuple(TICKET_SOURCES)).default('Call'),
    supportType: z.enum(asTuple(SUPPORT_TYPES)).default('Free'),
    problemReported: requiredText('Problem Reported', L.longText),
    resolution: optionalText('Resolution', L.longText),
    reasonForEscalatedCalls: optionalText('Reason For Escalated Calls', L.longText),
    assignedTo: requiredString('Assigned to'),

    // Overview — right column
    cloudFlag: z.boolean().default(false),
    natureOfCall: requiredString('Nature Of Call').refine(
        (v) => getNatureOfCalls().some((n) => n.name.toLowerCase() === v.toLowerCase()),
        { message: 'Select a Nature Of Call from the list.' }
    ),
    accountAddress: optionalText('Account Address', L.address),
    contactEmail: zodEmailOptional,
    leftJob: z.enum(['No', 'Yes']).default('No'),
    ticketStatus: z.enum(asTuple(TICKET_STATUSES)).default('New'),
    dueDate: requiredString('Due Date').refine((v) => !Number.isNaN(new Date(v).getTime()), {
        message: 'Due Date must be a valid date and time.',
    }),
    supportMode: requiredEnum(asTuple(SUPPORT_MODES), 'Support Mode'),
    problemObserved: optionalText('Problem Observed', L.longText),
    rca: optionalText('RCA', L.longText),
    addDescription: optionalText('Add Description', L.longText),

    // Partner Company tab
    partnerCompany: optionalString,
    partnerCompanyContact: optionalString,
});

export type TicketFormSchemaType = z.infer<typeof ticketFormSchema>;
