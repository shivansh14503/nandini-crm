export interface User {
    id: number;
    username: string;
    role: string;
    /** `trim(firstName + ' ' + lastName)`; '' for accounts that never had a name. Read from the DB by /api/auth/me. */
    fullName?: string;
    firstName?: string | null;
    lastName?: string | null;
    /** Relative URL of the profile photo (`/api/user-photos/<id>`), or null when there is none. */
    photoUrl?: string | null;
}

export interface LoginPayload {
    username: string;
    password: string;
}

export interface ChangePasswordPayload {
    currentPassword: string;
    newPassword: string;
}

export interface ChangePasswordResult {
    passwordChangedAt: string;
    /** How many of the user's other sessions were signed out; null when they could not be (sign them out again). */
    signedOutSessions: number | null;
}

/** What an emailed set-password link is for: a new user's invite, or an admin-sent password reset. */
export type SetPasswordLinkPurpose = 'invite' | 'reset';

/** POST /api/auth/invite/verify: who the link is for. */
export interface SetPasswordLinkInfo {
    username: string;
    /** First name, else the username. */
    name: string;
    purpose: SetPasswordLinkPurpose;
    expiresAt: string;
}

export interface AcceptSetPasswordLinkPayload {
    token: string;
    newPassword: string;
}

export interface AuthState {
    user: User | null;
    loading: boolean;
    isAuthenticated: boolean;
}
