'use client';

import React from 'react';
import { Box } from '@mui/material';
import { StatusChip, type ChipTone } from '@/components/settings/integrations/integrationUi';
import { relativeTime } from '@/components/settings/audit-log/auditLogUi';
import { formatDateTime } from '@/utils/date';
export { phoneDialogPaperSx } from '@/components/profile/profileUi';
import { ApiClientError } from '@/services/apiClient';
import type { UserEmailIssue } from '@/types/integration.types';
import type { AdminUserDto } from '@/types/userAdmin.types';
import type { RoleAccess } from '@/utils/roleAccess';
import { isOutOfOfficeOn } from '@/utils/notificationPreferences';
import { shortDayLabel, useBusinessToday } from '@/utils/userAvailability';

/** Shared pieces of Admin › Users: role badges, status chips, error helpers. The password checklist is components/common/PasswordRulesChecklist. */

export const EMAIL_ISSUE_CHIP: Record<UserEmailIssue, { tone: ChipTone; label: string; title: string }> = {
    missing: { tone: 'warning', label: 'No email', title: 'No company email: this person can’t connect a calendar until one is set.' },
    duplicate: { tone: 'error', label: 'Duplicate email', title: 'Another active person has the same email. Each person needs their own.' },
    not_company: { tone: 'warning', label: 'Other domain', title: 'Not one of the company email domains.' },
};

/** "Admin" (opens the admin panel) and "Sees all" (every record) badges for a role's access; "Custom" for a mix. */
export function RoleAccessBadges({ access }: { access: RoleAccess | null | undefined }) {
    if (!access || access === 'own-records') return null;
    return (
        <Box component="span" sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap' }}>
            {access === 'admin' && (
                <StatusChip tone="brand" title="Opens the admin panel (forms, users, roles, PDF templates, …).">
                    Admin
                </StatusChip>
            )}
            {access === 'all-records' && (
                <StatusChip tone="info" title="Sees and changes every CRM record, not only their own.">
                    Sees all
                </StatusChip>
            )}
            {access === 'custom' && (
                <StatusChip tone="neutral" title="Its own mix of module permissions (Admin › Roles).">
                    Custom
                </StatusChip>
            )}
        </Box>
    );
}

/** What a role gives access to, in a sentence (the role picker's hint). */
export function roleAccessHint(access: RoleAccess | null | undefined): string {
    if (!access) return 'Pick a role. Roles and what each may do are set in Admin › Roles.';
    if (access === 'admin') return 'Opens the admin panel. Module permissions as set in Admin › Roles.';
    if (access === 'all-records') return 'Sees and changes every record. No admin panel.';
    if (access === 'own-records') return 'Sees only the records they own or created. No admin panel.';
    return 'Its own module permissions, as set in Admin › Roles. No admin panel.';
}

/**
 * Status chips of a user row: Invited (or Invite expired), Inactive, On leave, Out of office (today), Group, Reset link
 * sent, an email issue. "Active" when none apply.
 */
export function UserStatusChips({ user }: { user: AdminUserDto }) {
    const today = useBusinessToday();
    const outOfOffice = user.outOfOffice && isOutOfOfficeOn(user.outOfOffice, today) ? user.outOfOffice : null;
    const issue = user.emailIssue && user.isActive && !user.isGroupUser ? EMAIL_ISSUE_CHIP[user.emailIssue] : null;
    const chips: React.ReactNode[] = [];
    const link = user.invite;
    if (user.invitePending && user.isActive) {
        if (link && !link.expired) {
            chips.push(
                <StatusChip key="invited" tone="info" title={`Invite emailed ${formatDateTime(link.sentAt)}; the link works until ${formatDateTime(link.expiresAt)}. They can’t sign in until they set a password.`}>
                    Invited
                </StatusChip>,
            );
        } else {
            chips.push(
                <StatusChip
                    key="invited"
                    tone="warning"
                    title={link ? `The invite link expired ${formatDateTime(link.expiresAt)}. Use “Resend invite” in the row menu.` : 'No working invite link. Use “Resend invite” in the row menu.'}
                >
                    {link ? 'Invite expired' : 'Invite not sent'}
                </StatusChip>,
            );
        }
    }
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
    if (!user.invitePending && user.isActive && link && !link.expired && link.purpose === 'reset') {
        chips.push(
            <StatusChip key="reset" tone="neutral" title={`Password reset link emailed ${formatDateTime(link.sentAt)}; it works until ${formatDateTime(link.expiresAt)}.`}>
                Reset link sent
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
