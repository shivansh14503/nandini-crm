import { z } from 'zod';

export const loginSchema = z.object({
    username: z.string().trim().min(1, 'Username is required').max(50, 'Username is too long'),
    // Bounded so oversized payloads can't be used to make bcrypt work harder.
    password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * POST /api/auth/change-password. The new password's rules are checked by the service (passwordPolicy.ts).
 * `currentPassword` may be left out only on the first-login / forced change (see authService.changePassword).
 */
export const changePasswordSchema = z.object({
    currentPassword: z.string().max(128, 'Password is too long').optional(),
    newPassword: z.string({ error: 'New password is required.' }).min(1, 'New password is required.').max(128, 'Password cannot exceed 128 characters.'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export function validateLoginInput(input: unknown): LoginInput {
    return loginSchema.parse(input);
}
