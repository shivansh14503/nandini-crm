'use client';

import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import SettingsSuggestOutlinedIcon from '@mui/icons-material/SettingsSuggestOutlined';
import { ROUTES } from '@/config/constants';
import { UserAvatar as SharedUserAvatar } from '@/components/common/UserAvatar';
import { getModuleColor, moduleKeyFrom } from '@/theme/moduleColors';
import type { AuditListItem, AuditUserActivity } from '@/services/auditAdmin.service';

/** Root of every audit log query (list, counts, entries, undo previews, integrity): invalidating it refreshes the screen. */
export const AUDIT_LOG_KEY = ['admin-audit-log'] as const;

/** Detail page of a CRM record, by audit module key; null for everything that isn't a record page. */
export function recordHref(module: string, entityId: string): string | null {
    switch (module) {
        case 'leads':
            return ROUTES.LEAD_DETAIL(entityId);
        case 'contacts':
            return ROUTES.CONTACT_DETAIL(entityId);
        case 'organizations':
            return ROUTES.ORGANIZATION_DETAIL(entityId);
        case 'opportunities':
            return ROUTES.OPPORTUNITY_DETAIL(entityId);
        case 'quotations':
            return ROUTES.QUOTATION_DETAIL(entityId);
        case 'products':
            return ROUTES.PRODUCT_DETAIL(entityId);
        case 'tickets':
            return ROUTES.TICKET_DETAIL(entityId);
        case 'contracts':
            return ROUTES.CONTRACT_DETAIL(entityId);
        case 'partner-companies':
            return ROUTES.PARTNER_COMPANY_DETAIL(entityId);
        case 'referrals':
            return ROUTES.REFERRAL_DETAIL(entityId);
        case 'activities':
            return ROUTES.ACTIVITY_DETAIL(entityId);
        default:
            return null;
    }
}

interface Tone {
    color: string;
    bg: string;
    border: string;
}

const TONES: Record<'success' | 'error' | 'warning' | 'info' | 'neutral', Tone> = {
    success: { color: 'var(--mui-palette-success-main)', bg: 'var(--mui-palette-success-soft)', border: 'var(--mui-palette-success-softBorder)' },
    error: { color: 'var(--mui-palette-error-main)', bg: 'var(--mui-palette-error-soft)', border: 'var(--mui-palette-error-softBorder)' },
    warning: { color: 'var(--crm-amber-700)', bg: 'var(--mui-palette-warning-soft)', border: 'var(--mui-palette-warning-softBorder)' },
    info: { color: 'var(--mui-palette-info-main)', bg: 'var(--mui-palette-info-soft)', border: 'var(--mui-palette-info-softBorder)' },
    neutral: { color: 'var(--crm-slate-700)', bg: 'var(--mui-palette-background-subtle)', border: 'var(--mui-palette-border-main)' },
};

function actionTone(action: string): Tone {
    switch (action) {
        case 'CREATE':
        case 'DUPLICATE':
        case 'RESTORE':
        case 'LOGIN':
            return TONES.success;
        case 'DELETE':
            return TONES.error;
        case 'LOGIN_FAILED':
        case 'ACCESS_DENIED':
            return TONES.warning;
        case 'REVERT':
        case 'CONVERT':
        case 'IMPORT':
            return TONES.info;
        default:
            return TONES.neutral;
    }
}

/** What happened, as a small pill (green: created / restored, red: deleted, amber: refused or failed). */
export function ActionPill({ action, label }: { action: string; label: string }) {
    const tone = actionTone(action);
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                px: 1,
                py: 0.15,
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: tone.color,
                backgroundColor: tone.bg,
                border: `1px solid ${tone.border}`,
            }}
        >
            {label}
        </Box>
    );
}

/** Module name with its identity-colour dot (CRM modules); a neutral dot for sign-ins and settings. */
export function ModuleDot({ module, label }: { module: string; label: string }) {
    const key = moduleKeyFrom(module);
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
            <Box
                component="span"
                aria-hidden
                sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: key ? getModuleColor(key).main : 'var(--mui-palette-text-muted)' }}
            />
            {label}
        </Box>
    );
}

/** A small grey badge next to a record that no longer opens. */
export function MutedBadge({ children, title }: { children: React.ReactNode; title?: string }) {
    const badge = (
        <Box
            component="span"
            sx={{
                ml: 0.75,
                px: 0.75,
                py: 0.1,
                borderRadius: '4px',
                fontSize: '0.65rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: 'var(--mui-palette-text-secondary)',
                backgroundColor: 'var(--mui-palette-background-hover)',
                border: '1px solid var(--mui-palette-border-main)',
                cursor: title ? 'help' : 'default',
            }}
        >
            {children}
        </Box>
    );
    return title ? <Tooltip title={title}>{badge}</Tooltip> : badge;
}

/** `NIPL/L/26-27/1004 · Asha Traders`, or whichever of the two is known. */
export function recordText(item: Pick<AuditListItem, 'entityCode' | 'entityLabel' | 'entityId'>): string {
    return [item.entityCode, item.entityLabel].filter(Boolean).join(' · ') || item.entityId;
}

/** The record an entry is about: a link while it exists, else its name with "Deleted" / "Removed". */
export function RecordCell({ item, onOpen }: { item: AuditListItem; onOpen?: (href: string) => void }) {
    const text = recordText(item);
    const href = item.recordStatus === 'live' ? recordHref(item.module, item.entityId) : null;
    if (href) {
        return (
            <Typography
                component="a"
                href={href}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    e.stopPropagation();
                    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !onOpen) return;
                    e.preventDefault();
                    onOpen(href);
                }}
                sx={{
                    fontSize: 'inherit',
                    color: 'var(--crm-text-blue-700)',
                    textDecoration: 'none',
                    transition: 'color 0.15s ease',
                    '&:hover': { color: 'var(--crm-text-blue-600)', textDecoration: 'underline' },
                }}
            >
                {text}
            </Typography>
        );
    }
    return (
        <Box component="span">
            <Box component="span" sx={{ color: 'var(--crm-slate-700)' }}>
                {text}
            </Box>
            {item.recordStatus === 'deleted' && <MutedBadge title="The record is in the recycle state (soft-deleted).">Deleted</MutedBadge>}
            {item.recordStatus === 'missing' && <MutedBadge title="The record no longer exists in the database.">Removed</MutedBadge>}
        </Box>
    );
}

/** A user's display name; `system` is the background jobs. */
export function displayUser(username: string, names: Map<string, string>): string {
    if (username === 'system') return 'System';
    return names.get(username) ?? username;
}

// ── Users tab ────────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `Just now`, `5 min ago`, `3 hours ago`, `Yesterday`, `4 days ago`, then the date (`12 Oct`, `12 Oct 2025`). */
export function relativeTime(iso: string, now = Date.now()): string {
    const then = new Date(iso);
    const ago = now - then.getTime();
    if (ago < MINUTE) return 'Just now';
    if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min ago`;
    if (ago < DAY) {
        const hours = Math.floor(ago / HOUR);
        return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    const today = new Date(now);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const days = Math.ceil((startOfToday - then.getTime()) / DAY);
    if (days <= 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    const sameYear = then.getFullYear() === today.getFullYear();
    return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * A user's profile photo (shared `UserAvatar`, which falls back to initials on the brand fill), muted for everyone
 * but active users; a cog for the background jobs.
 */
export function UserAvatar({ user, size = 34 }: { user: Pick<AuditUserActivity, 'name' | 'status'> & { photoUrl?: string | null }; size?: number }) {
    const active = user.status === 'active';
    const fontSize = size >= 40 ? '0.95rem' : '0.75rem';
    if (user.status === 'system') {
        return (
            <Box
                aria-hidden
                sx={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '& svg': { fontSize: size * 0.55 },
                    backgroundColor: 'var(--mui-palette-background-hover)',
                    color: 'var(--mui-palette-text-secondary)',
                    border: '1px solid var(--mui-palette-border-main)',
                }}
            >
                <SettingsSuggestOutlinedIcon />
            </Box>
        );
    }
    return (
        <SharedUserAvatar
            name={user.name}
            photoUrl={user.photoUrl}
            size={size}
            sx={{
                fontSize,
                letterSpacing: '0.02em',
                ...(active
                    ? {}
                    : {
                          background: 'var(--mui-palette-background-hover)',
                          color: 'var(--mui-palette-text-secondary)',
                          border: '1px solid var(--mui-palette-border-main)',
                      }),
            }}
        />
    );
}

/** Small pills next to a user's name: Inactive, On leave, Group account, Not a user any more. */
export function UserBadges({ user }: { user: Pick<AuditUserActivity, 'status' | 'onLeave' | 'isGroupUser'> }) {
    const badges: { label: string; title: string; tone: Tone }[] = [];
    if (user.status === 'inactive') badges.push({ label: 'Inactive', title: 'This account is deactivated and can’t sign in.', tone: TONES.neutral });
    if (user.status === 'unknown') badges.push({ label: 'Not in user list', title: 'Entries under a username that is no longer in the user list.', tone: TONES.neutral });
    if (user.onLeave) badges.push({ label: 'On leave', title: 'Marked as on leave.', tone: TONES.warning });
    if (user.isGroupUser) badges.push({ label: 'Group account', title: 'A shared account used for assignments.', tone: TONES.info });
    if (badges.length === 0) return null;
    return (
        <>
            {badges.map((badge) => (
                <Tooltip key={badge.label} title={badge.title}>
                    <Box
                        component="span"
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            px: 0.75,
                            py: 0.1,
                            borderRadius: '9999px',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            cursor: 'help',
                            color: badge.tone.color,
                            backgroundColor: badge.tone.bg,
                            border: `1px solid ${badge.tone.border}`,
                        }}
                    >
                        {badge.label}
                    </Box>
                </Tooltip>
            ))}
        </>
    );
}

/** Data / Configuration / Security share of a user's entries, in the chart's category colours. */
export function CategoryBar({ data, config, security }: { data: number; config: number; security: number }) {
    const total = data + config + security;
    const parts = [
        { key: 'data', value: data, color: 'var(--crm-chart-audit-data)' },
        { key: 'config', value: config, color: 'var(--crm-chart-audit-config)' },
        { key: 'security', value: security, color: 'var(--crm-chart-audit-security)' },
    ];
    return (
        <Box sx={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'var(--mui-palette-background-hover)', width: '100%', maxWidth: 140 }}>
            {total > 0 && parts.map((part) => (part.value > 0 ? <Box key={part.key} sx={{ width: `${(part.value / total) * 100}%`, backgroundColor: part.color }} /> : null))}
        </Box>
    );
}
