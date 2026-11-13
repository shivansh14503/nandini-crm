import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
    zodPhoneOptional,
    zodEmailOptional,
    configurableOption,
    customFieldsSchema,
} from './common';
import { getNatureOfCalls } from '../services/masterData.store';

export const ticketFormSchema = z.object({
    // Overview — left column
    amcFlag: z.boolean().default(false),
    ticketSubject: optionalText('Ticket Subject', L.title),
    organizationName: requiredText('Organization Name', L.organizationName),
    contactPersonName: requiredText('Contact Person Name', L.personName),
    contactNumber: zodPhoneOptional,
    // Priority / source / support type / status / mode options are admin-customizable (ticket_* dropdowns).
    // Priority, Nature Of Call and Support Mode are required by the form configuration (admin-relaxable).
    ticketPriority: optionalString,
    source: configurableOption('Source', 'Call'),
    supportType: configurableOption('Support Type', 'Free'),
    problemReported: requiredText('Problem Reported', L.longText),
    resolution: optionalText('Resolution', L.longText),
    reasonForEscalatedCalls: optionalText('Reason For Escalated Calls', L.longText),
    assignedTo: requiredString('Assigned to'),

    // Overview — right column
    cloudFlag: z.boolean().default(false),
    natureOfCall: optionalString.refine(
        (v) => !v || getNatureOfCalls().some((n) => n.name.toLowerCase() === v.toLowerCase()),
        { message: 'Select a Nature Of Call from the list.' }
    ),
    accountAddress: optionalText('Account Address', L.address),
    contactEmail: zodEmailOptional,
    leftJob: z.enum(['No', 'Yes']).default('No'),
    ticketStatus: configurableOption('Ticket Status', 'New'),
    dueDate: requiredString('Due Date').refine((v) => !Number.isNaN(new Date(v).getTime()), {
        message: 'Due Date must be a valid date and time.',
    }),
    supportMode: optionalString,
    problemObserved: optionalText('Problem Observed', L.longText),
    rca: optionalText('RCA', L.longText),
    addDescription: optionalText('Add Description', L.longText),

    // Partner Company tab
    partnerCompany: optionalString,
    partnerCompanyContact: optionalString,

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
});

export type TicketFormSchemaType = z.infer<typeof ticketFormSchema>;
