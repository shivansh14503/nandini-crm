import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pastValueIssues } from '../../validators/notInPast.js';
import { contractInputSchema, contractListQuerySchema, contractPastChecks } from './contract.validator.js';

/** The locked fields; everything else is optional here (the form configuration enforces the soft-required ones). */
const minimal = {
    contractTitle: 'Tally TSS',
    assignedTo: 'mittal.sharma',
    organizationName: 'Acme Traders',
    contact: 'ravi kumar',
};

/** Error messages of a failed parse, keyed by field path. */
function issues(body: Record<string, unknown>): Record<string, string> {
    const result = contractInputSchema.safeParse(body);
    assert.equal(result.success, false, 'expected the body to be rejected');
    return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

describe('contract input', () => {
    it('requires the locked fields', () => {
        const errors = issues({});
        assert.equal(errors.contractTitle, 'Contract Title is required.');
        assert.equal(errors.assignedTo, 'Contract Manager is required.');
        assert.equal(errors.organizationName, 'Organization Name is required.');
        assert.equal(errors.contact, 'Contact Person is required.');
        assert.equal(errors.status, undefined);
    });

    it('defaults the status and stores names the way other modules do', () => {
        const input = contractInputSchema.parse(minimal);
        assert.equal(input.status, 'Not Started');
        assert.equal(input.organizationName, 'ACME TRADERS');
        assert.equal(input.contact, 'Ravi Kumar');
        assert.deepEqual(input.contractType, []);
        assert.deepEqual(input.customFields, {});
    });

    it('reads blank optional values as not set', () => {
        const input = contractInputSchema.parse({
            ...minimal,
            status: '',
            contractValue: '',
            opportunity: '  ',
            startDate: '',
            renewalReminderDate: '',
            billAmount: null,
            description: null,
        });
        assert.equal(input.status, 'Not Started');
        assert.equal(input.contractValue, undefined);
        assert.equal(input.opportunity, undefined);
        assert.equal(input.startDate, undefined);
        assert.equal(input.renewalReminderDate, undefined);
        assert.equal(input.billAmount, undefined);
        assert.equal(input.description, undefined);
    });

    it('accepts non-negative amounts with up to 2 decimals, as text or numbers', () => {
        const input = contractInputSchema.parse({ ...minimal, contractValue: 125000, billAmount: '1180.50' });
        assert.equal(input.contractValue, '125000');
        assert.equal(input.billAmount, '1180.50');
        assert.match(issues({ ...minimal, contractValue: '-1' }).contractValue, /non-negative amount/);
        assert.match(issues({ ...minimal, billAmount: '10.555' }).billAmount, /up to 2 decimals/);
    });

    it('keeps the renewal reminder as a wall-clock date-time', () => {
        assert.equal(contractInputSchema.parse({ ...minimal, renewalReminderDate: '2027-11-10T11:00' }).renewalReminderDate, '2027-11-10T11:00');
        // Seconds and a trailing Z (an ISO timestamp) are dropped, not converted.
        assert.equal(contractInputSchema.parse({ ...minimal, renewalReminderDate: '2027-11-10T11:00:00.000Z' }).renewalReminderDate, '2027-11-10T11:00');
        for (const value of ['2027-11-10', '2027-02-30T11:00', '2027-11-10T24:00', 'soon']) {
            assert.equal(issues({ ...minimal, renewalReminderDate: value }).renewalReminderDate, 'Renewal Reminder Date must be a valid date and time.', value);
        }
    });

    it('rejects an end date before the start date', () => {
        assert.equal(
            issues({ ...minimal, startDate: '2027-04-01', endDate: '2027-03-31' }).endDate,
            'Contract End Date cannot be before the Contract Start Date.',
        );
        assert.equal(contractInputSchema.safeParse({ ...minimal, startDate: '2027-04-01', endDate: '2027-04-01' }).success, true);
        // Either date alone is fine.
        assert.equal(contractInputSchema.safeParse({ ...minimal, endDate: '2027-03-31' }).success, true);
    });

    it('enforces the column widths', () => {
        assert.equal(issues({ ...minimal, tallySerialNo: '7'.repeat(10) }).tallySerialNo, 'Tally Serial Number must be exactly 9 digits (you entered 10).');
        assert.equal(issues({ ...minimal, tallySerialNo: '612345678' }).tallySerialNo, 'Tally Serial Number must start with 7.');
        assert.equal(contractInputSchema.safeParse({ ...minimal, tallySerialNo: '712345678' }).success, true);
        assert.equal(issues({ ...minimal, billNumber: 'x'.repeat(31) }).billNumber, 'Bill Number cannot exceed 30 characters.');
        assert.equal(issues({ ...minimal, contractTitle: 'x'.repeat(101) }).contractTitle, 'Contract Title cannot exceed 100 characters.');
    });
});

describe('contract dates in the past', () => {
    const NOW = '2026-11-25T10:30';
    const check = (input: Parameters<typeof contractPastChecks>[0], before?: Parameters<typeof contractPastChecks>[1]) =>
        pastValueIssues(contractPastChecks(input, before), NOW).map((issue) => issue.path[0]);

    it('rejects past dates on every date field', () => {
        assert.deepEqual(
            check({ startDate: '2026-11-24', endDate: '2026-11-24', billDate: '2026-11-01', renewalReminderDate: '2026-11-25T10:29' }),
            ['startDate', 'endDate', 'billDate', 'renewalReminderDate'],
        );
        assert.deepEqual(check({ startDate: '2026-11-25', endDate: '2027-11-25', billDate: '2026-11-25', renewalReminderDate: '2026-11-25T10:30' }), []);
    });

    it('lets unchanged stored dates through, so old contracts stay editable', () => {
        const stored = { startDate: '2025-04-01', endDate: '2026-03-31', billDate: '2025-04-02', renewalReminderDate: '2026-03-16T11:00' };
        assert.deepEqual(check(stored, stored), []);
        assert.deepEqual(check({ ...stored, endDate: '2026-04-30' }, stored), ['endDate']);
    });
});

describe('contract list query', () => {
    it('splits status lists and reads flags', () => {
        const filters = contractListQuerySchema.parse({ status: 'Signed,In Progress', excludeStatus: ['Expired'], mine: 'true' });
        assert.deepEqual(filters.status, ['Signed', 'In Progress']);
        assert.deepEqual(filters.excludeStatus, ['Expired']);
        assert.equal(filters.mine, true);
    });
});
