'use client';

import React from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useSectionLabelOverride } from '@/context/FormConfigContext';

export interface SectionLabelProps {
    icon?: React.ReactNode;
    label: string;
    sx?: SxProps<Theme>;
}

/** Section heading; inside a FormConfigProvider an admin-renamed section shows its new label. */
export function SectionLabel({ icon, label: baseLabel, sx }: SectionLabelProps) {
    const label = useSectionLabelOverride(baseLabel);
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ...sx }}>
            {icon && <Box sx={{ color: '#2563EB', display: 'flex' }}>{icon}</Box>}
            <Typography
                variant="subtitle2"
                sx={{
                    fontWeight: 700,
                    color: '#1e3a5f',
                    fontSize: '0.82rem',
                    letterSpacing: '0.02em',
                }}
            >
                {label}
            </Typography>
        </Box>
    );
}
