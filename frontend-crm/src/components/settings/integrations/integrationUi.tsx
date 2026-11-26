'use client';

import React, { useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { ApiClientError } from '@/services/apiClient';
import type { IntegrationProviderKey } from '@/types/integration.types';
import { fmtDay, fmtInstant, fmtInstantDay } from '@/utils/formats';

/** Shared pieces of Admin › API Integrations: status chips, copyable read-only values, provider marks. */

export type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';

const TONES: Record<ChipTone, { color: string; backgroundColor: string; borderColor: string }> = {
    success: { color: 'var(--crm-emerald-700)', backgroundColor: 'var(--mui-palette-success-soft)', borderColor: 'var(--mui-palette-success-softBorder)' },
    warning: { color: 'var(--crm-amber-700)', backgroundColor: 'var(--mui-palette-warning-soft)', borderColor: 'var(--mui-palette-warning-softBorder)' },
    error: { color: 'var(--crm-red-700)', backgroundColor: 'var(--mui-palette-error-soft)', borderColor: 'var(--mui-palette-error-softBorder)' },
    info: { color: 'var(--mui-palette-info-main)', backgroundColor: 'var(--mui-palette-info-soft)', borderColor: 'var(--mui-palette-info-softBorder)' },
    neutral: { color: 'var(--mui-palette-text-secondary)', backgroundColor: 'var(--mui-palette-background-subtle)', borderColor: 'var(--mui-palette-border-main)' },
    brand: { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)', borderColor: 'var(--mui-palette-primary-softBorder)' },
};

/**
 * A small tone-coloured pill. `truncate` lets it shrink to its container with an ellipsis (put the full text in
 * `title`) where a long label would otherwise push past a narrow column on phones.
 */
export function StatusChip({ tone, children, title, truncate = false }: { tone: ChipTone; children: React.ReactNode; title?: string; truncate?: boolean }) {
    return (
        <Box
            component="span"
            title={title}
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 1,
                py: 0.15,
                borderRadius: '999px',
                fontSize: '0.7rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                border: `1px solid ${TONES[tone].borderColor}`,
                color: TONES[tone].color,
                backgroundColor: TONES[tone].backgroundColor,
                ...(truncate && { display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'top' }),
            }}
        >
            {children}
        </Box>
    );
}

export const fieldLabelSx = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.5 } as const;
export const hintSx = { fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 } as const;

/** A read-only value admins paste elsewhere (redirect URI, webhook URL, a command), with a copy button. */
export function CopyField({ label, value, monospace = true }: { label?: string; value: string; monospace?: boolean }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked (http, permissions): the value stays selectable.
        }
    };
    return (
        <Box sx={{ minWidth: 0 }}>
            {label && <Typography sx={fieldLabelSx}>{label}</Typography>}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    minWidth: 0,
                    pl: 1.25,
                    pr: 0.25,
                    borderRadius: '8px',
                    border: '1px solid var(--mui-palette-border-main)',
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                }}
            >
                <Typography
                    component="code"
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        py: 0.9,
                        fontSize: '0.76rem',
                        fontFamily: monospace ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : 'inherit',
                        color: 'var(--crm-slate-900)',
                        overflowWrap: 'anywhere',
                        userSelect: 'all',
                    }}
                >
                    {value}
                </Typography>
                <Tooltip title={copied ? 'Copied' : 'Copy'}>
                    <IconButton
                        size="small"
                        onClick={() => void copy()}
                        aria-label={label ? `Copy ${label}` : 'Copy'}
                        sx={{
                            width: 36,
                            height: 36,
                            flexShrink: 0,
                            borderRadius: '8px',
                            color: copied ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)',
                            '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                        }}
                    >
                        {copied ? <CheckRoundedIcon sx={{ fontSize: 17 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
}

/**
 * Small monochrome provider marks (they follow the text colour, never the provider's brand colours, so the page stays on
 * the CRM theme in both modes).
 */
export function ProviderMark({ provider, size = 20 }: { provider: IntegrationProviderKey; size?: number }) {
    const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;
    if (provider === 'google') {
        return (
            <svg {...common}>
                <path
                    fill="currentColor"
                    d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1a6.2 6.2 0 0 1 0-12.4c1.9 0 3.2.8 3.9 1.5l2.7-2.6A9.9 9.9 0 0 0 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4 9.6-9.8 0-.7-.1-1.2-.2-1.9H12Z"
                />
            </svg>
        );
    }
    if (provider === 'microsoft') {
        return (
            <svg {...common}>
                <path fill="currentColor" d="M3 3h8.5v8.5H3zM12.5 3H21v8.5h-8.5zM3 12.5h8.5V21H3zM12.5 12.5H21V21h-8.5z" opacity="0.9" />
            </svg>
        );
    }
    return (
        <svg {...common}>
            <path fill="currentColor" d="M3 7.5A2.5 2.5 0 0 1 5.5 5h8A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 16.5v-9Zm14 2.2 4-2.7v10l-4-2.7V9.7Z" />
        </svg>
    );
}

/**
 * `2026-12-03` or an instant (`2026-12-03T…`, its business-clock day) → `3 Dec 2026` while the company formats are
 * not customized, else the company date format. Invalid input comes back unchanged.
 */
export function formatDay(iso: string | null | undefined): string {
    if (!iso) return '';
    if (iso.length === 10) return fmtDay(iso, { legacy: 'D MMM YYYY' });
    return fmtInstantDay(iso, { legacy: 'D MMM YYYY' }) || iso;
}

/** `3 Dec 2026, 10:42 am` on the business clock (the company formats once saved). Invalid input comes back unchanged. */
export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    return fmtInstant(iso, { legacyDate: 'D MMM YYYY', legacyTime: 'h:mm a' }) || iso;
}

/** Field errors from a failed save, keyed by their joined path (`settings.tenantId`, `email`). */
export function fieldErrorsOf(err: unknown): Record<string, string> {
    if (!(err instanceof ApiClientError)) return {};
    const out: Record<string, string> = {};
    for (const e of err.details?.errors ?? []) {
        const key = (e.path ?? []).join('.');
        if (key && !out[key]) out[key] = e.message;
    }
    return out;
}
