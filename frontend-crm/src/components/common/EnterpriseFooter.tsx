'use client';

import React from 'react';
import { Box, Typography, SxProps, Theme } from '@mui/material';

export interface EnterpriseFooterProps {
    sx?: SxProps<Theme>;
}

export function EnterpriseFooter({ sx }: EnterpriseFooterProps) {
    return (
        <Box
            component="footer"
            sx={{
                px: { xs: 2, md: 3 },
                py: 1.5,
                borderTop: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
                fontSize: '0.72rem',
                color: 'var(--mui-palette-text-secondary)',
                mt: 'auto',
                ...sx,
            }}
        >
            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                &copy; 2026 Nandini Infosys Enterprise CRM. System Performance: Optimal (42ms).
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography
                    component="a"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', textDecoration: 'none', '&:hover': { color: 'var(--mui-palette-primary-main)' } }}
                >
                    Organization Guidelines
                </Typography>
                <Typography sx={{ color: 'var(--crm-slate-300)' }}>|</Typography>
                <Typography
                    component="a"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', textDecoration: 'none', '&:hover': { color: 'var(--mui-palette-primary-main)' } }}
                >
                    GST Validation API
                </Typography>
                <Typography sx={{ color: 'var(--crm-slate-300)' }}>|</Typography>
                <Typography
                    component="a"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', textDecoration: 'none', '&:hover': { color: 'var(--mui-palette-primary-main)' } }}
                >
                    CRM Helpdesk
                </Typography>
            </Box>
        </Box>
    );
}
