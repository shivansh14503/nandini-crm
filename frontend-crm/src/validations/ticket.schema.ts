import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { configurableOption, customFieldsSchema, optionalLongText, optionalString, optionalText, requiredLongText, requiredString, requiredText, zodEmailOptional, zodPhoneOptional } from './common';
import { getNatureOfCalls } from '../services/masterData.store';

export const ticketFormSchema = z.object({
    // Overview — left column
    amcFlag: z.boolean().default(false),
    ticketSubject: optionalText('Ticket Subject', L.title),
    organizationName: requiredText('Organization Name', L.organizationName),
    contact: requiredText('Contact', L.personName),
    contactNumber: zodPhoneOptional,
    // Priority / source / support type / status / mode options are admin-customizable (ticket_* dropdowns).
    // Priority, Nature Of Call and Support Mode are required by the form configuration (admin-relaxable).
    ticketPriority: optionalString,
    source: configurableOption('Source', 'Call'),
    supportType: configurableOption('Support Type', 'Free'),
    problemReported: requiredLongText('Problem Reported'),
    resolution: optionalLongText,
    reasonForEscalatedCalls: optionalLongText,
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
    problemObserved: optionalLongText,
    rca: optionalLongText,
    addDescription: optionalLongText,

    // Partner Company tab
    partnerCompany: optionalString,
    partnerCompanyContact: optionalString,

    /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
    customFields: customFieldsSchema,
});

export type TicketFormSchemaType = z.infer<typeof ticketFormSchema>;
