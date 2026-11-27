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
    /**
     * Set by an admin (new user, password reset): until the password is changed, the API refuses everything but
     * sign-out, /auth/me, My Profile and the password change (403 PASSWORD_CHANGE_REQUIRED), and the app keeps the
     * user on My Profile › Security.
     */
    mustChangePassword?: boolean;
}

export interface LoginPayload {
    username: string;
    password: string;
}

export interface ChangePasswordPayload {
    /** Left out on the first-login / forced change (the temporary password was just used to sign in). */
    currentPassword?: string;
    newPassword: string;
}

export interface ChangePasswordResult {
    passwordChangedAt: string;
    /** How many of the user's other sessions were signed out; null when they could not be (sign them out again). */
    signedOutSessions: number | null;
    /** Always false after a change (the session's cookie is re-issued without the must-change claim). */
    mustChangePassword?: boolean;
}

export interface AuthState {
    user: User | null;
    loading: boolean;
    isAuthenticated: boolean;
}
