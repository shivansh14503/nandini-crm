'use client';

import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';

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
    /** Optional status shown in a floating chip beside the actions. */
    status?: React.ReactNode;
}

/**
 * Floating form actions (Cancel + primary Save) pinned to the bottom-right of the viewport,
 * matching the record drawer's floating buttons. No footer bar.
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
                right: { xs: 16, md: 28 },
                bottom: { xs: 16, md: 24 },
                zIndex: 1200,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pointerEvents: 'none',
                '& > *': { pointerEvents: 'auto' },
            }}
        >
            {status && (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        height: 38,
                        px: 1.75,
                        borderRadius: 'var(--crm-radius-button)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        border: '1px solid var(--mui-palette-border-main)',
                        boxShadow: '0 4px 14px rgb(0 0 0 / 0.16)',
                    }}
                >
                    {status}
                </Box>
            )}

            <FloatingActionButton
                variant="outlined"
                label={cancelLabel}
                icon={<CloseIcon sx={{ fontSize: 18 }} />}
                onClick={onCancel}
                disabled={submitting || cancelDisabled}
                sx={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--mui-palette-error-main)',
                    borderColor: 'var(--mui-palette-error-softBorder)',
                    '&:hover': {
                        color: 'var(--mui-palette-error-main)',
                        backgroundColor: 'var(--mui-palette-error-soft)',
                        borderColor: 'var(--mui-palette-error-main)',
                    },
                }}
            />

            <FloatingActionButton
                variant="contained"
                label={saveLabel}
                tooltip={saveDisabled ? saveDisabledTooltip : undefined}
                icon={
                    isView ? (
                        <EditOutlinedIcon sx={{ fontSize: 18 }} />
                    ) : submitting ? (
                        <CircularProgress size={16} color="inherit" />
                    ) : (
                        <SaveOutlinedIcon sx={{ fontSize: 18 }} />
                    )
                }
                onClick={onSave}
                disabled={submitting || saveDisabled}
                sx={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                    '&:hover': {
                        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
                    },
                    // The gradient shorthand would otherwise hide MUI's disabled fill.
                    '&.Mui-disabled': {
                        background: 'var(--mui-palette-background-hover)',
                        color: 'var(--mui-palette-text-muted)',
                    },
                }}
            />
        </Box>
    );
}
