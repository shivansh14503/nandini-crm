import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../../utils/httpError.js';
import {
    ACTIVITY_IMPORT_DEFAULTS,
    activityImportSchedule,
    activityImportStatus,
    defaultFollowupType,
    parseDurationMinutes,
    relatedModuleOf,
} from './activities.values.js';

const TZ = 'Asia/Kolkata';
const option = (value: string, extra: Partial<{ isActive: boolean; isDefault: boolean; sortOrder: number }> = {}) => ({
    value,
    isActive: true,
    isDefault: false,
    sortOrder: 0,
    ...extra,
});

const failsWith = (run: () => unknown, path: string) =>
    assert.throws(run, (err: unknown) => err instanceof HttpError && err.errors?.[0]?.path?.[0] === path);

describe('activity import: Followup Type default', () => {
    it("takes the dropdown's default option", () => {
        assert.equal(defaultFollowupType({ options: [option('Call', { sortOrder: 1 }), option('Meeting', { sortOrder: 2, isDefault: true })] }), 'Meeting');
    });

    it('falls back to Call, then to the first active option', () => {
        assert.equal(defaultFollowupType({ options: [option('Meeting', { sortOrder: 1 }), option('Call', { sortOrder: 2 })] }), 'Call');
        assert.equal(defaultFollowupType({ options: [option('Call', { isActive: false }), option('Visit', { sortOrder: 2 }), option('Email', { sortOrder: 1 })] }), 'Email');
        assert.equal(defaultFollowupType(null), ACTIVITY_IMPORT_DEFAULTS.followupType);
    });

    it('skips an inactive default', () => {
        assert.equal(defaultFollowupType({ options: [option('Visit', { isDefault: true, isActive: false }), option('Call')] }), 'Call');
    });
});

describe('activity import: Duration (minutes)', () => {
    it('reads whole minutes, with or without a unit', () => {
        assert.equal(parseDurationMinutes('45'), 45);
        assert.equal(parseDurationMinutes(' 90 mins '), 90);
        assert.equal(parseDurationMinutes(''), undefined);
        assert.equal(parseDurationMinutes(undefined), undefined);
    });

    it('refuses fractions, negatives and more than 31 days', () => {
        for (const cell of ['1.5', '-5', 'an hour', String(31 * 1440 + 1)]) failsWith(() => parseDurationMinutes(cell), 'durationMinutes');
    });
});

describe('activity import: schedule', () => {
    it('reads timed Start / End as business-timezone wall clocks', () => {
        const s = activityImportSchedule({ startAt: '2026-12-01T10:30', endAt: '2026-12-01T11:15' }, 'Meeting', undefined, TZ);
        assert.deepEqual(s, { allDay: false, startAt: '2026-12-01T05:00:00.000Z', endAt: '2026-12-01T05:45:00.000Z' });
    });

    it('ends a timed activity after its Duration when End is blank (not on Tasks)', () => {
        assert.equal(activityImportSchedule({ startAt: '2026-12-01T10:00' }, 'Call', 20, TZ).endAt, '2026-12-01T04:50:00.000Z');
        assert.equal(activityImportSchedule({ startAt: '2026-12-01T10:00' }, 'Task', 20, TZ).endAt, undefined);
        assert.equal(activityImportSchedule({ startAt: '2026-12-01T10:00' }, 'Call', undefined, TZ).endAt, undefined);
    });

    it('makes a Start without a time all-day unless All Day is No', () => {
        assert.deepEqual(activityImportSchedule({ startAt: '2026-12-01', endAt: '2026-12-03' }, 'Meeting', 30, TZ), {
            allDay: true,
            startDay: '2026-12-01',
            endDay: '2026-12-03',
        });
        failsWith(() => activityImportSchedule({ startAt: '2026-12-01', allDay: false }, 'Meeting', undefined, TZ), 'startAt');
    });

    it('takes the days of an All Day Yes row, times ignored', () => {
        assert.deepEqual(activityImportSchedule({ startAt: '2026-12-01T10:00', allDay: true }, 'Meeting', undefined, TZ), {
            allDay: true,
            startDay: '2026-12-01',
            endDay: undefined,
        });
    });

    it('asks for a time on a timed End', () => {
        failsWith(() => activityImportSchedule({ startAt: '2026-12-01T10:00', endAt: '2026-12-01' }, 'Meeting', undefined, TZ), 'endAt');
    });

    it('leaves a missing Start to the create API', () => {
        assert.deepEqual(activityImportSchedule({}, 'Note', undefined, TZ), { allDay: false });
    });
});

describe('activity import: Status default', () => {
    const now = new Date('2026-11-28T06:00:00.000Z'); // 11:30 in Kolkata

    it('keeps a given Status', () => {
        assert.equal(activityImportStatus('Cancelled', { allDay: false, startAt: '2026-01-01T05:00:00.000Z' }, now, TZ), 'Cancelled');
    });

    it('is Planned for a future start and Completed for a past one', () => {
        assert.equal(activityImportStatus('', { allDay: false, startAt: '2026-11-28T07:00:00.000Z' }, now, TZ), 'Planned');
        assert.equal(activityImportStatus('', { allDay: false, startAt: '2026-11-28T05:00:00.000Z' }, now, TZ), 'Completed');
        // Within the 5 minutes' grace of the past check: still Planned.
        assert.equal(activityImportStatus('', { allDay: false, startAt: '2026-11-28T05:57:00.000Z' }, now, TZ), 'Planned');
    });

    it('compares all-day activities by business day (today is Planned)', () => {
        assert.equal(activityImportStatus(undefined, { allDay: true, startDay: '2026-11-28' }, now, TZ), 'Planned');
        assert.equal(activityImportStatus(undefined, { allDay: true, startDay: '2026-11-27' }, now, TZ), 'Completed');
    });

    it('is Planned without a start (Notes: the API completes them)', () => {
        assert.equal(activityImportStatus('', { allDay: false }, now, TZ), 'Planned');
    });
});

describe('activity import: Related To Type', () => {
    it("reads the picker's label, its plural or the module key, any case", () => {
        assert.equal(relatedModuleOf('Opportunity', 'Annual renewal'), 'opportunities');
        assert.equal(relatedModuleOf('opportunities', 'Annual renewal'), 'opportunities');
        assert.equal(relatedModuleOf(' LEAD ', 'Amit Patel'), 'leads');
        assert.equal(relatedModuleOf('Contacts', 'Rahul Sharma'), 'contacts');
        assert.equal(relatedModuleOf('ticket', 'TKT-0004'), 'tickets');
    });

    it('tells the type from a record number when the type is blank', () => {
        assert.equal(relatedModuleOf('', 'OPP-0042'), 'opportunities');
        assert.equal(relatedModuleOf('', 'org-0007'), 'organizations');
        assert.equal(relatedModuleOf(undefined, 'CTR-0001'), 'contracts');
    });

    it('is null when the row names no record', () => {
        assert.equal(relatedModuleOf('', ''), null);
        assert.equal(relatedModuleOf(undefined, undefined), null);
    });

    it('refuses an unknown type, a name without a type and a type without a record', () => {
        failsWith(() => relatedModuleOf('Product', 'PRD-0001'), 'relatedModule');
        failsWith(() => relatedModuleOf('', 'Annual renewal'), 'relatedModule');
        failsWith(() => relatedModuleOf('', 'PRD-0001'), 'relatedModule');
        failsWith(() => relatedModuleOf('Lead', ''), 'relatedTo');
    });
});
