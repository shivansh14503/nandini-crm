/**
 * Reading a Redis session row (`session:{userId}:{jti}` → JSON `{ ip?, userAgent?, createdAt }`) back into a record.
 * Pure (no Redis here) so it can be unit tested; session.service.ts does the SCAN / GET / PTTL.
 */

/** Redis key of one tracked session. */
export const sessionKey = (userId: number, jti: string) => `session:${userId}:${jti}`;

/** SCAN pattern matching every session of a user. */
export const sessionKeyPattern = (userId: number) => `session:${userId}:*`;

/** One tracked session as stored, with its expiry. */
export interface SessionRecord {
    /** The JWT id (last part of the key). */
    jti: string;
    ip: string | null;
    userAgent: string | null;
    /** ISO time of the sign-in, null when the row doesn't say. */
    createdAt: string | null;
    /** ISO time the session (and its JWT) expires, null when the key has no expiry. */
    expiresAt: string | null;
}

/** Longest User-Agent kept (matches AuditLog.userAgent); longer ones are cut. */
const MAX_USER_AGENT = 400;

const textOrNull = (value: unknown, max = 100): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

function isoOrNull(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * The record behind one session key, or null when the key is gone (expired or revoked between SCAN and GET:
 * `value` null or `ttlMs` -2). A value that isn't the expected JSON still counts as a session (it authenticates),
 * just with no details. `ttlMs` is the key's PTTL: -1 = no expiry.
 */
export function parseSessionRecord(key: string, value: string | null, ttlMs: number, now: Date = new Date()): SessionRecord | null {
    if (value === null || ttlMs === -2) return null;
    const jti = key.split(':').slice(2).join(':');
    if (!jti) return null;

    let stored: Record<string, unknown> = {};
    try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
    } catch {
        // Not JSON: keep the session, without details.
    }

    return {
        jti,
        ip: textOrNull(stored.ip, 64),
        userAgent: textOrNull(stored.userAgent, MAX_USER_AGENT),
        createdAt: isoOrNull(stored.createdAt),
        expiresAt: ttlMs > 0 ? new Date(now.getTime() + ttlMs).toISOString() : null,
    };
}
