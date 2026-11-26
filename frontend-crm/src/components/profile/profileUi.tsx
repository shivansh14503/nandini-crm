'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import { primaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { relativeTime } from '@/components/settings/audit-log/auditLogUi';

/** Dialog paper that fits a phone: full width minus a small margin. */
export const phoneDialogPaperSx = {
    borderRadius: '12px',
    m: { xs: 1.5, sm: 4 },
    width: { xs: 'calc(100% - 24px)', sm: undefined },
    maxHeight: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 64px)' },
} as const;

/** Buttons on the profile cards: full width on phones, 40 px tall (touch target). */
export const cardButtonLayoutSx = { flex: { xs: 1, sm: 'none' }, minHeight: 40, whiteSpace: 'nowrap' } as const;

/** Gradient primary button with white text, a hover gradient, and a muted look when disabled. */
export const solidButtonSx = {
    ...primaryButtonSx,
    ...cardButtonLayoutSx,
    color: '#ffffff',
    '&.Mui-disabled': { background: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-muted)' },
} as const;

/** 40 px tinted icon tile used in card headers (brand accent, switches blue / green with the theme). */
export function IconTile({ children }: { children: React.ReactNode }) {
    return (
        <Box
            aria-hidden
            sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--mui-palette-primary-soft)',
                border: '1px solid var(--mui-palette-primary-softBorder)',
                color: 'var(--crm-text-blue-600)',
            }}
        >
            {children}
        </Box>
    );
}

/** A card on the My Profile page: icon, title and description on top, content below. */
export function ProfileCard({
    icon,
    title,
    description,
    actions,
    children,
    id,
}: {
    icon: React.ReactNode;
    title: string;
    description?: React.ReactNode;
    /** Shown at the right of the header (below it on phones). */
    actions?: React.ReactNode;
    children: React.ReactNode;
    id?: string;
}) {
    const headingId = id ? `${id}-title` : undefined;
    return (
        <Box component="section" id={id} aria-labelledby={headingId} sx={{ ...surfaceSx, minWidth: 0, overflow: 'hidden' }}>
            <Box
                sx={{
                    px: { xs: 2, md: 2.5 },
                    py: { xs: 1.75, md: 2 },
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-start',
                    flexWrap: { xs: 'wrap', sm: 'nowrap' },
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                }}
            >
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                    <IconTile>{icon}</IconTile>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography id={headingId} component="h2" sx={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--crm-slate-900)', lineHeight: 1.35 }}>
                            {title}
                        </Typography>
                        {description && (
                            <Typography component="div" sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, lineHeight: 1.55 }}>
                                {description}
                            </Typography>
                        )}
                    </Box>
                </Box>
                {actions && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}>{actions}</Box>
                )}
            </Box>
            <Box sx={{ px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 2.5 } }}>{children}</Box>
        </Box>
    );
}

/** `2026-03-14T…` → `14 Mar 2026`; '' for empty / invalid input. */
export function formatLongDate(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Relative time that reads inside a sentence: "5 min ago", "just now", "yesterday", "on 14 Mar". */
export function relativeInSentence(iso: string): string {
    const text = relativeTime(iso);
    if (text === 'Just now' || text === 'Yesterday') return text.toLowerCase();
    return /ago$/.test(text) ? text : `on ${text}`;
}
