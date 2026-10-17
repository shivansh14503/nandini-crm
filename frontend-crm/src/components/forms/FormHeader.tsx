'use client';

import React from 'react';
import { Box, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { AppBreadcrumbs, type BreadcrumbItem } from '../common/AppBreadcrumbs';

export interface FormHeaderProps {
    breadcrumbItems?: BreadcrumbItem[];
    onDiscard: () => void;
    onSave?: () => void; // Deprecated: top save button removed per requirements
    submitting?: boolean;
    discardLabel?: string;
    extraActions?: React.ReactNode;
}

/**
 * Reusable Form Header with permanent breadcrumbs on the left
 * and Discard action on the right.
 */
export function FormHeader({
    breadcrumbItems,
    onDiscard,
    submitting = false,
    discardLabel = 'Discard',
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
            {/* Left: Permanent Breadcrumbs (automatic or custom) */}
            <AppBreadcrumbs items={breadcrumbItems} />

            {/* Right: Discard Button (and optional extra actions) */}
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={onDiscard}
                    disabled={submitting}
                    startIcon={<CloseIcon sx={{ fontSize: 16 }} />}
                    sx={{
                        borderColor: 'error.main',
                        color: 'error.main',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 2,
                        height: 36,
                        backgroundColor: '#fff',
                        '&:hover': {
                            borderColor: 'error.main',
                            backgroundColor: 'error.light',
                            color: '#fff',
                        },
                    }}
                >
                    {discardLabel}
                </Button>

                {extraActions}
            </Box>
        </Box>
    );
}
