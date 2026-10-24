import React from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';

export const fieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: '#fff',
        fontSize: '0.85rem',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2563EB' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#2563EB',
            borderWidth: '1.5px',
        },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: '#2563EB' },
};

export interface FormFieldProps {
    /** Form field key; exposed as `data-field` so validation can scroll to and focus the control. */
    name?: string;
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    children: React.ReactNode;
    sx?: SxProps<Theme>;
}

export function FormField({ name, label, required, hint, children, sx }: FormFieldProps) {
    return (
        <Box data-field={name} sx={{ mb: 2, ...sx }}>
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
                    typeof hint === 'string' ? (
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                            {hint}
                        </Typography>
                    ) : (
                        hint
                    )
                )}
            </Box>
            {children}
        </Box>
    );
}

