import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clip, firstCommonFreeSlot, graphStatusKind, mergeByKind, mergeIntervals, parseWorkingHours, splitWindows, subtractInterval, withoutOwnCopy } from './busy.intervals.js';

/** Busy-time interval helpers (spec §12.2). */

const t = (iso: string) => Date.parse(iso);
const iv = (a: string, b: string) => ({ start: t(a), end: t(b) });
const TZ = 'Asia/Kolkata';

describe('mergeIntervals / subtractInterval / clip', () => {
    it('joins overlapping and touching intervals, drops empty ones, sorts', () => {
        assert.deepEqual(
            mergeIntervals([iv('2026-12-01T05:00:00Z', '2026-12-01T06:00:00Z'), iv('2026-12-01T03:00:00Z', '2026-12-01T04:00:00Z'), iv('2026-12-01T04:00:00Z', '2026-12-01T04:30:00Z'), iv('2026-12-01T05:30:00Z', '2026-12-01T07:00:00Z'), iv('2026-12-01T08:00:00Z', '2026-12-01T08:00:00Z')]),
            [iv('2026-12-01T03:00:00Z', '2026-12-01T04:30:00Z'), iv('2026-12-01T05:00:00Z', '2026-12-01T07:00:00Z')],
        );
    });

    it('cuts a hole, a left part, a right part; leaves others', () => {
        const list = [iv('2026-12-01T03:00:00Z', '2026-12-01T07:00:00Z'), iv('2026-12-01T08:00:00Z', '2026-12-01T09:00:00Z')];
        assert.deepEqual(subtractInterval(list, iv('2026-12-01T04:00:00Z', '2026-12-01T05:00:00Z')), [
            iv('2026-12-01T03:00:00Z', '2026-12-01T04:00:00Z'),
            iv('2026-12-01T05:00:00Z', '2026-12-01T07:00:00Z'),
            iv('2026-12-01T08:00:00Z', '2026-12-01T09:00:00Z'),
        ]);
        assert.deepEqual(subtractInterval(list, iv('2026-12-01T02:00:00Z', '2026-12-01T08:30:00Z')), [iv('2026-12-01T08:30:00Z', '2026-12-01T09:00:00Z')]);
    });

    it('clips to the window', () => {
        assert.deepEqual(clip([iv('2026-12-01T03:00:00Z', '2026-12-01T07:00:00Z'), iv('2026-12-02T03:00:00Z', '2026-12-02T04:00:00Z')], t('2026-12-01T05:00:00Z'), t('2026-12-02T00:00:00Z')), [
            iv('2026-12-01T05:00:00Z', '2026-12-01T07:00:00Z'),
        ]);
    });

    it('mergeByKind merges per kind and sorts by start', () => {
        const out = mergeByKind(
            [
                { ...iv('2026-12-01T05:00:00Z', '2026-12-01T06:00:00Z'), kind: 'tentative' },
                { ...iv('2026-12-01T03:00:00Z', '2026-12-01T04:00:00Z'), kind: 'busy' },
                { ...iv('2026-12-01T03:30:00Z', '2026-12-01T05:00:00Z'), kind: 'busy' },
                { ...iv('2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z'), kind: 'away' },
            ],
            t('2026-12-01T02:00:00Z'),
            t('2026-12-01T12:00:00Z'),
        );
        assert.deepEqual(out, [
            { ...iv('2026-12-01T02:00:00Z', '2026-12-01T12:00:00Z'), kind: 'away' },
            { ...iv('2026-12-01T03:00:00Z', '2026-12-01T05:00:00Z'), kind: 'busy' },
            { ...iv('2026-12-01T05:00:00Z', '2026-12-01T06:00:00Z'), kind: 'tentative' },
        ]);
    });

    it('withoutOwnCopy cuts the moved event out of blocks that hold it, not out of blocks that only overlap it', () => {
        const own = iv('2026-12-01T05:00:00Z', '2026-12-01T06:00:00Z');
        const list = [
            { ...iv('2026-12-01T04:00:00Z', '2026-12-01T06:00:00Z'), kind: 'busy' as const }, // joined with the meeting before it
            { ...iv('2026-12-01T05:30:00Z', '2026-12-01T07:00:00Z'), kind: 'busy' as const }, // another meeting
        ];
        assert.deepEqual(withoutOwnCopy(list, own), [
            { ...iv('2026-12-01T04:00:00Z', '2026-12-01T05:00:00Z'), kind: 'busy' },
            { ...iv('2026-12-01T05:30:00Z', '2026-12-01T07:00:00Z'), kind: 'busy' },
        ]);
    });

    it('splitWindows cuts a range into ≤ 14-day windows', () => {
        const out = splitWindows(t('2026-12-01T00:00:00Z'), t('2026-12-31T00:00:00Z'), 14);
        assert.deepEqual(out, [iv('2026-12-01T00:00:00Z', '2026-12-15T00:00:00Z'), iv('2026-12-15T00:00:00Z', '2026-12-29T00:00:00Z'), iv('2026-12-29T00:00:00Z', '2026-12-31T00:00:00Z')]);
    });
});

describe('graphStatusKind', () => {
    it('lower-cases first; busy / tentative / oof count, the rest is dropped', () => {
        assert.equal(graphStatusKind('Busy'), 'busy');
        assert.equal(graphStatusKind('busy'), 'busy');
        assert.equal(graphStatusKind('Tentative'), 'tentative');
        assert.equal(graphStatusKind('OOF'), 'away');
        assert.equal(graphStatusKind('workingElsewhere'), null);
        assert.equal(graphStatusKind('free'), null);
        assert.equal(graphStatusKind('unknown'), null);
        assert.equal(graphStatusKind(undefined), null);
    });
});

describe('firstCommonFreeSlot', () => {
    const base = { durationMinutes: 60, workingHours: '09:00-19:00', tz: TZ, stepMinutes: 15, days: 7 };

    it('parses working hours', () => {
        assert.deepEqual(parseWorkingHours('09:00-19:00'), { startMinutes: 540, endMinutes: 1140 });
        assert.equal(parseWorkingHours('19:00-09:00'), null);
        assert.equal(parseWorkingHours('9-7'), null);
    });

    it('starts at opening time when the search begins before it', () => {
        // 1 Dec 2026 06:00 IST → first slot 09:00 IST = 03:30Z.
        const slot = firstCommonFreeSlot([], { ...base, from: new Date('2026-12-01T00:30:00Z'), to: new Date('2026-12-08T00:00:00Z') });
        assert.equal(slot?.start.toISOString(), '2026-12-01T03:30:00.000Z');
        assert.equal(slot?.end.toISOString(), '2026-12-01T04:30:00.000Z');
    });

    it('rounds up to the 15-minute grid and skips everyone’s busy blocks', () => {
        const asha = [iv('2026-12-01T03:30:00Z', '2026-12-01T05:00:00Z')]; // 09:00–10:30 IST
        const ravi = [iv('2026-12-01T05:10:00Z', '2026-12-01T05:40:00Z')]; // 10:40–11:10 IST
        const slot = firstCommonFreeSlot([asha, ravi], { ...base, from: new Date('2026-12-01T03:31:00Z'), to: new Date('2026-12-08T00:00:00Z') });
        // 10:30 + 60 overlaps Ravi; after 11:10 the grid gives 11:15 IST = 05:45Z.
        assert.equal(slot?.start.toISOString(), '2026-12-01T05:45:00.000Z');
    });

    it('moves to the next day when the rest of the day is too short, and never past `to`', () => {
        const late = new Date('2026-12-01T12:45:00Z'); // 18:15 IST
        assert.equal(firstCommonFreeSlot([], { ...base, from: late, to: new Date('2026-12-08T00:00:00Z') })?.start.toISOString(), '2026-12-02T03:30:00.000Z');
        assert.equal(firstCommonFreeSlot([], { ...base, from: late, to: new Date('2026-12-02T04:00:00Z') }), null);
    });

    it('answers null when every day is full', () => {
        const allWeek = [iv('2026-11-30T00:00:00Z', '2026-12-09T00:00:00Z')];
        assert.equal(firstCommonFreeSlot([allWeek], { ...base, from: new Date('2026-12-01T00:00:00Z'), to: new Date('2026-12-09T00:00:00Z') }), null);
    });
});
