import { OUT_OF_OFFICE_SELECT, outOfOfficeOf, type OutOfOfficeColumns, type OutOfOfficeDto } from '../preferences/preferences.dto.js';
import { isoOrNull, photoUrlOf, resolveNameParts, USER_REF_SELECT } from '../profile/profile.dto.js';
import { emailIssueFor, holdsAddress, type UserEmailIssue } from '../users/userEmail.service.js';
import { roleAccess, type RoleAccess } from './roles.js';
import type { InvitePurpose } from '../auth/invite.token.js';
import { isLocked } from '../auth/accountLockout.js';

/**
 * What /api/admin/users returns about a user. No database access here, so pure code and tests can use it. Mirrored by
 * frontend-crm/src/types/userAdmin.types.ts. Never carries the password hash.
 */

/** Columns an admin user row reads (never the password hash or the photo bytes). */
export const ADMIN_USER_SELECT = {
    id: true,
    username: true,
    fullName: true,
    firstName: true,
    lastName: true,
    email: true,
    role: true,
    department: true,
    jobTitle: true,
    reportsToId: true,
    phone: true,
    officePhone: true,
    isActive: true,
    isGroupUser: true,
    onLeave: true,
    invitePending: true,
    lastLoginAt: true,
    passwordChangedAt: true,
    failedLoginCount: true,
    lockedUntil: true,
    createdAt: true,
    createdBy: true,
    deactivatedAt: true,
    photo: { select: { id: true } },
    // Shown, never edited, here: the user sets it in My Profile › Notifications.
    preference: { select: OUT_OF_OFFICE_SELECT },
    reportsTo: { select: { ...USER_REF_SELECT, isActive: true } },
    // The newest set-password link not used or revoked (it may have expired): the "Invited" / "Reset link sent" chip.
    invites: { where: { usedAt: null, revokedAt: null }, orderBy: { id: 'desc' }, take: 1, select: { purpose: true, createdAt: true, expiresAt: true } },
    // Active direct reports (an inactive one no longer reports to anybody in practice).
    _count: { select: { directReports: { where: { isActive: true } } } },
} as const;

export interface AdminUserRow {
    id: number;
    username: string;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string;
    department: string | null;
    jobTitle: string | null;
    reportsToId: number | null;
    phone: string | null;
    officePhone: string | null;
    isActive: boolean;
    isGroupUser: boolean;
    onLeave: boolean;
    invitePending: boolean;
    lastLoginAt: Date | null;
    passwordChangedAt: Date | null;
    failedLoginCount: number;
    lockedUntil: Date | null;
    createdAt: Date;
    createdBy: string | null;
    deactivatedAt: Date | null;
    photo: { id: string } | null;
    preference: OutOfOfficeColumns | null;
    reportsTo: { id: number; fullName: string; username: string; isActive: boolean } | null;
    invites: { purpose: string; createdAt: Date; expiresAt: Date }[];
    _count: { directReports: number };
}

/** The user's newest set-password link that is neither used nor revoked. */
export interface AdminUserInviteDto {
    purpose: InvitePurpose;
    sentAt: string;
    expiresAt: string;
    /** Past `expiresAt`: the link no longer works (Resend invite sends a new one). */
    expired: boolean;
}

export interface AdminUserRefDto {
    id: number;
    name: string;
    /** False when the manager was deactivated since (the UI marks them inactive). */
    isActive: boolean;
}

export interface AdminUserDto {
    id: number;
    username: string;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string;
    roleAccess: RoleAccess;
    department: string | null;
    jobTitle: string | null;
    reportsTo: AdminUserRefDto | null;
    directReportsCount: number;
    /** The `phone` column. */
    mobile: string | null;
    officePhone: string | null;
    photoUrl: string | null;
    isActive: boolean;
    isGroupUser: boolean;
    onLeave: boolean;
    /** Set by the user in My Profile (read-only here); null when unset or ended before today (business timezone). */
    outOfOffice: OutOfOfficeDto | null;
    /** "Invited": added, but hasn't set a password from the emailed link yet (can't sign in until then). */
    invitePending: boolean;
    /** The newest link still outstanding (an invite, or a password reset link for an active user); null when none. */
    invite: AdminUserInviteDto | null;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
    /**
     * "Locked": sign-in is refused until then after too many wrong passwords (auth/accountLockout.ts); null when not
     * locked (never set, or already past). "Unlock account" in the row menu clears it.
     */
    lockedUntil: string | null;
    /** Wrong passwords in the current run (0 after a successful sign-in, a lock, or an unlock). */
    failedLoginCount: number;
    createdAt: string;
    createdBy: string | null;
    deactivatedAt: string | null;
    /**
     * The company email rule's verdict (as Admin › API Integrations › People). Only for users who hold an address
     * (active, not a group login); null for the others and when the address is fine.
     */
    emailIssue: UserEmailIssue | null;
}

/** Context the email verdict needs: addresses held by more than one active non-group user, and the company domains. */
export interface EmailRuleContext {
    duplicates: ReadonlySet<string>;
    companyDomains: readonly string[];
}

/** `today`: the business day (`YYYY-MM-DD`), for `outOfOffice`; `now` decides whether the link has expired. */
export function toAdminUserDto(row: AdminUserRow, emailRule: EmailRuleContext, today: string, now: Date = new Date()): AdminUserDto {
    const link = row.invites[0];
    return {
        id: row.id,
        username: row.username,
        fullName: row.fullName,
        ...resolveNameParts(row),
        email: row.email,
        role: row.role,
        roleAccess: roleAccess(row.role),
        department: row.department,
        jobTitle: row.jobTitle,
        reportsTo: row.reportsTo
            ? { id: row.reportsTo.id, name: row.reportsTo.fullName?.trim() || row.reportsTo.username, isActive: row.reportsTo.isActive }
            : null,
        directReportsCount: row._count.directReports,
        mobile: row.phone,
        officePhone: row.officePhone,
        photoUrl: photoUrlOf(row.photo?.id),
        isActive: row.isActive,
        isGroupUser: row.isGroupUser,
        onLeave: row.onLeave,
        outOfOffice: outOfOfficeOf(row.preference, today),
        invitePending: row.invitePending,
        invite: link
            ? {
                  purpose: link.purpose === 'reset' ? 'reset' : 'invite',
                  sentAt: link.createdAt.toISOString(),
                  expiresAt: link.expiresAt.toISOString(),
                  expired: link.expiresAt.getTime() <= now.getTime(),
              }
            : null,
        lastLoginAt: isoOrNull(row.lastLoginAt),
        passwordChangedAt: isoOrNull(row.passwordChangedAt),
        lockedUntil: isLocked(row.lockedUntil, now) ? row.lockedUntil.toISOString() : null,
        failedLoginCount: row.failedLoginCount,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        deactivatedAt: isoOrNull(row.deactivatedAt),
        emailIssue: holdsAddress(row) ? emailIssueFor(row.email, emailRule.duplicates, emailRule.companyDomains) : null,
    };
}

/**
 * The fields an admin edit can change, as compared for the audit diff and stored as the CREATE snapshot. No password
 * or hash, and no key ending in "Password" (the audit log redacts those).
 */
export function adminUserAuditSnapshot(row: {
    username: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    email: string | null;
    role: string;
    department: string | null;
    jobTitle: string | null;
    reportsToId: number | null;
    phone: string | null;
    officePhone: string | null;
    isGroupUser: boolean;
    onLeave: boolean;
    isActive: boolean;
    invitePending: boolean;
}) {
    return {
        username: row.username,
        firstName: row.firstName,
        lastName: row.lastName,
        fullName: row.fullName,
        email: row.email,
        role: row.role,
        department: row.department,
        jobTitle: row.jobTitle,
        reportsToId: row.reportsToId,
        mobile: row.phone,
        officePhone: row.officePhone,
        isGroupUser: row.isGroupUser,
        onLeave: row.onLeave,
        isActive: row.isActive,
        invitePending: row.invitePending,
    };
}

// ── GET /meta ────────────────────────────────────────────────────────────────

export interface DepartmentOption {
    name: string;
    /** Active users in the department (0 when only inactive users are in it). */
    userCount: number;
}

/**
 * Departments in use, grouped case-insensitively (as SQL Server groups them; the most used spelling kept), sorted
 * by name. Blank values are skipped. Pure.
 */
export function departmentOptionsFrom(counts: readonly { department: string | null; count: number }[]): DepartmentOption[] {
    const groups = new Map<string, { name: string; best: number; userCount: number }>();
    for (const { department, count } of counts) {
        const name = department?.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const group = groups.get(key);
        if (!group) groups.set(key, { name, best: count, userCount: count });
        else {
            group.userCount += count;
            if (count > group.best) Object.assign(group, { name, best: count });
        }
    }
    return [...groups.values()]
        .map(({ name, userCount }) => ({ name, userCount }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/** The stored spelling for a department: an existing one with the same text in any case, else as typed. Pure. */
export function canonicalDepartment(input: string, known: readonly string[]): string {
    return known.find((name) => name.trim().toLowerCase() === input.toLowerCase())?.trim() ?? input;
}
