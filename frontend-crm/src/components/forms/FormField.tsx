import React from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';

export interface FormFieldProps {
    label: string;
    required?: boolean;
    hint?: string;
    children: React.ReactNode;
    sx?: SxProps<Theme>;
}

export function FormField({ label, required, hint, children, sx }: FormFieldProps) {
    return (
        <Box sx={{ mb: 2, ...sx }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 600,
                        color: '#374151',
                        fontSize: '0.82rem',
                    }}
                >
                    {label}
                    {required && (
                        <Box component="span" sx={{ color: '#ef4444', ml: 0.4 }}>
                            *
                        </Box>
                    )}
                </Typography>
                {hint && (
                    <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                        {hint}
                    </Typography>
                )}
            </Box>
            {children}
        </Box>
    );
}
