'use client';

import React from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import { AppBreadcrumbs, type BreadcrumbItem } from './AppBreadcrumbs';

export interface AppBreadcrumbsBarProps {
    items?: BreadcrumbItem[];
    actions?: React.ReactNode;
    sx?: SxProps<Theme>;
}

export function AppBreadcrumbsBar({ items, actions, sx }: AppBreadcrumbsBarProps) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
                mb: 2,
                ...sx,
            }}
        >
            {/* Automatic or custom permanent breadcrumbs */}
            <AppBreadcrumbs items={items} />

            {/* Optional right-aligned actions */}
            {actions && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    {actions}
                </Box>
            )}
        </Box>
    );
}
