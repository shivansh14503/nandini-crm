import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    addDaysToDate,
    addMonthsToDate,
    CONTRACT_IMPORT_DEFAULTS,
    contractDropdownDefaults,
    contractEndDate,
    contractPeriodMonths,
    reminderCell,
    renewalReminderFor,
} from './contracts.values.js';
import type { DropdownConfigs } from './quotations.values.js';

const option = (value: string, sortOrder: number, isDefault = false, isActive = true) => ({ value, meta: null, sortOrder, isActive, isDefault });

describe('contract import dropdown defaults', () => {
    const configs: DropdownConfigs = {
        categories: [
            { id: 'title', options: [option('AMC', 1), option('TSS Renewal', 2, true)] },
            { id: 'status', options: [option('Not Started', 1), option('Active', 2)] },
            { id: 'period', options: [option('6 Months', 2, true), option('1 Year', 1, true, false)] },
            { id: 'type', options: [option('Support', 2, true), option('Cloud', 1, true), option('Old', 3, true, false)] },
        ],
        fieldsByModule: {
            contracts: [
                { fieldKey: 'contractTitle', isSystem: true, dropdownCategoryId: 'title' },
                { fieldKey: 'status', isSystem: true, dropdownCategoryId: 'status' },
                { fieldKey: 'contractPeriod', isSystem: true, dropdownCategoryId: 'period' },
                { fieldKey: 'contractType', isSystem: true, dropdownCategoryId: 'type' },
            ],
        },
    };

    it("takes the admin's active default options, every default of the multi-select in admin order", () => {
        assert.deepEqual(contractDropdownDefaults(configs), {
            contractTitle: 'TSS Renewal',
            status: CONTRACT_IMPORT_DEFAULTS.status,
            contractPeriod: '6 Months',
            contractType: ['Cloud', 'Support'],
        });
    });

    it('leaves dropdowns without a default empty, Status falling back to Not Started', () => {
        assert.deepEqual(contractDropdownDefaults({ categories: [], fieldsByModule: {} }), {
            contractTitle: '',
            status: 'Not Started',
            contractPeriod: '',
            contractType: [],
        });
    });
});

describe('contract import term', () => {
    it('reads the length a Contract Period names', () => {
        assert.equal(contractPeriodMonths('1 Year'), 12);
        assert.equal(contractPeriodMonths('2 years'), 24);
        assert.equal(contractPeriodMonths('6 Months'), 6);
        assert.equal(contractPeriodMonths('Other'), null);
        assert.equal(contractPeriodMonths(undefined), null);
    });

    it('adds months and days on the calendar, keeping the last day of a shorter month', () => {
        assert.equal(addMonthsToDate('2026-01-31', 1), '2026-02-28');
        assert.equal(addMonthsToDate('2028-01-31', 1), '2028-02-29');
        assert.equal(addMonthsToDate('2026-02-30', 1), '');
        assert.equal(addDaysToDate('2026-03-01', -1), '2026-02-28');
    });

    it('ends a contract after its period, or after a year when the period names none', () => {
        assert.equal(contractEndDate('2026-11-28', '6 Months'), '2027-05-28');
        assert.equal(contractEndDate('2026-11-28', 'Other'), '2027-11-28');
        assert.equal(contractEndDate('2026-11-28', ''), '2027-11-28');
    });

    it('reminds 15 days before the End Date at 11:00, unless that has passed', () => {
        assert.equal(renewalReminderFor('2027-11-28', '2026-11-28T10:00'), '2027-11-13T11:00');
        assert.equal(renewalReminderFor('2026-12-01', '2026-11-28T10:00'), '');
        assert.equal(renewalReminderFor('', '2026-11-28T10:00'), '');
    });

    it('puts a Renewal Reminder Date given without a time at 11:00', () => {
        assert.equal(reminderCell('2027-01-10'), '2027-01-10T11:00');
        assert.equal(reminderCell('2027-01-10T09:30'), '2027-01-10T09:30');
        assert.equal(reminderCell(''), '');
        assert.equal(reminderCell(undefined), '');
    });
});
