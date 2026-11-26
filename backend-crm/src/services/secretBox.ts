import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encryption of integration secrets at rest (Admin › API Integrations client secrets now; calendar OAuth tokens from
 * Calendar Phase 2 P2-2). AES-256-GCM with a key ring, so the key can be rotated without losing what was sealed
 * with the old one:
 *
 *   INTEGRATIONS_ENCRYPTION_KEY = "k2:<base64 32 bytes>,k1:<base64 32 bytes>"   (first = active; a bare base64 key = k1)
 *
 * Sealed value: `enc:v1:<kid>:<b64url iv 12 B>:<b64url tag 16 B>:<b64url ciphertext>` (ASCII, fits NVARCHAR(MAX)).
 * Every value is bound to its row and column through the AAD (e.g. `IntegrationProvider:google:secrets`), so a value
 * copied into another row or column in the database no longer opens. Pure functions plus a `secretBox` singleton
 * that reads the ring from the environment; `npm run integrations:reencrypt` re-seals everything with the active key.
 */

export interface KeyRing {
    /** Kid new values are sealed with (the first entry of the env value). */
    activeKid: string;
    keys: Map<string, Buffer>;
}

export type SecretBoxErrorCode = 'KEY_MISSING' | 'TAMPERED' | 'FORMAT' | 'NOT_CONFIGURED';

/** Never carries the value or the key: safe to log. */
export class SecretBoxError extends Error {
    readonly code: SecretBoxErrorCode;

    constructor(code: SecretBoxErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'SecretBoxError';
    }
}

const PREFIX = 'enc';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KID_PATTERN = /^[a-z0-9]{1,8}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
/** HKDF salt: changing it changes every derived subkey (webhook tokens), so it is versioned. */
const HKDF_SALT = 'nandini-crm/v1';

const b64url = (buffer: Buffer) => buffer.toString('base64url');

function decodeKey(kid: string, value: string): Buffer {
    const trimmed = value.trim();
    if (!BASE64_PATTERN.test(trimmed)) throw new SecretBoxError('FORMAT', `Key "${kid}" is not base64.`);
    const key = Buffer.from(trimmed, 'base64');
    if (key.length !== KEY_BYTES) throw new SecretBoxError('FORMAT', `Key "${kid}" must be exactly ${KEY_BYTES} bytes (it is ${key.length}).`);
    return key;
}

/**
 * Reads the env value. Blank / undefined → null (integrations "not ready"; the app still starts). Anything malformed
 * throws a `SecretBoxError('FORMAT')` whose message names the problem but never the key (start-up fails on it).
 */
export function parseKeyRing(raw: string | undefined | null): KeyRing | null {
    const value = (raw ?? '').trim();
    if (!value) return null;
    // A bare base64 key (no "kid:" part) is kid k1. Base64 never contains ':' or ','.
    if (!value.includes(':') && !value.includes(',')) {
        return { activeKid: 'k1', keys: new Map([['k1', decodeKey('k1', value)]]) };
    }
    const keys = new Map<string, Buffer>();
    let activeKid = '';
    for (const part of value.split(',')) {
        const entry = part.trim();
        if (!entry) throw new SecretBoxError('FORMAT', 'The key list has an empty entry (two commas in a row, or a trailing comma).');
        const colon = entry.indexOf(':');
        if (colon <= 0) throw new SecretBoxError('FORMAT', 'Each key must be written as <kid>:<base64>, e.g. k1:AbC…=');
        const kid = entry.slice(0, colon).trim();
        if (!KID_PATTERN.test(kid)) throw new SecretBoxError('FORMAT', `Key id "${kid.slice(0, 12)}" must be 1-8 lowercase letters or digits.`);
        if (keys.has(kid)) throw new SecretBoxError('FORMAT', `Key id "${kid}" is listed twice.`);
        keys.set(kid, decodeKey(kid, entry.slice(colon + 1)));
        activeKid ||= kid;
    }
    return { activeKid, keys };
}

/** Seals `plain` with the ring's active key; a fresh random IV every time. */
export function seal(ring: KeyRing, plain: string, aad: string): string {
    const key = ring.keys.get(ring.activeKid);
    if (!key) throw new SecretBoxError('KEY_MISSING', `Active key "${ring.activeKid}" is not in the ring.`);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [PREFIX, VERSION, ring.activeKid, b64url(iv), b64url(cipher.getAuthTag()), b64url(ciphertext)].join(':');
}

interface SealedParts {
    kid: string;
    iv: Buffer;
    tag: Buffer;
    ciphertext: Buffer;
}

function parseSealed(sealed: string): SealedParts {
    const parts = typeof sealed === 'string' ? sealed.split(':') : [];
    if (parts.length !== 6 || parts[0] !== PREFIX || parts[1] !== VERSION || !KID_PATTERN.test(parts[2])) {
        throw new SecretBoxError('FORMAT', 'Not a sealed value.');
    }
    const [, , kid, iv, tag, ciphertext] = parts;
    const decoded = { kid, iv: Buffer.from(iv, 'base64url'), tag: Buffer.from(tag, 'base64url'), ciphertext: Buffer.from(ciphertext, 'base64url') };
    if (decoded.iv.length !== IV_BYTES || decoded.tag.length !== TAG_BYTES) throw new SecretBoxError('FORMAT', 'Not a sealed value.');
    return decoded;
}

/** Key id a sealed value was made with (rotation counts, the re-encrypt script). */
export function keyIdOf(sealed: string): string {
    return parseSealed(sealed).kid;
}

/** Opens a sealed value. Wrong AAD, a changed byte or another key with the same id → TAMPERED; unknown kid → KEY_MISSING. */
export function open(ring: KeyRing, sealed: string, aad: string): string {
    const { kid, iv, tag, ciphertext } = parseSealed(sealed);
    const key = ring.keys.get(kid);
    if (!key) throw new SecretBoxError('KEY_MISSING', `Sealed with key "${kid}", which is not in INTEGRATIONS_ENCRYPTION_KEY.`);
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
        decipher.setAAD(Buffer.from(aad, 'utf8'));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
        throw new SecretBoxError('TAMPERED', 'The sealed value does not open with its key (changed, moved to another row, or a different key with the same id).');
    }
}

/**
 * A purpose-bound 32-byte subkey: HKDF-SHA256(key, salt 'nandini-crm/v1', info purpose). Used for webhook HMACs
 * (Calendar Phase 2 P2-7), so no secret column is needed and every ring key can verify. `kid` defaults to the active key.
 */
export function subkey(ring: KeyRing, purpose: 'webhook', kid: string = ring.activeKid): Buffer {
    const key = ring.keys.get(kid);
    if (!key) throw new SecretBoxError('KEY_MISSING', `Key "${kid}" is not in the ring.`);
    return Buffer.from(hkdfSync('sha256', key, HKDF_SALT, purpose, KEY_BYTES));
}

/**
 * The process-wide box, on the ring parsed from `INTEGRATIONS_ENCRYPTION_KEY` (env.ts validates it at start-up).
 * Callers check `ready()` first; `seal` / `open` on a box without a ring throw `SecretBoxError('NOT_CONFIGURED')`.
 * `configureSecretBox` swaps the ring (tests, the re-encrypt script).
 */
let activeRing: KeyRing | null = null;

export function configureSecretBox(ring: KeyRing | null): void {
    activeRing = ring;
}

function requireRing(): KeyRing {
    if (!activeRing) throw new SecretBoxError('NOT_CONFIGURED', 'INTEGRATIONS_ENCRYPTION_KEY is not set.');
    return activeRing;
}

export const secretBox = {
    ready: (): boolean => activeRing !== null,
    activeKid: (): string | null => activeRing?.activeKid ?? null,
    /** Whether a kid is in the ring (rows sealed with a kid that isn't can't be opened). */
    hasKey: (kid: string | null | undefined): boolean => Boolean(kid && activeRing?.keys.has(kid)),
    seal: (plain: string, aad: string): string => seal(requireRing(), plain, aad),
    open: (sealed: string, aad: string): string => open(requireRing(), sealed, aad),
};
