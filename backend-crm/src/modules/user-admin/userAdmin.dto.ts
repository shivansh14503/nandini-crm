import { OUT_OF_OFFICE_SELECT, outOfOfficeOf, type OutOfOfficeColumns, type OutOfOfficeDto } from '../preferences/preferences.dto.js';
import { isoOrNull, photoUrlOf, resolveNameParts, USER_REF_SELECT } from '../profile/profile.dto.js';
import { emailIssueFor, holdsAddress, type UserEmailIssue } from '../users/userEmail.service.js';
import { roleAccess, type RoleAccess } from './roles.js';

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
    mustChangePassword: true,
    lastLoginAt: true,
    passwordChangedAt: true,
    createdAt: true,
    createdBy: true,
    deactivatedAt: true,
    photo: { select: { id: true } },
    // Shown, never edited, here: the user sets it in My Profile › Notifications.
    preference: { select: OUT_OF_OFFICE_SELECT },
    reportsTo: { select: { ...USER_REF_SELECT, isActive: true } },
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
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    passwordChangedAt: Date | null;
    createdAt: Date;
    createdBy: string | null;
    deactivatedAt: Date | null;
    photo: { id: string } | null;
    preference: OutOfOfficeColumns | null;
    reportsTo: { id: number; fullName: string; username: string; isActive: boolean } | null;
    _count: { directReports: number };
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
    mustChangePassword: boolean;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
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

/** `today`: the business day (`YYYY-MM-DD`), for `outOfOffice`. */
export function toAdminUserDto(row: AdminUserRow, emailRule: EmailRuleContext, today: string): AdminUserDto {
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
        mustChangePassword: row.mustChangePassword,
        lastLoginAt: isoOrNull(row.lastLoginAt),
        passwordChangedAt: isoOrNull(row.passwordChangedAt),
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        deactivatedAt: isoOrNull(row.deactivatedAt),
        emailIssue: holdsAddress(row) ? emailIssueFor(row.email, emailRule.duplicates, emailRule.companyDomains) : null,
    };
}

/**
 * The fields an admin edit can change, as compared for the audit diff and stored as the CREATE snapshot. No password
 * or hash, and no key ending in "Password" (the audit log redacts those): `passwordChangeRequired` is
 * `mustChangePassword`.
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
    mustChangePassword: boolean;
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
        passwordChangeRequired: row.mustChangePassword,
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
