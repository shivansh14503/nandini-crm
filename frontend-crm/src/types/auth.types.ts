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

export interface AuthState {
    user: User | null;
    loading: boolean;
    isAuthenticated: boolean;
}
