'use client';

import React from 'react';
import { Box, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { AppBreadcrumbs, type BreadcrumbItem } from '../common/AppBreadcrumbs';

export interface FormHeaderProps {
    breadcrumbItems?: BreadcrumbItem[];
    onDiscard?: () => void; // Deprecated: Discard button removed per user requirements
    onSave?: () => void; // Deprecated: top save button removed per requirements
    submitting?: boolean;
    discardLabel?: string;
    extraActions?: React.ReactNode;
}

/**
 * Reusable Form Header with permanent breadcrumbs on the left.
 * Discard action is removed per requirements (Cancel is available in sticky footer).
 */
export function FormHeader({
    breadcrumbItems,
    extraActions,
}: FormHeaderProps) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2.5,
                flexWrap: 'wrap',
                gap: 2,
            }}
        >
            {/* Permanent Breadcrumbs (automatic or custom) */}
            <AppBreadcrumbs items={breadcrumbItems} />

            {extraActions && (
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    {extraActions}
                </Box>
            )}
        </Box>
    );
}
