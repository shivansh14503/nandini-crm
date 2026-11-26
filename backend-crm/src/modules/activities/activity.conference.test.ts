import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseConferenceError } from '../calendar-sync/conference.rules.js';
import { conferenceColumnsFor, movesVideoToNewOwner, ownerVideoForChange } from './activity.conference.js';

/** The activity's video meeting columns on a save (Calendar Phase 3, P3-1): pure rules, owner changes in particular. */

const stored = { conferenceProvider: 'meet', conferenceState: 'ready', conferenceRequest: 1, assignedTo: 'palak' };
const input = (over: Record<string, unknown> = {}) => ({ followupType: 'Meeting', status: 'Planned', assignedTo: 'palak', ...over });

describe('conferenceColumnsFor', () => {
    it('a new choice asks for a link; none clears it; the same choice and owner change nothing', () => {
        assert.equal(conferenceColumnsFor(input({ videoMeeting: 'meet' }), null).conferenceState, 'requested');
        assert.deepEqual(conferenceColumnsFor(input({ videoMeeting: 'meet', status: 'Completed' }), null), {});
        assert.equal(conferenceColumnsFor(input({ videoMeeting: null }), stored).conferenceProvider, null);
        assert.deepEqual(conferenceColumnsFor(input(), stored), {});
    });

    it("an owner change asks the new owner's calendar only when it can make the link (else failed provider_unavailable)", () => {
        const moved = input({ assignedTo: 'ravi' });
        const requested = conferenceColumnsFor(moved, stored, 'meet');
        assert.equal(requested.conferenceState, 'requested');
        assert.equal(requested.conferenceRequest, 2);
        const failed = conferenceColumnsFor(moved, stored, null);
        assert.equal(failed.conferenceProvider, 'meet');
        assert.equal(failed.conferenceState, 'failed');
        assert.equal(parseConferenceError(failed.conferenceError)?.code, 'provider_unavailable');
        assert.equal(failed.conferenceRequest, undefined, 'no request that nothing would answer');
        assert.equal(conferenceColumnsFor(moved, stored, 'teams').conferenceState, 'failed');
    });

    it('an owner change of a logged activity keeps the stored outcome (no new event)', () => {
        assert.deepEqual(conferenceColumnsFor(input({ assignedTo: 'ravi', status: 'Completed' }), stored, null), {});
        assert.equal(movesVideoToNewOwner(input({ assignedTo: 'ravi', status: 'Completed' }), stored), false);
    });

    it('ownerVideoForChange reads the connection only when a meeting moves to a new owner of a Planned row', async () => {
        let reads = 0;
        const db = {
            calendarConnection: {
                findFirst: async () => {
                    reads += 1;
                    return { id: 'c2', provider: 'google' };
                },
            },
            integrationProvider: { findUnique: async () => ({ enabled: true }) },
            user: { findUnique: async () => ({ isActive: true }) },
        } as never;
        assert.equal(await ownerVideoForChange(db, input(), stored, null), null);
        assert.equal(await ownerVideoForChange(db, input({ assignedTo: 'ravi', videoMeeting: null }), stored, null), null);
        assert.equal(reads, 0);
        assert.equal(await ownerVideoForChange(db, input({ assignedTo: 'ravi' }), stored, null), 'meet');
        assert.equal(reads, 1);
    });
});
