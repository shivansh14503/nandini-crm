import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ENV } from '../../config/env.js';
import { freshPullJobId, pendingOnlyPullJobId, pullJobId } from './sync.keys.js';
import { enqueuePull, setPullJobQueueForTests, UNREADABLE_JOB_STATE, type PullJobData, type PullJobQueue } from './sync.wake.js';

/**
 * P2-5's `enqueuePull` job ids with P2-7's pending-only rule: on-demand pulls (Sync now, page open, admin) are absorbed
 * only by a bucket job that hasn't started; a started, finished or failed one gets a fresh id (BullMQ would silently
 * ignore the same id for the hour it keeps a finished job). An unreadable state (Redis didn't answer) returns null at
 * once, so the caller pulls in-process without a second timeout. The poll fan-out keeps the bucket id.
 */

interface FakeQueue extends PullJobQueue {
    states: Map<string, string>;
    added: { jobId: string; data: PullJobData }[];
    stateReads: string[];
    /** Make `add` answer null (Redis didn't take it). */
    refuse: boolean;
}

function fakeQueue(): FakeQueue {
    const q: FakeQueue = {
        states: new Map(),
        added: [],
        stateReads: [],
        refuse: false,
        async stateOf(jobId) {
            q.stateReads.push(jobId);
            return q.states.get(jobId) ?? null;
        },
        async add(jobId, data) {
            if (q.refuse) return null;
            // BullMQ: an id it still keeps is ignored (the existing job is returned).
            if (!q.states.has(jobId)) {
                q.added.push({ jobId, data });
                q.states.set(jobId, 'waiting');
            }
            return jobId;
        },
    };
    return q;
}

const integrations = ENV.INTEGRATIONS as { SYNC_ENABLED: boolean };
const T0 = new Date('2026-11-27T05:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
let q: FakeQueue;
let wasEnabled: boolean;

beforeEach(() => {
    wasEnabled = integrations.SYNC_ENABLED;
    integrations.SYNC_ENABLED = true;
    q = fakeQueue();
    setPullJobQueueForTests(q);
});

afterEach(() => {
    integrations.SYNC_ENABLED = wasEnabled;
    setPullJobQueueForTests(null);
});

describe('pull job ids: the pending-only rule (pure)', () => {
    it('only a pending job absorbs; none kept → the bucket id; anything else → the fresh id', () => {
        for (const pending of ['waiting', 'delayed', 'prioritized', 'waiting-children']) assert.equal(pendingOnlyPullJobId(pending, 'b', 'f'), null, pending);
        assert.equal(pendingOnlyPullJobId(null, 'b', 'f'), 'b');
        for (const done of ['active', 'completed', 'failed', 'unknown']) assert.equal(pendingOnlyPullJobId(done, 'b', 'f'), 'f', done);
    });

    it('a fresh id extends the bucket id with the request time (hyphens only)', () => {
        assert.equal(freshPullJobId('c1', at(1_234)), `${pullJobId('c1', at(1_234))}-${at(1_234).getTime()}`);
        assert.ok(!freshPullJobId('c1', T0).includes(':'));
        assert.notEqual(freshPullJobId('c1', at(1_000)), freshPullJobId('c1', at(2_000)));
    });
});

describe('enqueuePull', () => {
    it('Sync now after a pull of the same 10 s bucket finished gets its own job (not silently absorbed)', async () => {
        assert.equal(await enqueuePull('c1', 'manual', T0), pullJobId('c1', T0));
        // The first pull ran and completed; a second Sync now (e.g. an admin's) 4 s later, same bucket.
        q.states.set(pullJobId('c1', T0), 'completed');
        const id = await enqueuePull('c1', 'admin', at(4_000));
        assert.equal(id, freshPullJobId('c1', at(4_000)));
        assert.deepEqual(
            q.added.map((a) => a.jobId),
            [pullJobId('c1', T0), freshPullJobId('c1', at(4_000))],
        );
        assert.deepEqual(q.added[1].data, { connectionId: 'c1', reason: 'admin' });
    });

    it('a page-open pull while the bucket job still waits is absorbed by it; a running or failed one is not', async () => {
        q.states.set(pullJobId('c1', T0), 'delayed');
        assert.equal(await enqueuePull('c1', 'page', at(1_000)), pullJobId('c1', T0));
        assert.equal(q.added.length, 0, 'the pending job reads the calendar after this request');

        q.states.set(pullJobId('c1', T0), 'active');
        assert.equal(await enqueuePull('c1', 'page', at(2_000)), freshPullJobId('c1', at(2_000)));
        q.states.set(pullJobId('c1', T0), 'failed');
        assert.equal(await enqueuePull('c1', 'manual', at(3_000)), freshPullJobId('c1', at(3_000)));
        assert.equal(q.added.length, 2);
    });

    it('an unreadable state (Redis timed out) returns null without trying the add, so the caller pulls in-process', async () => {
        q.states.set(pullJobId('c1', T0), UNREADABLE_JOB_STATE);
        for (const reason of ['manual', 'page', 'admin'] as const) assert.equal(await enqueuePull('c1', reason, at(5_000)), null, reason);
        assert.equal(q.added.length, 0, 'no add after the state read timed out');
        assert.equal(q.stateReads.length, 3);
    });

    it('the poll fan-out (and re-baseline / missed) keep the bucket id without a state read', async () => {
        q.states.set(pullJobId('c1', T0), 'completed');
        assert.equal(await enqueuePull('c1', 'poll', at(1_000)), pullJobId('c1', T0));
        await enqueuePull('c1', 'rebaseline', at(2_000));
        await enqueuePull('c1', 'missed', at(3_000));
        assert.deepEqual(q.stateReads, []);
        assert.equal(q.added.length, 0, 'absorbed by the kept id, as before');
    });

    it('pendingOnly (P2-8: the full pull after meeting import is switched on): a started bucket job never absorbs it', async () => {
        q.states.set(pullJobId('c1', T0), 'active');
        assert.equal(await enqueuePull('c1', 'rebaseline', at(1_000), { pendingOnly: true }), freshPullJobId('c1', at(1_000)));
        assert.deepEqual(q.added, [{ jobId: freshPullJobId('c1', at(1_000)), data: { connectionId: 'c1', reason: 'rebaseline' } }]);
        // A pull of the bucket that hasn't started yet reads the dropped cursor (a full pull) after this request.
        q.states.set(pullJobId('c2', T0), 'waiting');
        assert.equal(await enqueuePull('c2', 'rebaseline', at(2_000), { pendingOnly: true }), pullJobId('c2', T0));
        assert.equal(q.added.length, 1);
    });

    it('null when Redis does not take it (callers pull in-process) or sync is off', async () => {
        q.refuse = true;
        assert.equal(await enqueuePull('c1', 'manual', T0), null);
        q.refuse = false;
        integrations.SYNC_ENABLED = false;
        assert.equal(await enqueuePull('c1', 'manual', T0), null);
        assert.deepEqual(q.stateReads, [pullJobId('c1', T0)]);
    });
});
