'use client';

import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ConnectWithoutContactOutlinedIcon from '@mui/icons-material/ConnectWithoutContactOutlined';
import { FormProvider } from 'react-hook-form';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { AppToast } from '@/components/common/AppToast';
import { RaisedLayer } from '@/components/common/RaisedLayer';
import { useCreateReferral } from '@/hooks/queries/useReferrals';
import { getModuleColor } from '@/theme/moduleColors';
import type { Referral } from '@/types/referral.types';
import { ReferralFormFields, applyReferralSaveError, useReferralRhfForm } from './ReferralForm';

export interface ReferralQuickCreateDialogProps {
    open: boolean;
    onClose: () => void;
    /** Called with the created referral (the dialog closes itself). */
    onSaved?: (referral: Referral) => void;
}

/** Brand gradient with its own hover gradient (CLAUDE.md §2.D). */
const primaryButtonSx = {
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.85rem',
    height: 40,
    px: 2.4,
    borderRadius: '8px',
    color: '#ffffff',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': {
        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    },
} as const;

const outlinedButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.85rem',
    height: 40,
    px: 2,
    borderRadius: '8px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

function QuickCreateContent({ onClose, onSaved }: Omit<ReferralQuickCreateDialogProps, 'open'>) {
    const { methods, toast, showToast, closeToast, createSubmitHandler } = useReferralRhfForm('create');
    const createReferral = useCreateReferral();
    const color = getModuleColor('referrals');

    const submit = createSubmitHandler(async (values) => {
        try {
            // The mutation refreshes the referral lists, so the picker behind the dialog shows the new one too.
            const saved = await createReferral.mutateAsync(values);
            onSaved?.(saved);
            onClose();
        } catch (err: unknown) {
            showToast(applyReferralSaveError(err, methods), 'error');
        }
    });

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="referrals">
                <DialogTitle
                    component="div"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        py: 1.75,
                        px: { xs: 2, sm: 3 },
                        borderBottom: '1px solid var(--mui-palette-border-light)',
                        borderTop: `3px solid ${color.main}`,
                        background: `linear-gradient(180deg, ${color.soft} 0%, transparent 100%)`,
                    }}
                >
                    <Box
                        sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: color.soft,
                            border: `1px solid ${color.border}`,
                            color: color.main,
                            flexShrink: 0,
                        }}
                    >
                        <ConnectWithoutContactOutlinedIcon sx={{ fontSize: 20 }} />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography noWrap sx={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>
                            Create Referral Contact
                        </Typography>
                        <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                            An Active referral is picked as soon as it is saved.
                        </Typography>
                    </Box>
                    <Tooltip title="Close">
                        <IconButton
                            onClick={onClose}
                            aria-label="Close"
                            sx={{
                                width: 40,
                                height: 40,
                                border: '1px solid var(--mui-palette-border-main)',
                                borderRadius: '8px',
                                color: 'var(--mui-palette-text-secondary)',
                                '&:hover': {
                                    color: 'var(--mui-palette-error-main)',
                                    backgroundColor: 'var(--mui-palette-error-soft)',
                                    borderColor: 'var(--mui-palette-error-softBorder)',
                                },
                            }}
                        >
                            <CloseIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </Tooltip>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: '20px !important', pb: 2 }}>
                    <ReferralFormFields />
                </DialogContent>
                <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1, borderTop: '1px solid var(--mui-palette-border-light)', flexWrap: 'wrap' }}>
                    <Button onClick={onClose} sx={outlinedButtonSx}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={methods.formState.isSubmitting} variant="contained" sx={primaryButtonSx}>
                        {methods.formState.isSubmitting ? 'Saving...' : 'Save Referral'}
                    </Button>
                </DialogActions>
                <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />
            </FormConfigProvider>
        </FormProvider>
    );
}

/**
 * Quick create of a referral contact from the Referral Search popup: the referral form's fields (same labels and
 * rules, from the Referrals form configuration) in a dialog. Full screen on phones.
 */
export function ReferralQuickCreateDialog({ open, onClose, onSaved }: ReferralQuickCreateDialogProps) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
    return (
        <RaisedLayer>
            <Dialog
                open={open}
                onClose={onClose}
                fullScreen={fullScreen}
                fullWidth
                maxWidth="md"
                scroll="paper"
                slotProps={{
                    paper: {
                        sx: {
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            backgroundImage: 'none',
                            borderRadius: fullScreen ? 0 : '14px',
                            border: fullScreen ? 'none' : '1px solid var(--mui-palette-border-main)',
                        },
                    },
                }}
            >
                {/* Mounted per opening, so each opening starts from a blank form. */}
                {open && <QuickCreateContent onClose={onClose} onSaved={onSaved} />}
            </Dialog>
        </RaisedLayer>
    );
}
