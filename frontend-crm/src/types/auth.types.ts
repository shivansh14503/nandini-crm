import type { RolePermissions } from '@/utils/permissions';

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
    /** What the user's role allows (Admin › Roles). Read with `usePermissions`; the API enforces the same rules. */
    access?: UserAccess;
}

export interface UserAccess {
    /** Opens the admin panel. */
    adminPanel: boolean;
    /** Super Admin (manages Super Admin users). */
    superAdmin: boolean;
    permissions: RolePermissions;
    /**
     * Usernames a "Group" level covers (Admin › Security Groups): everyone who shares a security group with the user,
     * themselves included. Missing from older servers (then Group works like Own).
     */
    teammates?: string[];
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
