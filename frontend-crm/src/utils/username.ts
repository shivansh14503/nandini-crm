/**
 * Sign-in username rules for a new user (Admin › Users › Add user). Pure and dependency-free.
 *
 * Mirrors backend-crm/src/modules/user-admin/username.ts, which the API enforces (400 VALIDATION_ERROR on `username`
 * with the same message); backend-crm/src/validators/contractSync.test.ts checks the two agree, so change both together.
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

/** One name part as a username piece: accents dropped, lower-cased, inner spaces and other characters removed ("Mary Ann" → "maryann", "D'Souza" → "dsouza"). */
function usernamePiece(part: string | null | undefined): string {
    return (part ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * The username Add user suggests from the names: `firstname.lastname` ("Rajesh", "Kumar" → "rajesh.kumar"), or just the
 * first name without a last name. Fits USERNAME_MAX_LENGTH and starts with a letter or digit; '' when the names give
 * nothing usable. The admin can still change it.
 */
export function suggestUsername(firstName: string | null | undefined, lastName: string | null | undefined): string {
    const joined = [usernamePiece(firstName), usernamePiece(lastName)].filter(Boolean).join('.');
    return joined.slice(0, USERNAME_MAX_LENGTH).replace(/[._-]+$/, '');
}

/**
 * `base` when nobody has it (`taken`: lower-cased usernames in use), else the first free `base2`, `base3`, …
 * (shortened to fit USERNAME_MAX_LENGTH).
 */
export function firstFreeUsername(base: string, taken: ReadonlySet<string>): string {
    if (!base || !taken.has(base)) return base;
    for (let n = 2; ; n++) {
        const suffix = String(n);
        const candidate = base.slice(0, USERNAME_MAX_LENGTH - suffix.length).replace(/[._-]+$/, '') + suffix;
        if (!taken.has(candidate)) return candidate;
    }
}
