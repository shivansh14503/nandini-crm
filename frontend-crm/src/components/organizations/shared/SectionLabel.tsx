import React from 'react';
import { Box, Typography } from '@mui/material';

export interface SectionLabelProps {
    icon: React.ReactNode;
    label: string;
}

export function SectionLabel({ icon, label }: SectionLabelProps) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box sx={{ color: '#2563EB', display: 'flex' }}>{icon}</Box>
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
