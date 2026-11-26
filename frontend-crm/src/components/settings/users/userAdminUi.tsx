'use client';

import React from 'react';
import { Box } from '@mui/material';
import { StatusChip, type ChipTone } from '@/components/settings/integrations/integrationUi';
import { relativeTime } from '@/components/settings/audit-log/auditLogUi';
export { phoneDialogPaperSx } from '@/components/profile/profileUi';
import { ApiClientError } from '@/services/apiClient';
import type { UserEmailIssue } from '@/types/integration.types';
import type { AdminUserDto } from '@/types/userAdmin.types';
import { hasGlobalAccessRole, isAdminAccessRole } from '@/utils/roleAccess';
import { isOutOfOfficeOn } from '@/utils/notificationPreferences';
import { shortDayLabel, useBusinessToday } from '@/utils/userAvailability';

/** Shared pieces of Admin › Users: role badges, status chips, error helpers. The password checklist is components/common/PasswordRulesChecklist. */

export const EMAIL_ISSUE_CHIP: Record<UserEmailIssue, { tone: ChipTone; label: string; title: string }> = {
    missing: { tone: 'warning', label: 'No email', title: 'No company email: this person can’t connect a calendar until one is set.' },
    duplicate: { tone: 'error', label: 'Duplicate email', title: 'Another active person has the same email. Each person needs their own.' },
    not_company: { tone: 'warning', label: 'Other domain', title: 'Not one of the company email domains.' },
};

/** "Admin" (opens the admin panel) and "Sees all" (every record) badges for a role name; nothing for own-records roles. */
export function RoleAccessBadges({ role }: { role: string }) {
    const admin = isAdminAccessRole(role);
    const all = hasGlobalAccessRole(role);
    if (!admin && !all) return null;
    return (
        <Box component="span" sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap' }}>
            {admin && (
                <StatusChip tone="brand" title="Opens the admin panel (forms, users, PDF templates, …).">
                    Admin
                </StatusChip>
            )}
            {all && (
                <StatusChip tone="info" title="Sees and changes every CRM record, not only their own.">
                    Sees all
                </StatusChip>
            )}
        </Box>
    );
}

/** What a role gives access to, in a sentence (the role picker's hint). */
export function roleAccessHint(role: string): string {
    const name = role.trim();
    if (!name) return 'Pick a role, or type a new one.';
    const admin = isAdminAccessRole(name);
    const all = hasGlobalAccessRole(name);
    if (admin && all) return 'Opens the admin panel and sees every record.';
    if (admin) return 'Opens the admin panel. Sees only their own records in the CRM modules.';
    if (all) return 'Sees and changes every record. No admin panel.';
    return 'Sees only the records they own or created. No admin panel.';
}

/** Status chips of a user row: Inactive, On leave, Out of office (today), Group, Must change password, an email issue. */
export function UserStatusChips({ user }: { user: AdminUserDto }) {
    const today = useBusinessToday();
    const outOfOffice = user.outOfOffice && isOutOfOfficeOn(user.outOfOffice, today) ? user.outOfOffice : null;
    const issue = user.emailIssue && user.isActive && !user.isGroupUser ? EMAIL_ISSUE_CHIP[user.emailIssue] : null;
    const chips: React.ReactNode[] = [];
    if (!user.isActive) {
        chips.push(
            <StatusChip key="inactive" tone="neutral" title="Can’t sign in. Their records are kept.">
                Inactive
            </StatusChip>,
        );
    }
    if (user.onLeave) {
        chips.push(
            <StatusChip key="leave" tone="warning" title="On leave: shown when picked; no morning summary email.">
                On leave
            </StatusChip>,
        );
    }
    if (outOfOffice) {
        chips.push(
            <StatusChip key="ooo" tone="warning" title={outOfOffice.message?.trim() || 'Out of office (set by the user in My Profile).'}>
                Out of office until {shortDayLabel(outOfOffice.to, today)}
            </StatusChip>,
        );
    }
    if (user.isGroupUser) {
        chips.push(
            <StatusChip key="group" tone="neutral" title="A shared login used by a team, not one person.">
                Group
            </StatusChip>,
        );
    }
    if (user.mustChangePassword && user.isActive) {
        chips.push(
            <StatusChip key="mcp" tone="info" title="Has a temporary password and must choose a new one at the next sign-in.">
                Must change password
            </StatusChip>,
        );
    }
    if (issue) {
        chips.push(
            <StatusChip key="email" tone={issue.tone} title={issue.title}>
                {issue.label}
            </StatusChip>,
        );
    }
    if (chips.length === 0) {
        return <StatusChip tone="success">Active</StatusChip>;
    }
    return <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{chips}</Box>;
}

/** "5 min ago" / "Never". */
export function lastSignInText(iso: string | null): string {
    return iso ? relativeTime(iso) : 'Never';
}

/** Field errors of a failed save keyed by their first path segment (`email`, `username`, `reportsToId`). */
export function apiFieldErrors(err: unknown): Record<string, string> {
    if (!(err instanceof ApiClientError)) return {};
    const out: Record<string, string> = {};
    for (const e of err.details?.errors ?? []) {
        const key = e.path?.[0];
        if (key && !out[key]) out[key] = e.message;
    }
    return out;
}

export const apiErrorCode = (err: unknown): string | undefined => (err instanceof ApiClientError ? err.details?.code : undefined);

/** "Asha Kulkarni" when the user has a name, else the username. */
export const userLabel = (user: Pick<AdminUserDto, 'fullName' | 'username'>) => user.fullName?.trim() || user.username;
