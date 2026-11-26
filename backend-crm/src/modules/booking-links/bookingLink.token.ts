import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { ENV } from '../../config/env.js';
import { BOOKING_TOKEN_TTL_SECONDS } from './bookingLink.constants.js';

/**
 * Slot tokens of the public booking page. Every time the page shows comes with a token the server signed; a booking
 * must carry one, so a visitor (or a script) can only book a start the server offered for that link and that version
 * of it. The booking still re-checks everything (hours, notice, busy times, the day's cap) because a token only proves
 * the time was free when it was shown.
 *
 * Format `v1.<start, epoch seconds base36>.<minutes>.<expiry, epoch seconds base36>.<mac>`; mac = the first 22
 * base64url characters (128 bits) of HMAC-SHA256(key, `v1|<linkId>|<linkVersionMs>|<startSec>|<minutes>|<expSec>`).
 * The link id and version are in the MAC but not in the token (the server knows them from the slug), so an edit of
 * the link voids every token it handed out. Compared in constant time.
 *
 * Key: `BOOKING_SIGNING_KEY` when set (≥ 32 characters, env.ts), else HKDF-SHA256 of JWT_SECRET with its own salt and
 * purpose, so the session key itself never signs slots. Production refuses a missing or short JWT_SECRET, so no
 * development default can sign a production token.
 */

const VERSION = 'v1';
const MAC_LENGTH = 22;

let key: Buffer | null = null;

/** The signing key (derived once per process). */
function signingKey(): Buffer {
    if (key) return key;
    key = ENV.BOOKING.SIGNING_KEY
        ? createHash('sha256').update(ENV.BOOKING.SIGNING_KEY).digest()
        : Buffer.from(hkdfSync('sha256', ENV.JWT_SECRET, 'nandini-crm/booking/v1', 'booking-slot-token', 32));
    return key;
}

/** Tests: use this key instead (null = back to the configured one). */
export function setBookingSigningKeyForTests(value: Buffer | null): void {
    key = value;
}

export interface SlotClaim {
    /** The slot's start (whole seconds). */
    start: Date;
    durationMinutes: number;
}

export interface LinkVersion {
    id: string;
    /** `BookingLink.updatedAt`. */
    updatedAt: Date;
}

const mac = (link: LinkVersion, startSec: number, minutes: number, expSec: number): string =>
    createHmac('sha256', signingKey())
        .update(`${VERSION}|${link.id}|${link.updatedAt.getTime()}|${startSec}|${minutes}|${expSec}`)
        .digest('base64url')
        .slice(0, MAC_LENGTH);

/** A token for `claim` on this version of the link, good for BOOKING_TOKEN_TTL_SECONDS after `now`. */
export function signSlot(link: LinkVersion, claim: SlotClaim, now: Date = new Date()): string {
    const startSec = Math.floor(claim.start.getTime() / 1000);
    const expSec = Math.floor(now.getTime() / 1000) + BOOKING_TOKEN_TTL_SECONDS;
    return [VERSION, startSec.toString(36), String(claim.durationMinutes), expSec.toString(36), mac(link, startSec, claim.durationMinutes, expSec)].join('.');
}

export type SlotTokenProblem = 'malformed' | 'bad_signature' | 'expired';

/** The claim of a token this server signed for this link version, or why not. */
export function verifySlot(link: LinkVersion, token: string, now: Date = new Date()): { ok: true; claim: SlotClaim } | { ok: false; problem: SlotTokenProblem } {
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 5 || parts[0] !== VERSION) return { ok: false, problem: 'malformed' };
    const [, startText, minutesText, expText, given] = parts;
    if (!/^[0-9a-z]{1,10}$/.test(startText) || !/^\d{1,4}$/.test(minutesText) || !/^[0-9a-z]{1,10}$/.test(expText) || !/^[A-Za-z0-9_-]{22}$/.test(given)) {
        return { ok: false, problem: 'malformed' };
    }
    const startSec = parseInt(startText, 36);
    const minutes = Number(minutesText);
    const expSec = parseInt(expText, 36);
    const expected = Buffer.from(mac(link, startSec, minutes, expSec));
    const actual = Buffer.from(given);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, problem: 'bad_signature' };
    if (expSec * 1000 <= now.getTime()) return { ok: false, problem: 'expired' };
    return { ok: true, claim: { start: new Date(startSec * 1000), durationMinutes: minutes } };
}

/** sha256 hex of a token (`BookingLinkBooking.tokenHash`: a token books once). */
export const tokenHashOf = (token: string): string => createHash('sha256').update(token).digest('hex');
