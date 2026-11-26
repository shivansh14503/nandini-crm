import { z } from 'zod';
import type { TokenSet } from './types.js';

/**
 * The OAuth 2.0 token endpoint answer shared by Google and Microsoft (authorization_code and refresh_token grants).
 * Unknown fields (`ext_expires_in`, `token_type`) are ignored. Pure.
 */
export const tokenResponseSchema = z.object({
    access_token: z.string().min(1),
    /** Seconds. Both providers send it; a missing value is read as one hour. */
    expires_in: z.coerce.number().positive().optional(),
    refresh_token: z.string().min(1).optional(),
    /** Google time-limited grants only (the user chose time-based access on the consent screen). */
    refresh_token_expires_in: z.coerce.number().positive().optional(),
    /** Space-separated granted scopes; optional for Microsoft (missing = the requested set). */
    scope: z.string().optional(),
    id_token: z.string().min(1).optional(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export function toTokenSet(json: TokenResponse, now: Date): TokenSet {
    const expiresIn = json.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS;
    return {
        accessToken: json.access_token,
        expiresAt: new Date(now.getTime() + expiresIn * 1000),
        ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}),
        ...(json.refresh_token_expires_in ? { refreshTokenExpiresAt: new Date(now.getTime() + json.refresh_token_expires_in * 1000) } : {}),
        scope: json.scope ?? null,
        ...(json.id_token ? { idToken: json.id_token } : {}),
    };
}
