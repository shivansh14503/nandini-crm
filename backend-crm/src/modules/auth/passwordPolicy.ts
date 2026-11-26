/**
 * Password rules for a new password (My Profile › Security › Change password). Pure and dependency-free.
 *
 * Mirrors frontend-crm/src/utils/passwordPolicy.ts (the form's live checklist); the two are checked against each other
 * by src/validators/contractSync.test.ts, so change both together.
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

/** The first reason `newPassword` can't be used, or null when it passes every rule. */
export function passwordPolicyIssue(newPassword: string, ctx: PasswordPolicyContext): string | null {
    if (newPassword.length > PASSWORD_MAX_LENGTH) return `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters.`;
    for (const rule of PASSWORD_RULES) {
        if (!rule.test(newPassword, ctx)) return rule.message;
    }
    return null;
}
