'use client';

import React from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useIsSectionDeleted, useSectionLabelOverride } from '@/context/FormConfigContext';

export interface SectionLabelProps {
    icon?: React.ReactNode;
    label: string;
    sx?: SxProps<Theme>;
}

/**
 * Section heading; inside a FormConfigProvider an admin-renamed section shows its new label, and a section the
 * admin deleted renders nothing (so no orphaned heading is left above its hidden fields).
 */
export function SectionLabel({ icon, label: baseLabel, sx }: SectionLabelProps) {
    const label = useSectionLabelOverride(baseLabel);
    const deleted = useIsSectionDeleted(baseLabel);
    if (deleted) return null;
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ...sx }}>
            {icon && <Box sx={{ color: 'var(--crm-text-blue-600)', display: 'flex' }}>{icon}</Box>}
            <Typography
                variant="subtitle2"
                sx={{
                    fontWeight: 700,
                    color: 'var(--mui-palette-text-primary)',
                    fontSize: '0.82rem',
                    letterSpacing: '0.02em',
                }}
            >
                {label}
            </Typography>
        </Box>
    );
}
