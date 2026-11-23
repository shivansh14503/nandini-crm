'use client';

import React from 'react';
import { Box, Button, CircularProgress, Tooltip, type SxProps, type Theme } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

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
    /** Optional status shown at the left of the bar. */
    status?: React.ReactNode;
    /** `next`: the primary action moves on to the form's next step (arrow after the label) instead of saving. */
    saveKind?: 'save' | 'next';
    /** Replaces the Save icon (e.g. Convert Lead's convert icon). */
    saveIcon?: React.ReactNode;
    /** Extra styling for the primary action, applied over the default brand gradient. */
    saveSx?: SxProps<Theme>;
}

/**
 * Form actions (Cancel + primary Save) right-aligned under the form, in the page flow with no bar behind them:
 * they scroll with the form and show once you reach the bottom, never covering a side panel.
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
    saveKind = 'save',
    saveIcon,
    saveSx,
}: FormStickyFooterProps) {
    const isView = mode === 'view';
    const isNext = !isView && saveKind === 'next';
    const saveButton = (
        <Button
            variant="contained"
            size="small"
            startIcon={
                isNext ? undefined : isView ? (
                    <EditOutlinedIcon sx={{ fontSize: 18 }} />
                ) : submitting ? (
                    <CircularProgress size={16} color="inherit" />
                ) : (
                    (saveIcon ?? <SaveOutlinedIcon sx={{ fontSize: 18 }} />)
                )
            }
            endIcon={isNext ? <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} /> : undefined}
            onClick={onSave}
            disabled={submitting || saveDisabled}
            sx={[{
                height: 36,
                px: 2,
                fontSize: '0.82rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: '#ffffff',
                background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
                '&:hover': {
                    background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
                    boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
                },
                // The gradient shorthand would otherwise hide MUI's disabled fill.
                '&.Mui-disabled': {
                    background: 'var(--mui-palette-background-hover)',
                    color: 'var(--mui-palette-text-muted)',
                    boxShadow: 'none',
                },
            }, ...(Array.isArray(saveSx) ? saveSx : saveSx ? [saveSx] : [])]}
        >
            {saveLabel}
        </Button>
    );

    return (
        <Box
            role="toolbar"
            aria-label="Form actions"
            sx={{
                mt: 2,
                display: 'flex',
                alignItems: 'center',
                // Narrow screens: the buttons drop below the status instead of squeezing it.
                flexWrap: 'wrap',
                gap: 1,
            }}
        >
            {status && <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>{status}</Box>}

            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CloseIcon sx={{ fontSize: 18 }} />}
                    onClick={onCancel}
                    disabled={submitting || cancelDisabled}
                    sx={{
                        height: 36,
                        px: 2,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        color: 'var(--mui-palette-error-main)',
                        borderColor: 'var(--mui-palette-error-softBorder)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        '&:hover': {
                            color: 'var(--mui-palette-error-main)',
                            backgroundColor: 'var(--mui-palette-error-soft)',
                            borderColor: 'var(--mui-palette-error-main)',
                        },
                    }}
                >
                    {cancelLabel}
                </Button>

                {saveDisabled && saveDisabledTooltip ? (
                    <Tooltip title={saveDisabledTooltip}>
                        <span>{saveButton}</span>
                    </Tooltip>
                ) : (
                    saveButton
                )}
            </Box>
        </Box>
    );
}
