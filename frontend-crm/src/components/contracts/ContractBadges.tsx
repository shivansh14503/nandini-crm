'use client';

import React from 'react';
import { Box } from '@mui/material';

interface PillColors {
    bg: string;
    color: string;
    border: string;
    dot: string;
}

/** Built-in contract statuses, close to their score card colors (Sky / Yellow / Teal / Red). */
export const CONTRACT_STATUS_COLORS: Readonly<Record<string, PillColors>> = {
    'Not Started': { bg: 'var(--crm-sky-50)', color: 'var(--crm-sky-700)', border: 'var(--crm-sky-200)', dot: 'var(--crm-sky-500)' },
    'In Progress': { bg: 'var(--mui-palette-warning-soft)', color: 'var(--crm-amber-700)', border: 'var(--mui-palette-warning-softBorder)', dot: 'var(--crm-amber-500)' },
    Signed: { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)', dot: 'var(--crm-emerald-500)' },
    Expired: { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)', dot: 'var(--mui-palette-error-main)' },
};

/** Statuses an admin added to the dropdown. */
const FALLBACK: PillColors = { bg: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)', border: 'var(--mui-palette-border-main)', dot: 'var(--mui-palette-text-muted)' };

/** Contract status as a rounded pill (dot + label), as tickets show theirs. */
export function ContractStatusPill({ status }: { status: string }) {
    if (!status) return <Box component="span" sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-muted)' }}>-</Box>;
    const colors = CONTRACT_STATUS_COLORS[status] ?? FALLBACK;
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.6,
                px: 0.9,
                py: 0.25,
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                backgroundColor: colors.bg,
                color: colors.color,
                border: `1px solid ${colors.border}`,
            }}
        >
            <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.dot }} />
            {status}
        </Box>
    );
}
