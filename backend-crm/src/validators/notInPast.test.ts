import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTimeOfDay, pastValueIssues } from './notInPast.js';

const NOW = '2026-11-13T15:10';

describe('parseTimeOfDay', () => {
    it('reads 12- and 24-hour times', () => {
        assert.equal(parseTimeOfDay('11:30 AM'), 690);
        assert.equal(parseTimeOfDay('12:00 PM'), 720);
        assert.equal(parseTimeOfDay('12:15 am'), 15);
        assert.equal(parseTimeOfDay('9 PM'), 21 * 60);
        assert.equal(parseTimeOfDay('14:30'), 870);
    });

    it('ignores text that is not a time', () => {
        for (const text of ['', 'evening', '25:00', '13 PM', '10:75', '14']) assert.equal(parseTimeOfDay(text), null, text);
    });
});

describe('pastValueIssues', () => {
    it('rejects past dates and allows today and later', () => {
        const check = (value: string) => pastValueIssues([{ kind: 'date', path: 'd', label: 'Valid Until', value }], NOW);
        assert.equal(check('2026-11-12')[0]?.message, 'Valid Until cannot be in the past.');
        assert.deepEqual(check('2026-11-13'), []);
        assert.deepEqual(check('2027-01-01'), []);
    });

    it('rejects past date-times down to the minute', () => {
        const check = (value: string) => pastValueIssues([{ kind: 'dateTime', path: 'dueDate', label: 'Due Date', value }], NOW);
        assert.equal(check('2026-11-13T15:09').length, 1);
        assert.deepEqual(check('2026-11-13T15:10'), []);
        assert.deepEqual(check('2026-11-13T18:00'), []);
    });

    it('checks the time only when the date is today', () => {
        const check = (date: string, time: string) =>
            pastValueIssues([{ kind: 'dateAndTime', path: 'nextFollowupDate', timePath: 'nextFollowupTime', label: 'Next Followup', date, time }], NOW);
        assert.deepEqual(check('2026-11-13', '02:30 PM')[0]?.path, ['nextFollowupTime']);
        assert.deepEqual(check('2026-11-13', '05:30 PM'), []);
        assert.deepEqual(check('2026-11-14', '09:30 AM'), []);
        assert.deepEqual(check('2026-11-12', '05:30 PM')[0]?.path, ['nextFollowupDate']);
        assert.deepEqual(check('2026-11-13', 'after lunch'), []);
    });

    it('lets unchanged stored values through so old records stay editable', () => {
        assert.deepEqual(pastValueIssues([{ kind: 'date', path: 'd', label: 'D', value: '2025-01-01', previous: '2025-01-01T00:00:00.000Z' }], NOW), []);
        assert.deepEqual(
            pastValueIssues(
                [{ kind: 'dateAndTime', path: 'd', timePath: 't', label: 'F', date: '2025-01-01', time: '10:00 AM', previousDate: '2025-01-01', previousTime: '10:00 AM' }],
                NOW,
            ),
            [],
        );
        // Changing only the time of a past follow-up is a new value, so it is checked.
        assert.equal(
            pastValueIssues(
                [{ kind: 'dateAndTime', path: 'd', timePath: 't', label: 'F', date: '2025-01-01', time: '11:00 AM', previousDate: '2025-01-01', previousTime: '10:00 AM' }],
                NOW,
            ).length,
            1,
        );
    });

    it('skips blank values', () => {
        assert.deepEqual(pastValueIssues([{ kind: 'date', path: 'd', label: 'D', value: '' }, { kind: 'dateTime', path: 't', label: 'T', value: undefined }], NOW), []);
    });
});
