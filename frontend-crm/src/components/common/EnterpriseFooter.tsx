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
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
                fontSize: '0.72rem',
                color: '#64748b',
                mt: 'auto',
                ...sx,
            }}
        >
            <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                &copy; 2026 Nandini Infosys Enterprise CRM. System Performance: Optimal (42ms).
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography
                    component="a"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    sx={{ fontSize: '0.72rem', color: '#64748b', textDecoration: 'none', '&:hover': { color: '#2563eb' } }}
                >
                    Organization Guidelines
                </Typography>
                <Typography sx={{ color: '#cbd5e1' }}>|</Typography>
                <Typography
                    component="a"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    sx={{ fontSize: '0.72rem', color: '#64748b', textDecoration: 'none', '&:hover': { color: '#2563eb' } }}
                >
                    GST Validation API
                </Typography>
                <Typography sx={{ color: '#cbd5e1' }}>|</Typography>
                <Typography
                    component="a"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    sx={{ fontSize: '0.72rem', color: '#64748b', textDecoration: 'none', '&:hover': { color: '#2563eb' } }}
                >
                    CRM Helpdesk
                </Typography>
            </Box>
        </Box>
    );
}
