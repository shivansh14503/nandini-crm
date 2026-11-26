'use client';

import React from 'react';
import { Box, Button, CircularProgress, FormControlLabel, Switch, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
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

/**
 * A switch with its label and a hint, the whole row tappable (48 px min height). The switch takes the theme's brand
 * track (blue / green). Same look as Admin › Users' Flags rows.
 */
export function SwitchRow({
    checked,
    onChange,
    label,
    hint,
    disabled,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    hint?: React.ReactNode;
    disabled?: boolean;
}) {
    return (
        <FormControlLabel
            disabled={disabled}
            control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
            labelPlacement="start"
            label={
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{label}</Typography>
                    {hint && (
                        <Typography component="div" sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.45 }}>
                            {hint}
                        </Typography>
                    )}
                </Box>
            }
            sx={{
                m: 0,
                py: 0.75,
                px: 1.25,
                gap: 1,
                justifyContent: 'space-between',
                borderRadius: '10px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                minHeight: 48,
                '& .MuiFormControlLabel-label': { flex: 1, minWidth: 0 },
            }}
        />
    );
}

const NOTE_COLORS = {
    info: { background: 'var(--mui-palette-primary-soft)', border: 'var(--mui-palette-primary-softBorder)', color: 'var(--crm-text-blue-900)' },
    warning: { background: 'var(--mui-palette-warning-soft)', border: 'var(--mui-palette-warning-softBorder)', color: 'var(--crm-amber-700)' },
} as const;

/** A short tinted note inside a card (info = brand tint, warning = amber), like the morning email preview's notes. */
export function ProfileNote({ tone = 'info', children }: { tone?: keyof typeof NOTE_COLORS; children: React.ReactNode }) {
    const c = NOTE_COLORS[tone];
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                px: 1.5,
                py: 1,
                borderRadius: '8px',
                backgroundColor: c.background,
                border: `1px solid ${c.border}`,
                color: c.color,
                minWidth: 0,
            }}
        >
            <InfoOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '1px', flexShrink: 0 }} />
            <Typography component="div" sx={{ fontSize: '0.8rem', lineHeight: 1.45, color: 'inherit', minWidth: 0 }}>
                {children}
            </Typography>
        </Box>
    );
}

/**
 * A card's explicit Cancel / Save footer (right-aligned, full-width buttons on phones). `extra` sits before Cancel,
 * e.g. a Clear button.
 */
export function CardSaveFooter({
    dirty,
    saving,
    onCancel,
    saveLabel = 'Save changes',
    extra,
    mt = 2.5,
}: {
    dirty: boolean;
    saving: boolean;
    onCancel: () => void;
    saveLabel?: string;
    extra?: React.ReactNode;
    /** Space above (theme spacing units); less inside a column that already has a gap. */
    mt?: number;
}) {
    return (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap', mt }}>
            {extra}
            <Button variant="outlined" onClick={onCancel} disabled={!dirty || saving} sx={{ ...secondaryButtonSx, ...cardButtonLayoutSx }}>
                Cancel
            </Button>
            <Button
                type="submit"
                variant="contained"
                disabled={!dirty || saving}
                startIcon={saving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                sx={solidButtonSx}
            >
                {saving ? 'Saving…' : saveLabel}
            </Button>
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
