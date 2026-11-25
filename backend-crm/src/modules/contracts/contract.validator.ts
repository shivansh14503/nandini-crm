import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    createdWithinDaysQuery,
    csvQuery,
    customFieldsSchema,
    optionalAmountString,
    optionalDate,
    optionalText,
    optionalWallClock,
    requiredPersonName,
    requiredText,
    requiredUpperText,
    stringList,
    textWithDefault,
} from '../../validators/common.js';
import type { PastCheck } from '../../validators/notInPast.js';

/** Starting status (a system option of the contract_status dropdown), used when none is sent. */
export const CONTRACT_DEFAULT_STATUS = 'Not Started';

/**
 * `ContractFormData` rules from frontend-crm/src/validations/contract.schema.ts. Only locked fields
 * (docs/field-locking-policy.md) are required here; the rest are enforced from the form configuration.
 */
export const contractInputSchema = z
    .object({
        // Title, status and period are admin-customizable (contract_* dropdown categories).
        contractTitle: requiredText('Contract Title', L.option),
        status: textWithDefault('Status', 30, CONTRACT_DEFAULT_STATUS),
        contractValue: optionalAmountString('Contract Value'),
        assignedTo: requiredText('Contract Manager', L.username),
        organizationName: requiredUpperText('Organization Name', L.organizationName),
        organizationId: optionalText('Organization', 50),
        contact: requiredPersonName('Contact Person', L.personName),
        contactId: optionalText('Contact', 50),
        opportunity: optionalText('Opportunity', L.organizationName),
        opportunityId: optionalText('Opportunity', 50),
        tallySerialNo: optionalText('Tally Serial Number', L.shortCode),

        startDate: optionalDate('Contract Start Date'),
        endDate: optionalDate('Contract End Date'),
        contractPeriod: optionalText('Contract Period', L.option),
        renewalReminderDate: optionalWallClock('Renewal Reminder Date'),
        contractType: stringList('Contract Type', 30, L.option).default([]),

        billNumber: optionalText('Bill Number', L.shortCode),
        billDate: optionalDate('Bill Date'),
        billAmount: optionalAmountString('Bill Amount'),
        description: optionalText('Description', L.longText),

        customFields: customFieldsSchema,
    })
    .superRefine((contract, ctx) => {
        // Both are `YYYY-MM-DD`, so string order is date order.
        if (contract.startDate && contract.endDate && contract.endDate < contract.startDate) {
            ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Contract End Date cannot be before the Contract Start Date.' });
        }
    });

export type ContractInput = z.infer<typeof contractInputSchema>;

/** Dates users set on a contract can't be in the past (unchanged stored values pass, so old contracts stay editable). */
export const contractPastChecks = (
    input: Pick<ContractInput, 'startDate' | 'endDate' | 'billDate' | 'renewalReminderDate'>,
    before?: Pick<ContractInput, 'startDate' | 'endDate' | 'billDate' | 'renewalReminderDate'>,
): PastCheck[] => [
    { kind: 'date', path: 'startDate', label: 'Contract Start Date', value: input.startDate, previous: before?.startDate },
    { kind: 'date', path: 'endDate', label: 'Contract End Date', value: input.endDate, previous: before?.endDate },
    { kind: 'date', path: 'billDate', label: 'Bill Date', value: input.billDate, previous: before?.billDate },
    {
        kind: 'dateTime',
        path: 'renewalReminderDate',
        label: 'Renewal Reminder Date',
        value: input.renewalReminderDate,
        previous: before?.renewalReminderDate,
    },
];

export const contractListQuerySchema = z.object({
    status: csvQuery,
    /** e.g. `excludeStatus=Expired`. */
    excludeStatus: csvQuery,
    organizationId: z.string().trim().max(50).optional(),
    /** Contracts of one contact person. */
    contactId: z.string().trim().max(50).optional(),
    /** Contracts raised from one opportunity. */
    opportunityId: z.string().trim().max(50).optional(),
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Only contracts managed by the signed-in user ("My Contracts"). */
    mine: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const CONTRACT_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'contractNumber',
    'contractTitle',
    'status',
    'organizationName',
    'assignedTo',
    'startDate',
    'endDate',
    'renewalReminderDate',
    'contractValue',
] as const;
