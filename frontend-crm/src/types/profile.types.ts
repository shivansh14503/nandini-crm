/** My Profile (`/api/me/*`): the signed-in user's own profile, photo and sessions. */

export interface ProfileDto {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    email: string | null;
    role: string;
    department: string | null;
    /** Mobile number in E.164 (the user's `phone` column). */
    mobile: string | null;
    officePhone: string | null;
    /** Relative URL (`/api/user-photos/<id>`), or null. */
    photoUrl: string | null;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
    createdAt: string | null;
}

/** PATCH /api/me/profile: only these four fields are editable by the user; '' clears the optional ones. */
export interface ProfileUpdate {
    firstName?: string;
    lastName?: string;
    mobile?: string;
    officePhone?: string;
}

export interface SessionDto {
    /** The session's JWT id. */
    id: string;
    /** The session this request came from. */
    current: boolean;
    ip: string | null;
    userAgent: string | null;
    /** e.g. "Chrome on Windows". */
    device: string;
    createdAt: string | null;
    expiresAt: string | null;
}

export interface SessionsResponse {
    /** False when the session list can't be read (Redis down, or this session was issued untracked). */
    tracked: boolean;
    sessions: SessionDto[];
}

export interface PhotoResponse {
    photoUrl: string | null;
}

export const PROFILE_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ProfilePhotoType = (typeof PROFILE_PHOTO_TYPES)[number];
/** Largest photo the API stores (decoded bytes). */
export const PROFILE_PHOTO_MAX_BYTES = 512 * 1024;
/** Largest picture the crop dialog accepts as input (it is resized before upload). */
export const PROFILE_PHOTO_INPUT_MAX_BYTES = 10 * 1024 * 1024;
