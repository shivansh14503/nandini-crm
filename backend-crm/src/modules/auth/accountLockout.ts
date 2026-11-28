import { StatusCodes } from 'http-status-codes';
import { HttpError } from '../../utils/httpError.js';

/**
 * Account lockout (docs/system-design.md › Account lockout). Sign-in is also limited per network address
 * (middlewares/rateLimiter.ts › loginRateLimit); this locks the account itself after too many wrong passwords in a row,
 * whichever addresses they came from, so one account can't be guessed slowly from many places.
 *
 * Pure (no database or Express), unit tested. auth.service.ts applies it on sign-in; a successful sign-in, a password
 * set from an emailed link and an admin's "Unlock account" (Admin › Users) clear it (`LOCKOUT_CLEARED`).
 */

export interface LockoutPolicy {
    /** Wrong passwords in a row that lock the account. */
    maxAttempts: number;
    /** A run of wrong passwords older than this starts again from 1 (minutes since the last wrong one). */
    windowMinutes: number;
    /** How long a lock lasts (minutes). */
    lockMinutes: number;
}

/**
 * The defaults: 5 wrong passwords within 15 minutes lock the account for 15 minutes. The one place these numbers live:
 * a later Admin › Password rules screen reads and saves them through `getLockoutPolicy`.
 */
export const DEFAULT_LOCKOUT_POLICY: Readonly<LockoutPolicy> = Object.freeze({ maxAttempts: 5, windowMinutes: 15, lockMinutes: 15 });

/** The policy in force. Async so a saved admin setting can replace the defaults without changing any caller. */
export async function getLockoutPolicy(): Promise<LockoutPolicy> {
    return { ...DEFAULT_LOCKOUT_POLICY };
}

/** The columns that hold the lockout state (Users). */
export interface LockoutState {
    failedLoginCount: number;
    lastFailedLoginAt: Date | null;
    lockedUntil: Date | null;
}

/** Data that clears the lockout state: spread into a `user.update`. */
export const LOCKOUT_CLEARED = Object.freeze({ failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null });

export const isLocked = (lockedUntil: Date | null | undefined, now: Date = new Date()): lockedUntil is Date =>
    lockedUntil instanceof Date && lockedUntil.getTime() > now.getTime();

/** Whole minutes left on a lock, at least 1. */
export const lockMinutesLeft = (lockedUntil: Date, now: Date = new Date()): number => Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));

/** Whether there is anything for "Unlock account" to clear. */
export const hasLockoutState = (state: Pick<LockoutState, 'failedLoginCount' | 'lockedUntil'>, now: Date = new Date()): boolean =>
    isLocked(state.lockedUntil, now) || state.failedLoginCount > 0;

export interface FailureOutcome {
    /** The columns to store. */
    next: LockoutState;
    /** This wrong password locked the account (audited once, as ACCOUNT_LOCKED). */
    locked: boolean;
    /** Wrong passwords counted in the run, including this one. */
    attempts: number;
}

/**
 * The state after one more wrong password. A run whose last wrong password is older than the window starts again.
 * Reaching `maxAttempts` locks the account for `lockMinutes` and starts the count again from 0, so after the lock ends
 * the user has the full number of tries.
 */
export function afterFailedLogin(state: LockoutState, policy: LockoutPolicy, now: Date = new Date()): FailureOutcome {
    const windowStart = now.getTime() - policy.windowMinutes * 60_000;
    const inRun = state.lastFailedLoginAt !== null && state.lastFailedLoginAt.getTime() > windowStart;
    const attempts = (inRun ? state.failedLoginCount : 0) + 1;
    if (attempts >= policy.maxAttempts) {
        return {
            next: { failedLoginCount: 0, lastFailedLoginAt: now, lockedUntil: new Date(now.getTime() + policy.lockMinutes * 60_000) },
            locked: true,
            attempts,
        };
    }
    return { next: { failedLoginCount: attempts, lastFailedLoginAt: now, lockedUntil: state.lockedUntil }, locked: false, attempts };
}

/** The sign-in answer while the account is locked. */
export function lockedMessage(lockedUntil: Date, now: Date = new Date()): string {
    const minutes = lockMinutesLeft(lockedUntil, now);
    return (
        `Too many wrong passwords. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}. ` +
        'Try again later, use “Forgot password?” to choose a new one, or ask your administrator to unlock it.'
    );
}

/** 423 ACCOUNT_LOCKED (the frontend shows the message as it is). */
export const accountLocked = (lockedUntil: Date, now: Date = new Date()) =>
    new HttpError(lockedMessage(lockedUntil, now), StatusCodes.LOCKED, { code: 'ACCOUNT_LOCKED' });
