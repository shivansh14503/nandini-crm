/**
 * Sign-in username rules for a new user (Admin › Users › Add user). Pure and dependency-free.
 *
 * Mirrors frontend-crm/src/utils/username.ts (the Add user form's live check); src/validators/contractSync.test.ts
 * checks the two agree, so change both together. The API answers a failure with 400 VALIDATION_ERROR on `username`.
 * A username is set once, at creation, and never changes: records store it as their owner.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;
/** Lower-case letters, digits, dots, hyphens and underscores, starting with a letter or digit (checked after normalizing). */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
/**
 * Names the CRM itself writes as the actor of background jobs, seeds and system changes (audit `changedBy`, record
 * owners). A user with one of them would pass as the system in the audit log, so they can't be taken.
 */
export const RESERVED_USERNAMES: readonly string[] = ['system'];

/** The stored form: trimmed and lower-cased. */
export function normalizeUsername(value: string): string {
    return value.trim().toLowerCase();
}

/** Why `value` (as typed; it is normalized first) can't be used as a username, or null when it can. */
export function usernameIssue(value: string): string | null {
    const username = normalizeUsername(value);
    if (username === '') return 'Username is required.';
    if (username.length < USERNAME_MIN_LENGTH) return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
    if (username.length > USERNAME_MAX_LENGTH) return `Username cannot exceed ${USERNAME_MAX_LENGTH} characters.`;
    if (!USERNAME_PATTERN.test(username)) {
        return 'Use only letters, numbers, dots, hyphens and underscores, starting with a letter or number.';
    }
    if (RESERVED_USERNAMES.includes(username)) return `"${username}" is reserved by the CRM. Choose another username.`;
    return null;
}
