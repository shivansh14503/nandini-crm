import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import {
    requiredString,
    optionalString,
    requiredText,
    optionalText,
    configurableOption,
    customFieldsSchema,
    tallySerialNoOptional,
} from './common';

// Same shapes the API accepts (backend-crm/src/validators/common.ts optionalAmountString / optionalDate / optionalWallClock).
const AMOUNT_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WALL_CLOCK_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Non-negative amount with up to 2 decimals, kept as text (amount inputs hold strings); blank allowed. */
const optionalAmount = (fieldName: string) =>
    optionalString.refine((v) => !v || AMOUNT_PATTERN.test(v), {
        message: `${fieldName} must be a non-negative amount with up to 2 decimals.`,
    });

/** `YYYY-MM-DD` that exists on the calendar; blank allowed. */
const optionalDate = (fieldName: string) =>
    optionalString.refine((v) => !v || (DATE_PATTERN.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v), {
        message: `${fieldName} must be a valid date.`,
    });

/** Local date-time (`YYYY-MM-DDTHH:mm`, the `datetime-local` format); blank allowed. */
const optionalWallClock = (fieldName: string) =>
    optionalString.refine((v) => !v || (WALL_CLOCK_PATTERN.test(v.slice(0, 16)) && !Number.isNaN(new Date(v).getTime())), {
        message: `${fieldName} must be a valid date and time.`,
    });

/**
 * Mirrors backend-crm/src/modules/contracts/contract.validator.ts. Only locked fields are required here
 * (docs/field-locking-policy.md); soft-required ones come from the form configuration, which useRhfForm applies.
 */
export const contractFormSchema = z
    .object({
        // Contract Details. Title, status and period are admin-customizable (contract_* dropdowns).
        contractTitle: configurableOption('Contract Title'),
        status: configurableOption('Status', 'Not Started'),
        contractValue: optionalAmount('Contract Value'),
        assignedTo: requiredString('Contract Manager'),
        organizationName: requiredText('Organization Name', L.organizationName),
        organizationId: optionalString,
        contact: requiredText('Contact Person', L.personName),
        contactId: optionalString,
        opportunity: optionalText('Opportunity', L.organizationName),
        opportunityId: optionalString,
        tallySerialNo: tallySerialNoOptional('Tally Serial Number'),

        // Term & Renewal
        startDate: optionalDate('Contract Start Date'),
        endDate: optionalDate('Contract End Date'),
        contractPeriod: optionalText('Contract Period', L.option),
        renewalReminderDate: optionalWallClock('Renewal Reminder Date'),
        contractType: z.array(z.string()).default([]),

        // Billing
        billNumber: optionalText('Bill Number', L.shortCode),
        billDate: optionalDate('Bill Date'),
        billAmount: optionalAmount('Bill Amount'),
        description: optionalText('Description', L.longText),

        /** Admin-defined custom field values (validated against the form configuration by useRhfForm). */
        customFields: customFieldsSchema,
    })
    .superRefine((contract, ctx) => {
        // Both are `YYYY-MM-DD`, so string order is date order.
        if (contract.startDate && contract.endDate && contract.endDate < contract.startDate) {
            ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Contract End Date cannot be before the Contract Start Date.' });
        }
    });

export type ContractFormSchemaType = z.infer<typeof contractFormSchema>;
