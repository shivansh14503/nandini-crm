import type { SessionRecord } from '../auth/sessionRecord.js';
import { describeUserAgent } from './userAgent.js';

/**
 * What /api/me (My Profile) and /api/auth/me return about the signed-in user. No database access here, so pure code
 * and tests can use it. Mirrors frontend-crm/src/types/profile.types.ts and auth.types.ts.
 */

/** API path of a profile photo, or null when the user has none. */
export const photoUrlOf = (photoId: string | null | undefined): string | null => (photoId ? `/api/user-photos/${encodeURIComponent(photoId)}` : null);

/** `trim(firstName + ' ' + lastName)`: the `fullName` column every other screen reads. */
export const joinFullName = (firstName: string | null | undefined, lastName: string | null | undefined): string =>
    [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ');

/**
 * Splits a display name the way the user_profile migration backfilled existing users: the text before the first
 * space is the first name, the rest (trimmed) the last name. Blank → both null.
 */
export function splitFullName(fullName: string | null | undefined): { firstName: string | null; lastName: string | null } {
    const name = (fullName ?? '').trim();
    if (!name) return { firstName: null, lastName: null };
    const space = name.indexOf(' ');
    if (space < 0) return { firstName: name, lastName: null };
    return { firstName: name.slice(0, space), lastName: name.slice(space + 1).trim() || null };
}

/**
 * The first / last name to show and edit. Users are still created and renamed outside the app, which sets only
 * `fullName`: when the stored parts are missing or no longer add up to `fullName`, they are split from `fullName`
 * (the same way the migration backfilled them), so `fullName` stays the source of truth.
 */
export function resolveNameParts(row: { firstName: string | null; lastName: string | null; fullName: string | null }): {
    firstName: string | null;
    lastName: string | null;
} {
    const fullName = (row.fullName ?? '').trim();
    const inSync = Boolean(row.firstName?.trim()) && joinFullName(row.firstName, row.lastName) === fullName;
    if (inSync || !fullName) return { firstName: row.firstName, lastName: row.lastName };
    return splitFullName(fullName);
}

const isoOrNull = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

/** Columns a profile reads (never the password hash or the photo bytes). */
export const PROFILE_SELECT = {
    id: true,
    username: true,
    firstName: true,
    lastName: true,
    fullName: true,
    email: true,
    role: true,
    department: true,
    phone: true,
    officePhone: true,
    lastLoginAt: true,
    passwordChangedAt: true,
    createdAt: true,
    photo: { select: { id: true } },
} as const;

export interface ProfileRow {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    email: string | null;
    role: string;
    department: string | null;
    phone: string | null;
    officePhone: string | null;
    lastLoginAt: Date | null;
    passwordChangedAt: Date | null;
    createdAt: Date;
    photo: { id: string } | null;
}

export interface ProfileDto {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    email: string | null;
    role: string;
    department: string | null;
    /** The `phone` column. */
    mobile: string | null;
    officePhone: string | null;
    photoUrl: string | null;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
    createdAt: string;
}

export function toProfileDto(row: ProfileRow): ProfileDto {
    return {
        id: row.id,
        username: row.username,
        ...resolveNameParts(row),
        fullName: row.fullName,
        email: row.email,
        role: row.role,
        department: row.department,
        mobile: row.phone,
        officePhone: row.officePhone,
        photoUrl: photoUrlOf(row.photo?.id),
        lastLoginAt: isoOrNull(row.lastLoginAt),
        passwordChangedAt: isoOrNull(row.passwordChangedAt),
        createdAt: row.createdAt.toISOString(),
    };
}

/** The fields a profile edit can change, as compared for the audit diff (`mobile` = the `phone` column). */
export const profileAuditSnapshot = (row: Pick<ProfileRow, 'firstName' | 'lastName' | 'fullName' | 'phone' | 'officePhone'>) => ({
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    mobile: row.phone,
    officePhone: row.officePhone,
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

/** Columns `/api/auth/me` reads. */
export const AUTH_ME_SELECT = {
    id: true,
    username: true,
    role: true,
    fullName: true,
    firstName: true,
    lastName: true,
    photo: { select: { id: true } },
} as const;

/** The signed-in user for the navbar (`User` in frontend-crm/src/types/auth.types.ts). */
export interface AuthMeDto {
    id: number;
    username: string;
    role: string;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
}

export const toAuthMeDto = (row: Omit<AuthMeDto, 'photoUrl'> & { photo: { id: string } | null }): AuthMeDto => ({
    id: row.id,
    username: row.username,
    role: row.role,
    fullName: row.fullName,
    ...resolveNameParts(row),
    photoUrl: photoUrlOf(row.photo?.id),
});

// ── Sessions ─────────────────────────────────────────────────────────────────

export interface SessionDto {
    /** The session's JWT id (what DELETE /api/me/sessions/:id takes). */
    id: string;
    /** The session making this request. */
    current: boolean;
    ip: string | null;
    userAgent: string | null;
    /** "Chrome on Windows". */
    device: string;
    createdAt: string | null;
    expiresAt: string | null;
}

export interface SessionsResponse {
    /** False when the request's own session isn't tracked in Redis or Redis is down (then the list may be incomplete or empty). */
    tracked: boolean;
    sessions: SessionDto[];
}

/** Sessions for the list: the current one first, then newest sign-in first (unknown sign-in times last). */
export function toSessionDtos(records: readonly SessionRecord[], currentJti: string | undefined): SessionDto[] {
    return records
        .map(
            (record): SessionDto => ({
                id: record.jti,
                current: record.jti === currentJti,
                ip: record.ip,
                userAgent: record.userAgent,
                device: describeUserAgent(record.userAgent),
                createdAt: record.createdAt,
                expiresAt: record.expiresAt,
            }),
        )
        .sort((a, b) => {
            if (a.current !== b.current) return a.current ? -1 : 1;
            if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id);
            if (!a.createdAt) return 1;
            if (!b.createdAt) return -1;
            return b.createdAt.localeCompare(a.createdAt);
        });
}
