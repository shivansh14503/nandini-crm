import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isStaleMorningJob, morningCatchUpJobId } from './mail.worker.js';

const IST = 'Asia/Kolkata';
// Wednesday 25 Nov 2026, 09:05 IST.
const now = new Date('2026-11-25T03:35:00.000Z');

describe('morning summary catch-up job', () => {
    it('has one job id per business day (every process adds it once), valid as a BullMQ custom id', () => {
        assert.equal(morningCatchUpJobId('2026-11-25'), 'morning-catchup-2026-11-25');
        assert.notEqual(morningCatchUpJobId('2026-11-25'), morningCatchUpJobId('2026-11-26'));
        // BullMQ refuses custom ids with ':' and ids that are integers.
        assert.equal(morningCatchUpJobId('2026-11-25').includes(':'), false);
    });

    it('runs on its own day and is skipped once the business day has moved on', () => {
        assert.equal(isStaleMorningJob({ day: '2026-11-25' }, now, IST), false);
        assert.equal(isStaleMorningJob({ day: '2026-11-24' }, now, IST), true);
        // 00:10 IST on the 26th: still waiting after midnight.
        assert.equal(isStaleMorningJob({ day: '2026-11-25' }, new Date('2026-11-25T18:40:00.000Z'), IST), true);
    });

    it('never skips the scheduler’s own jobs (they carry no day)', () => {
        assert.equal(isStaleMorningJob({}, now, IST), false);
        assert.equal(isStaleMorningJob(undefined, now, IST), false);
    });
});
