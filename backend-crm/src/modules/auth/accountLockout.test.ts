import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../utils/httpError.js';
import {
    accountLocked,
    afterFailedLogin,
    DEFAULT_LOCKOUT_POLICY,
    getLockoutPolicy,
    hasLockoutState,
    isLocked,
    lockedMessage,
    lockMinutesLeft,
    type LockoutState,
} from './accountLockout.js';

const now = new Date('2026-11-28T10:00:00.000Z');
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
const fresh: LockoutState = { failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null };

describe('account lockout policy', () => {
    it('defaults to 5 wrong passwords within 15 minutes locking for 15 minutes', async () => {
        assert.deepEqual({ ...DEFAULT_LOCKOUT_POLICY }, { maxAttempts: 5, windowMinutes: 15, lockMinutes: 15 });
        assert.deepEqual(await getLockoutPolicy(), { maxAttempts: 5, windowMinutes: 15, lockMinutes: 15 });
    });

    it('counts wrong passwords and locks on the fifth, starting the count again', () => {
        let state = fresh;
        for (let i = 1; i <= 4; i++) {
            const outcome = afterFailedLogin(state, DEFAULT_LOCKOUT_POLICY, minutes(i));
            assert.equal(outcome.locked, false);
            assert.equal(outcome.next.failedLoginCount, i);
            state = outcome.next;
        }
        const fifth = afterFailedLogin(state, DEFAULT_LOCKOUT_POLICY, minutes(5));
        assert.equal(fifth.locked, true);
        assert.equal(fifth.attempts, 5);
        assert.equal(fifth.next.failedLoginCount, 0);
        assert.equal(fifth.next.lockedUntil?.toISOString(), minutes(20).toISOString());
    });

    it('starts a new run when the last wrong password is older than the window', () => {
        const state: LockoutState = { failedLoginCount: 4, lastFailedLoginAt: minutes(-16), lockedUntil: null };
        const outcome = afterFailedLogin(state, DEFAULT_LOCKOUT_POLICY, now);
        assert.equal(outcome.locked, false);
        assert.equal(outcome.next.failedLoginCount, 1);
        assert.equal(outcome.next.lastFailedLoginAt, now);
    });

    it('follows a different policy', () => {
        const outcome = afterFailedLogin(fresh, { maxAttempts: 1, windowMinutes: 5, lockMinutes: 60 }, now);
        assert.equal(outcome.locked, true);
        assert.equal(outcome.next.lockedUntil?.toISOString(), minutes(60).toISOString());
    });

    it('is locked only while lockedUntil is in the future', () => {
        assert.equal(isLocked(null, now), false);
        assert.equal(isLocked(minutes(-1), now), false);
        assert.equal(isLocked(now, now), false);
        assert.equal(isLocked(minutes(1), now), true);
    });

    it('says how many minutes are left, at least one', () => {
        assert.equal(lockMinutesLeft(minutes(14.2), now), 15);
        assert.equal(lockMinutesLeft(new Date(now.getTime() + 5000), now), 1);
        assert.match(lockedMessage(minutes(1), now), /locked for 1 more minute\. /);
        assert.match(lockedMessage(minutes(15), now), /locked for 15 more minutes\. .*Forgot password/);
    });

    it('answers 423 ACCOUNT_LOCKED', () => {
        const err = accountLocked(minutes(10), now);
        assert.ok(err instanceof HttpError);
        assert.equal(err.statusCode, 423);
        assert.equal(err.code, 'ACCOUNT_LOCKED');
    });

    it('has something to unlock while locked or while wrong passwords are counted', () => {
        assert.equal(hasLockoutState({ failedLoginCount: 0, lockedUntil: null }, now), false);
        assert.equal(hasLockoutState({ failedLoginCount: 0, lockedUntil: minutes(-1) }, now), false);
        assert.equal(hasLockoutState({ failedLoginCount: 2, lockedUntil: null }, now), true);
        assert.equal(hasLockoutState({ failedLoginCount: 0, lockedUntil: minutes(3) }, now), true);
    });
});
