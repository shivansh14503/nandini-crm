'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';

export const fieldLabelSx = { fontSize: '0.78rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.5, display: 'block' } as const;
export const hintSx = { fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mt: 0.75, lineHeight: 1.5 } as const;
export const buttonSize = { minHeight: 40 } as const;

export type Tone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

const TONES: Record<Tone, { color: string; backgroundColor: string; borderColor: string }> = {
    success: { color: 'var(--crm-emerald-700)', backgroundColor: 'var(--mui-palette-success-soft)', borderColor: 'var(--mui-palette-success-softBorder)' },
    error: { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)', borderColor: 'var(--mui-palette-error-softBorder)' },
    warning: { color: 'var(--crm-amber-700)', backgroundColor: 'var(--mui-palette-warning-soft)', borderColor: 'var(--mui-palette-warning-softBorder)' },
    info: { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)', borderColor: 'var(--mui-palette-primary-softBorder)' },
    neutral: { color: 'var(--mui-palette-text-secondary)', backgroundColor: 'var(--mui-palette-background-subtle)', borderColor: 'var(--mui-palette-border-main)' },
};

/** A small rounded status label. */
export function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 1,
                py: 0.25,
                borderRadius: '999px',
                border: '1px solid',
                fontSize: '0.72rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                ...TONES[tone],
            }}
        >
            {children}
        </Box>
    );
}

/** Label + value pair on a settings card. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 600 }}>{label}</Typography>
            <Box sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere', mt: 0.25 }}>{children}</Box>
        </Box>
    );
}
