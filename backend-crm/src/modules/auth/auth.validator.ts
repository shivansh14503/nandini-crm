import { z } from 'zod';

export const loginSchema = z.object({
    username: z.string().trim().min(1, 'Username is required').max(50, 'Username is too long'),
    // Bounded so oversized payloads can't be used to make bcrypt work harder.
    password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

export type LoginInput = z.infer<typeof loginSchema>;

const newPassword = z.string({ error: 'New password is required.' }).min(1, 'New password is required.').max(128, 'Password cannot exceed 128 characters.');

/** POST /api/auth/change-password. The new password's rules are checked by the service (passwordPolicy.ts). */
export const changePasswordSchema = z.object({
    currentPassword: z.string({ error: 'Current password is required.' }).min(1, 'Current password is required.').max(128, 'Password is too long'),
    newPassword,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * The token of an emailed set-password link. Only bounded here: a malformed one gets the same 400 INVALID_INVITE as an
 * unknown one (invite.service.ts), so the answer never says which part was wrong.
 */
const inviteToken = z.string({ error: 'The link is incomplete.' }).max(200, 'The link is incomplete.');

/** POST /api/auth/invite/verify. */
export const verifyInviteSchema = z.strictObject({ token: inviteToken });
export type VerifyInviteInput = z.infer<typeof verifyInviteSchema>;

/** POST /api/auth/invite/accept. The password rules are checked by the service (the same as everywhere else). */
export const acceptInviteSchema = z.strictObject({ token: inviteToken, newPassword });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/** POST /api/auth/forgot-password: a username or a work email (the service tells them apart by the `@`). */
export const forgotPasswordSchema = z.strictObject({
    identifier: z.string({ error: 'Enter your username or work email.' }).trim().min(1, 'Enter your username or work email.').max(120, 'That is too long.'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export function validateLoginInput(input: unknown): LoginInput {
    return loginSchema.parse(input);
}
