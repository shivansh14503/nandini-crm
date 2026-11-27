import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * One-time set-password links (the invite a new user gets, an admin's "Resend invite" / "Send password reset link").
 * Pure (no database or Express), unit tested. The token is 32 random bytes (256 bits) as base64url; only its SHA-256
 * is stored (UserInvite.tokenHash), so a database read never yields a working link. A row is looked up by that hash and
 * then compared in constant time.
 */

/** How long a link works after it is sent. */
export const INVITE_TTL_HOURS = 72;
export const INVITE_TTL_MS = INVITE_TTL_HOURS * 60 * 60 * 1000;

export const INVITE_PURPOSES = ['invite', 'reset'] as const;
export type InvitePurpose = (typeof INVITE_PURPOSES)[number];

const TOKEN_BYTES = 32;
/** base64url of 32 bytes, unpadded. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A new random token (43 base64url characters). Never logged, audited or stored. */
export function generateInviteToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Hex SHA-256 of a token: what UserInvite.tokenHash holds. */
export function hashInviteToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Whether a well-formed token's hash equals a stored one, in constant time. */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
    const a = Buffer.from(hashInviteToken(token), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** Whether a string can be a token at all (checked before any database read). */
export const isWellFormedToken = (token: unknown): token is string => typeof token === 'string' && TOKEN_PATTERN.test(token);

export interface InviteState {
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
}

/** A link still works: not used, not revoked, not expired. */
export const isInviteUsable = (row: InviteState, now: Date = new Date()): boolean =>
    row.usedAt === null && row.revokedAt === null && row.expiresAt.getTime() > now.getTime();

/** `<APP_PUBLIC_URL>/set-password?token=…` (the frontend page that sets the password). */
export function setPasswordUrl(appUrl: string, token: string): string {
    return `${appUrl.replace(/\/+$/, '')}/set-password?token=${encodeURIComponent(token)}`;
}
