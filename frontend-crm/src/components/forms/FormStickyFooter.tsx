'use client';

import React from 'react';
import { Box, Button, Typography, CircularProgress, Tooltip } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

export interface FormStickyFooterProps {
    onCancel: () => void;
    onSave: () => void;
    onSaveAndNew?: () => void; // Deprecated: removed per requirements
    submitting?: boolean;
    saveLabel?: string;
    cancelLabel?: string;
    showSaveAndNew?: boolean; // Deprecated: removed per requirements
    mode?: 'create' | 'edit' | 'view';
    /** Disables the primary action; `saveDisabledTooltip` explains why. */
    saveDisabled?: boolean;
    saveDisabledTooltip?: string;
    /** Disables the secondary (cancel) action. */
    cancelDisabled?: boolean;
    /** Replaces the default status text on the left. */
    status?: React.ReactNode;
}

/**
 * Standard enterprise sticky bottom action bar for forms.
 * Displays local buffer status indicator, Cancel, and primary Save action.
 */
export function FormStickyFooter({
    onCancel,
    onSave,
    submitting = false,
    saveLabel = 'Save Record',
    cancelLabel = 'Cancel',
    mode = 'create',
    saveDisabled = false,
    saveDisabledTooltip,
    cancelDisabled = false,
    status,
}: FormStickyFooterProps) {
    const isView = mode === 'view';
    return (
        <Box
            sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'var(--mui-palette-background-paper)',
                borderTop: '1px solid var(--mui-palette-border-main)',
                px: { xs: 2, md: 4 },
                py: 1.5,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 1200,
                boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
            }}
        >
            {/* Left: CRM Staged status indicator */}
            {status ? (
                status
            ) : isView ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <VisibilityOutlinedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-secondary)' }} />
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 500 }}>
                        Read-only view
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e' }} />
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 500 }}>
                        All changes staged locally in CRM memory buffer
                    </Typography>
                </Box>
            )}

            {/* Right: Actions (Cancel & Save) */}
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={onCancel}
                    disabled={submitting || cancelDisabled}
                    sx={{
                        borderColor: 'error.main',
                        color: 'error.main',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 2.5,
                        height: 36,
                        '&:hover': {
                            borderColor: 'error.main',
                            backgroundColor: 'error.light',
                            color: '#fff',
                        },
                    }}
                >
                    {cancelLabel}
                </Button>

                <Tooltip title={saveDisabled ? saveDisabledTooltip ?? '' : ''}>
                    <span>
                <Button
                    variant="contained"
                    size="small"
                    onClick={onSave}
                    disabled={submitting || saveDisabled}
                    startIcon={
                        isView ? (
                            <EditOutlinedIcon sx={{ fontSize: 16 }} />
                        ) : submitting ? (
                            <CircularProgress size={14} color="inherit" />
                        ) : undefined
                    }
                    sx={{
                        background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        textTransform: 'none',
                        fontWeight: 700,
                        px: 3,
                        height: 36,
                        boxShadow: '0 2px 8px rgb(var(--crm-accent-rgb) / 0.3)',
                        '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)' },
                    }}
                >
                    {saveLabel}
                </Button>
                    </span>
                </Tooltip>
            </Box>
        </Box>
    );
}
