'use client';

import React from 'react';
import { Box } from '@mui/material';

type ChipTone = 'default' | 'active' | 'inactive' | 'system' | 'custom' | 'neutral';

const TONES: Record<ChipTone, { color: string; backgroundColor: string; borderColor: string }> = {
    default: { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)', borderColor: 'var(--mui-palette-primary-softBorder)' },
    active: { color: 'var(--crm-emerald-700)', backgroundColor: 'var(--mui-palette-success-soft)', borderColor: 'var(--mui-palette-success-softBorder)' },
    inactive: { color: 'var(--mui-palette-text-secondary)', backgroundColor: 'var(--mui-palette-background-hover)', borderColor: 'var(--mui-palette-border-main)' },
    system: { color: 'var(--crm-violet-600)', backgroundColor: 'var(--crm-violet-50)', borderColor: 'var(--crm-violet-200)' },
    custom: { color: 'var(--crm-amber-700)', backgroundColor: 'var(--mui-palette-warning-soft)', borderColor: 'var(--mui-palette-warning-softBorder)' },
    neutral: { color: 'var(--crm-slate-600)', backgroundColor: 'var(--mui-palette-background-subtle)', borderColor: 'var(--mui-palette-border-main)' },
};

/** Small status pill matching the admin hub badges. */
export function StatusChip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
    return (
        <Box
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'center', px: 1, py: 0.2, borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid', ...TONES[tone] }}
        >
            {children}
        </Box>
    );
}
