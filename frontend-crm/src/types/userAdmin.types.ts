import type { SetPasswordLinkPurpose } from './auth.types';

/**
 * Admin › Users (`/api/admin/users`, admin roles only). Mirrors backend-crm/src/modules/user-admin (route header
 * comment = source of truth).
 */
import type { RoleAccess } from '../utils/roleAccess';
import type { UserEmailIssue } from './integration.types';

export type { RoleAccess };

export const USER_STATUS_FILTERS = ['active', 'inactive', 'all'] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

/** Longest job title (`Users.jobTitle` is NVARCHAR(100)). */
export const JOB_TITLE_MAX_LENGTH = 100;
/** Longest department name (`Users.department` is NVARCHAR(50)). */
export const DEPARTMENT_MAX_LENGTH = 50;

export interface AdminUserRef {
    id: number;
    name: string;
    /** False when the manager was deactivated since (shown as inactive). */
    isActive: boolean;
}

/** One user as Admin › Users shows it. */
export interface AdminUserDto {
    id: number;
    /** Set once at creation; never changes (records store it as owner). */
    username: string;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string;
    /** The highest access the role gives (admin panel, then every record, else own records only). */
    roleAccess: RoleAccess;
    department: string | null;
    jobTitle: string | null;
    reportsTo: AdminUserRef | null;
    /** Active people who report to this user. */
    directReportsCount: number;
    /** E.164. */
    mobile: string | null;
    officePhone: string | null;
    /** Relative URL (`/api/user-photos/<id>`), or null. */
    photoUrl: string | null;
    isActive: boolean;
    isGroupUser: boolean;
    onLeave: boolean;
    /** The user's own out-of-office range (My Profile, inclusive `YYYY-MM-DD` days); null when unset or ended. Admins only see it. */
    outOfOffice: { from: string; to: string; message: string | null } | null;
    /** "Invited": added, but hasn't set a password from the emailed link yet (can't sign in until then). */
    invitePending: boolean;
    /** The newest emailed set-password link still outstanding (it may have expired); null when none. */
    invite: AdminUserInvite | null;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
    createdAt: string;
    createdBy: string | null;
    deactivatedAt: string | null;
    emailIssue: UserEmailIssue | null;
}

export interface AdminUserListParams {
    search?: string;
    status?: UserStatusFilter;
    role?: string;
    department?: string;
    /** 1-based. */
    page?: number;
    /** ≤ 100. */
    pageSize?: number;
}

export interface AdminUserListResponse {
    success: boolean;
    data: AdminUserDto[];
    meta: { total: number; page: number; pageSize: number };
}

export interface AdminRoleOption {
    name: string;
    access: RoleAccess;
    /** Opens the admin panel. */
    adminPanel?: boolean;
    /** Sees every record. */
    allRecords?: boolean;
    /** Active users with this role. */
    userCount: number;
    /** Inactive users with this role. */
    inactiveUserCount: number;
}

export interface AdminDepartmentOption {
    name: string;
    userCount: number;
}

/** Active, non-group users who can be picked as a manager. */
export interface AdminManagerOption {
    id: number;
    name: string;
    username: string;
    photoUrl?: string | null;
}

/** GET /api/admin/users/meta: what the filters and the user form offer. */
export interface AdminUsersMeta {
    roles: AdminRoleOption[];
    departments: AdminDepartmentOption[];
    managers: AdminManagerOption[];
    companyDomains: string[];
}

/** POST /api/admin/users. Without `password` the API generates a temporary one. */
export interface CreateAdminUserPayload {
    username: string;
    firstName: string;
    lastName?: string;
    /** Required: the invite to set a password is emailed here. */
    email: string;
    allowOtherDomain?: boolean;
    role: string;
    department?: string;
    jobTitle?: string;
    reportsToId?: number | null;
    mobile?: string;
    officePhone?: string;
    isGroupUser?: boolean;
}

/** PATCH /api/admin/users/:id: only the keys that changed; '' (or null) clears an optional field. */
export interface UpdateAdminUserPayload {
    firstName?: string;
    lastName?: string;
    email?: string;
    allowOtherDomain?: boolean;
    role?: string;
    department?: string;
    jobTitle?: string;
    reportsToId?: number | null;
    mobile?: string;
    officePhone?: string;
    isGroupUser?: boolean;
    onLeave?: boolean;
}

/** PATCH /:id answer: a role change signs the user out (so the new role applies) and says how many sessions ended. */
export type AdminUserUpdateResult = AdminUserDto & {
    signedOutSessions?: number | null;
};

export interface AdminUserInvite {
    purpose: SetPasswordLinkPurpose;
    sentAt: string;
    expiresAt: string;
    /** Past `expiresAt`: the link no longer works. */
    expired: boolean;
}

/** The invite email sent when a user is added. The user is added even when it failed (`error` says why). */
export type InviteEmailOutcome =
    | { status: 'sent'; purpose: SetPasswordLinkPurpose; sentTo: string; expiresAt: string }
    | { status: 'failed' | 'mail_disabled'; purpose: SetPasswordLinkPurpose; sentTo: string; error: string };

export interface CreateAdminUserResult {
    user: AdminUserDto;
    invite: InviteEmailOutcome;
}

/** POST /:id/deactivate and /:id/activate. */
export type AdminUserStatusResult = AdminUserDto & {
    /** Sessions signed out by a deactivation; null when they could not be counted (Redis down). */
    signedOutSessions?: number | null;
};

/** POST /:id/send-invite: the invite again (Invited user) or a password reset link (active account). */
export interface SendInviteResult {
    user: AdminUserDto;
    purpose: SetPasswordLinkPurpose;
    sentTo: string;
    expiresAt: string;
}
