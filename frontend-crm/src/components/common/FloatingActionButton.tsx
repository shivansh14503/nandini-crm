'use client';

import React from 'react';
import { Box, Button, Tooltip, type SxProps, type Theme } from '@mui/material';

export interface FloatingActionButtonProps {
    label: React.ReactNode;
    icon?: React.ReactNode;
    tooltip?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant: 'text' | 'outlined' | 'contained';
    sx?: SxProps<Theme> | object;
}

/**
 * Floating action button (icon + label) used by drawers and forms in place of a footer bar.
 * Corner radius comes from the app-wide `--crm-radius-button` token (globals.css).
 */
export function FloatingActionButton({ label, icon, tooltip, onClick, disabled, variant, sx }: FloatingActionButtonProps) {
    const button = (
        <Box component="span" sx={{ display: 'inline-flex' }}>
            <Button
                variant={variant}
                size="small"
                onClick={onClick}
                disabled={disabled}
                sx={{
                    // Opaque fallback so outlined buttons never float see-through over content; caller sx wins.
                    ...(variant !== 'contained' ? { backgroundColor: 'var(--mui-palette-background-paper)' } : {}),
                    ...(sx as object),
                    minWidth: 38,
                    height: 38,
                    px: 1.75,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    boxShadow: '0 4px 14px rgb(0 0 0 / 0.16)',
                    transition: 'all 0.2s ease',
                    '& .MuiButton-startIcon': { m: 0, display: 'inline-flex' },
                }}
            >
                {icon}
                <Box component="span" sx={{ display: 'inline-block', ml: icon ? 1 : 0 }}>
                    {label}
                </Box>
            </Button>
        </Box>
    );
    return tooltip ? <Tooltip title={tooltip}>{button}</Tooltip> : button;
}
