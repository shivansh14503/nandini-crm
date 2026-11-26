import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { graphAllDayDay, graphInstant, graphUtcDateTime, graphWallClock, ianaFromWindows, windowsZone } from './sync.timezones.js';

/** IANA ⇄ Windows zones and Graph date-times (spec §8.14). */

describe('sync.timezones', () => {
    it('windowsZone: the business zone and common ones; unknown → UTC', () => {
        assert.equal(windowsZone('Asia/Kolkata'), 'India Standard Time');
        assert.equal(windowsZone('Asia/Calcutta'), 'India Standard Time');
        assert.equal(windowsZone('Europe/London'), 'GMT Standard Time');
        assert.equal(windowsZone('Mars/Olympus'), 'UTC');
    });

    it('ianaFromWindows: Windows names back (first IANA name wins), UTC spellings, IANA names pass, unknown → UTC', () => {
        assert.equal(ianaFromWindows('India Standard Time'), 'Asia/Kolkata');
        assert.equal(ianaFromWindows('india standard time'), 'Asia/Kolkata');
        assert.equal(ianaFromWindows('UTC'), 'UTC');
        assert.equal(ianaFromWindows('Coordinated Universal Time'), 'UTC');
        assert.equal(ianaFromWindows('tzone://Microsoft/Utc'), 'UTC');
        assert.equal(ianaFromWindows('Europe/Paris'), 'Europe/Paris');
        assert.equal(ianaFromWindows('Narnia Standard Time'), 'UTC');
        assert.equal(ianaFromWindows(null), 'UTC');
    });

    it('graphWallClock / graphInstant: 7-digit fractions dropped; the zone decides the instant', () => {
        assert.equal(graphWallClock('2026-11-27T10:00:00.0000000'), '2026-11-27T10:00');
        assert.throws(() => graphWallClock('27/11/2026'), RangeError);
        assert.equal(graphInstant({ dateTime: '2026-11-27T10:00:00.0000000', timeZone: 'India Standard Time' }).toISOString(), '2026-11-27T04:30:00.000Z');
        assert.equal(graphInstant({ dateTime: '2026-11-27T04:30:00.0000000', timeZone: 'UTC' }).toISOString(), '2026-11-27T04:30:00.000Z');
    });

    it('graphUtcDateTime: the UTC wall clock with timeZone UTC (what timed pushes send)', () => {
        assert.deepEqual(graphUtcDateTime(new Date('2026-11-27T04:30:00.000Z')), { dateTime: '2026-11-27T04:30:00', timeZone: 'UTC' });
    });

    it('graphAllDayDay: a midnight → its date; a converted midnight → the day in the original zone; else the nearest midnight', () => {
        assert.equal(graphAllDayDay({ dateTime: '2026-11-27T00:00:00.0000000', timeZone: 'India Standard Time' }), '2026-11-27');
        // IST midnight of the 27th, returned in UTC: 26th 18:30 UTC.
        assert.equal(graphAllDayDay({ dateTime: '2026-11-26T18:30:00.0000000', timeZone: 'UTC' }, 'India Standard Time'), '2026-11-27');
        // No usable original zone: rounded to the nearest midnight.
        assert.equal(graphAllDayDay({ dateTime: '2026-11-26T18:30:00.0000000', timeZone: 'UTC' }), '2026-11-27');
        assert.equal(graphAllDayDay({ dateTime: '2026-11-27T05:30:00.0000000', timeZone: 'UTC' }), '2026-11-27');
    });
});
