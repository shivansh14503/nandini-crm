/**
 * Password rules for a new password (My Profile › Security › Change password, Admin › Users › set / reset password):
 * the live checklist under the field (components/common/PasswordRulesChecklist) and the check before submitting.
 * Pure and dependency-free.
 *
 * Mirrors backend-crm/src/modules/auth/passwordPolicy.ts, which the API enforces (400 WEAK_PASSWORD with the same
 * message); backend-crm/src/validators/contractSync.test.ts checks the two agree, so change both together.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** What a rule may compare the new password with. */
export interface PasswordPolicyContext {
    username: string;
    /** The password being replaced; when blank, "different from your current password" isn't checked. */
    currentPassword?: string;
}

export interface PasswordRule {
    key: string;
    /** Checklist line ("At least 8 characters"). */
    label: string;
    /** Error shown when the rule fails. */
    message: string;
    test(password: string, ctx: PasswordPolicyContext): boolean;
}

const sameText = (a: string, b: string) => a.toLowerCase() === b.trim().toLowerCase();

/** The rules a new password must pass, in the order they are shown and checked. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
    {
        key: 'minLength',
        label: `At least ${PASSWORD_MIN_LENGTH} characters`,
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
        test: (password) => password.length >= PASSWORD_MIN_LENGTH,
    },
    {
        key: 'letter',
        label: 'At least one letter',
        message: 'Password must contain at least one letter.',
        test: (password) => /\p{L}/u.test(password),
    },
    {
        key: 'digit',
        label: 'At least one number',
        message: 'Password must contain at least one number.',
        test: (password) => /[0-9]/.test(password),
    },
    {
        key: 'notUsername',
        label: 'Not your username',
        message: 'Password cannot be the same as your username.',
        test: (password, ctx) => password.length > 0 && !(ctx.username.trim() !== '' && sameText(password, ctx.username)),
    },
    {
        key: 'notCurrent',
        label: 'Different from your current password',
        message: 'New password must be different from your current password.',
        test: (password, ctx) => password.length > 0 && !(ctx.currentPassword && password === ctx.currentPassword),
    },
];

function firstIssue(rules: readonly PasswordRule[], password: string, ctx: PasswordPolicyContext): string | null {
    if (password.length > PASSWORD_MAX_LENGTH) return `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters.`;
    for (const rule of rules) {
        if (!rule.test(password, ctx)) return rule.message;
    }
    return null;
}

/** The first reason `newPassword` can't be used, or null when it passes every rule. */
export function passwordPolicyIssue(newPassword: string, ctx: PasswordPolicyContext): string | null {
    return firstIssue(PASSWORD_RULES, newPassword, ctx);
}

// ── Who sets the password (frontend only) ────────────────────────────────────────────────────────────────────────

/**
 * `self`: people changing their own password (My Profile), every rule. `link`: setting a password from an emailed
 * invite / reset link (/set-password): no "different from your current password" (nothing current is typed there; the
 * API still checks it for a reset link and answers on the field).
 */
export type PasswordAudience = 'self' | 'link';

/** The rules of the set-password page (no current password is typed there). */
export const LINK_PASSWORD_RULES: readonly PasswordRule[] = PASSWORD_RULES.filter((rule) => rule.key !== 'notCurrent');

/** The checklist rules for where the password is being set. */
export function passwordRulesFor(audience: PasswordAudience): readonly PasswordRule[] {
    return audience === 'link' ? LINK_PASSWORD_RULES : PASSWORD_RULES;
}

/** The first rule a password set from an emailed link breaks, or null. */
export function linkPasswordIssue(password: string, username: string): string | null {
    return firstIssue(LINK_PASSWORD_RULES, password, { username });
}

// ── Strength hint (frontend only; the API enforces just the rules above) ─────────────────────────────────────────

export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrength {
    level: PasswordStrengthLevel;
    /** 0 (empty) to 4 (strong), e.g. for a 4-segment meter. */
    score: 0 | 1 | 2 | 3 | 4;
    label: string;
}

const STRENGTH: Record<PasswordStrengthLevel, PasswordStrength> = {
    empty: { level: 'empty', score: 0, label: '' },
    weak: { level: 'weak', score: 1, label: 'Weak' },
    fair: { level: 'fair', score: 2, label: 'Fair' },
    good: { level: 'good', score: 3, label: 'Good' },
    strong: { level: 'strong', score: 4, label: 'Strong' },
};

/**
 * A rough hint of how hard the password is to guess: length plus the kinds of characters used (lowercase, uppercase,
 * digits, symbols). A password that breaks a rule is always Weak. Advisory only, never a reason to refuse a password.
 */
export function passwordStrength(password: string, ctx: PasswordPolicyContext): PasswordStrength {
    if (!password) return STRENGTH.empty;
    if (passwordPolicyIssue(password, ctx)) return STRENGTH.weak;
    const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
    const points = kinds + (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0);
    if (points >= 5) return STRENGTH.strong;
    if (points >= 4) return STRENGTH.good;
    if (points >= 3) return STRENGTH.fair;
    return STRENGTH.weak;
}
