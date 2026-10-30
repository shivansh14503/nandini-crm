import { z } from 'zod';

export const loginSchema = z.object({
    username: z.string().trim().min(1, 'Username is required').max(50, 'Username is too long'),
    // Bounded so oversized payloads can't be used to make bcrypt work harder.
    password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export function validateLoginInput(input: unknown): LoginInput {
    return loginSchema.parse(input);
}
