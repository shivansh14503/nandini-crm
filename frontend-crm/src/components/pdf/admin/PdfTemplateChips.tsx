'use client';

import React from 'react';
import { Box } from '@mui/material';

type ChipTone = 'default' | 'active' | 'inactive' | 'system' | 'custom' | 'neutral';

const TONES: Record<ChipTone, { color: string; backgroundColor: string; borderColor: string }> = {
    default: { color: '#1d4ed8', backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
    active: { color: '#047857', backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
    inactive: { color: '#64748b', backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
    system: { color: '#7c3aed', backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
    custom: { color: '#b45309', backgroundColor: '#fffbeb', borderColor: '#fde68a' },
    neutral: { color: '#475569', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
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
