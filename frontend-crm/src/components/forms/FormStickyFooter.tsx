'use client';

import React from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';

export interface FormStickyFooterProps {
    onCancel: () => void;
    onSave: () => void;
    onSaveAndNew?: () => void; // Deprecated: removed per requirements
    submitting?: boolean;
    saveLabel?: string;
    cancelLabel?: string;
    showSaveAndNew?: boolean; // Deprecated: removed per requirements
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
}: FormStickyFooterProps) {
    return (
        <Box
            sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: '#fff',
                borderTop: '1px solid #e2e8f0',
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e' }} />
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                    All changes staged locally in CRM memory buffer
                </Typography>
            </Box>

            {/* Right: Actions (Cancel & Save) */}
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={onCancel}
                    disabled={submitting}
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

                <Button
                    variant="contained"
                    size="small"
                    onClick={onSave}
                    disabled={submitting}
                    startIcon={
                        submitting ? (
                            <CircularProgress size={14} color="inherit" />
                        ) : undefined
                    }
                    sx={{
                        background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        textTransform: 'none',
                        fontWeight: 700,
                        px: 3,
                        height: 36,
                        boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                        '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)' },
                    }}
                >
                    {saveLabel}
                </Button>
            </Box>
        </Box>
    );
}
