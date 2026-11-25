import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, daysBetween, fakeUtcToInstant, instantToZonedWallClock, zonedDayOf, zonedStartOfDay, zonedWallClockToInstant } from './zonedTime.js';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

describe('zonedTime: India (no DST)', () => {
    it('converts wall clocks to instants and back', () => {
        assert.equal(zonedWallClockToInstant('2026-11-25T10:30', IST).toISOString(), '2026-11-25T05:00:00.000Z');
        assert.equal(instantToZonedWallClock(new Date('2026-11-25T05:00:00.000Z'), IST), '2026-11-25T10:30');
        // Across midnight UTC.
        assert.equal(zonedWallClockToInstant('2026-11-25T02:00', IST).toISOString(), '2026-11-24T20:30:00.000Z');
    });

    it('round-trips every quarter hour of a day', () => {
        for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
            const wall = `2026-11-25T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
            assert.equal(instantToZonedWallClock(zonedWallClockToInstant(wall, IST), IST), wall);
        }
    });

    it('finds the start and the day of an instant', () => {
        assert.equal(zonedStartOfDay('2026-11-25', IST).toISOString(), '2026-11-24T18:30:00.000Z');
        assert.equal(zonedDayOf(new Date('2026-11-24T18:30:00.000Z'), IST), '2026-11-25');
        assert.equal(zonedDayOf(new Date('2026-11-24T18:29:59.999Z'), IST), '2026-11-24');
    });

    it('refuses wall clocks that are not real', () => {
        assert.throws(() => zonedWallClockToInstant('2026-02-30T10:00', IST), RangeError);
        assert.throws(() => zonedWallClockToInstant('2026-11-25T24:00', IST), RangeError);
        assert.throws(() => zonedWallClockToInstant('2026-11-25 10:00', IST), RangeError);
    });
});

describe('zonedTime: DST (America/New_York)', () => {
    it('resolves a wall clock in the spring-forward gap forward', () => {
        // 2026-03-08 02:30 does not exist in New York (02:00 → 03:00); it resolves to 03:30 EDT.
        const instant = zonedWallClockToInstant('2026-03-08T02:30', NY);
        assert.equal(instant.toISOString(), '2026-03-08T07:30:00.000Z');
        assert.equal(instantToZonedWallClock(instant, NY), '2026-03-08T03:30');
    });

    it('takes the earlier instant of a fall-back overlap', () => {
        // 2026-11-01 01:30 happens twice (EDT, then EST); the first one is 05:30Z.
        assert.equal(zonedWallClockToInstant('2026-11-01T01:30', NY).toISOString(), '2026-11-01T05:30:00.000Z');
    });

    it('starts days at local midnight on both sides of a change', () => {
        assert.equal(zonedStartOfDay('2026-03-08', NY).toISOString(), '2026-03-08T05:00:00.000Z');
        assert.equal(zonedStartOfDay('2026-03-09', NY).toISOString(), '2026-03-09T04:00:00.000Z');
    });
});

describe('zonedTime: calendar days', () => {
    it('adds days across months and years', () => {
        assert.equal(addDays('2026-11-25', 1), '2026-11-26');
        assert.equal(addDays('2026-11-30', 1), '2026-12-01');
        assert.equal(addDays('2026-12-31', 1), '2027-01-01');
        assert.equal(addDays('2026-03-01', -1), '2026-02-28');
        assert.throws(() => addDays('25-11-2026', 1), RangeError);
    });

    it('counts days between two days', () => {
        assert.equal(daysBetween('2026-11-25', '2026-11-26'), 1);
        assert.equal(daysBetween('2026-11-25', '2026-11-25'), 0);
        assert.equal(daysBetween('2026-11-26', '2026-11-25'), -1);
        assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);
    });
});

describe('fakeUtcToInstant', () => {
    it('reads a wall clock stored as UTC as the instant it means in the zone', () => {
        // Contract.renewalReminderDate "2026-12-01 09:00" (stored as 09:00Z) is 03:30Z in India.
        assert.equal(fakeUtcToInstant(new Date('2026-12-01T09:00:00.000Z'), IST).toISOString(), '2026-12-01T03:30:00.000Z');
    });
});
