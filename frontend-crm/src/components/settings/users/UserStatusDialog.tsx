'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { errorMessage, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useActivateAdminUser, useDeactivateAdminUser } from '@/hooks/queries/useUserAdmin';
import type { AdminUserDto, AdminUserStatusResult } from '@/types/userAdmin.types';
import { solidButtonSx } from '@/components/profile/profileUi';
import { phoneDialogPaperSx, userLabel } from './userAdminUi';

const dangerButtonSx = {
    ...primaryButtonSx,
    color: '#ffffff',
    // --crm-fill-red-* stays a deep red in both schemes, so white text stays readable (error-dark turns pale in dark mode).
    background: 'var(--crm-fill-red-700)',
    '&:hover': { background: 'var(--crm-fill-red-800)', boxShadow: 'none' },
    '&.Mui-disabled': { background: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-muted)' },
} as const;

/**
 * Confirms Deactivate / Activate. Deactivating signs the person out of every session and stops new sign-ins; their
 * records and direct reports stay as they are. Mount with a `key` per user so it starts fresh.
 */
export function UserStatusDialog({
    user,
    onClose,
    onDone,
}: {
    user: AdminUserDto | null;
    onClose: () => void;
    onDone: (result: AdminUserStatusResult, action: 'deactivate' | 'activate') => void;
}) {
    const deactivate = useDeactivateAdminUser();
    const activate = useActivateAdminUser();
    const [error, setError] = useState('');
    const action: 'deactivate' | 'activate' = user?.isActive ? 'deactivate' : 'activate';
    const pending = deactivate.isPending || activate.isPending;
    const name = user ? userLabel(user) : '';

    const confirm = async () => {
        if (!user) return;
        setError('');
        try {
            const result = action === 'deactivate' ? await deactivate.mutateAsync(user.id) : await activate.mutateAsync(user.id);
            onDone(result, action);
        } catch (err) {
            setError(errorMessage(err, action === 'deactivate' ? 'Could not deactivate the user.' : 'Could not activate the user.'));
        }
    };

    return (
        <Dialog
            open={Boolean(user)}
            onClose={pending ? undefined : onClose}
            maxWidth="xs"
            fullWidth
            aria-labelledby="user-status-title"
            slotProps={{ paper: { sx: phoneDialogPaperSx } }}
        >
            <DialogTitle id="user-status-title" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                {action === 'deactivate' ? `Deactivate ${name}?` : `Activate ${name}?`}
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, fontSize: '0.85rem', color: 'var(--crm-slate-600)' }}>
                {action === 'deactivate' ? (
                    <>
                        <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-700)', lineHeight: 1.55 }}>
                            They are <strong>signed out of every session now</strong> and can&apos;t sign in until they are activated again.
                        </Typography>
                        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.82rem', lineHeight: 1.5 }}>
                            <li>Their records keep them as owner; reassign them separately if needed.</li>
                            <li>
                                {user && user.directReportsCount > 0
                                    ? `${user.directReportsCount} ${user.directReportsCount === 1 ? 'person still reports' : 'people still report'} to them; change their manager when you can.`
                                    : 'Nobody reports to them.'}
                            </li>
                            <li>They are no longer offered as an assignee, and their email is free for someone else.</li>
                        </Box>
                    </>
                ) : (
                    <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-700)', lineHeight: 1.55 }}>
                        {user?.invitePending
                            ? 'They are offered as an assignee again. They still have to set their password from an invite link: use “Resend invite” afterwards (links sent before the deactivation no longer work).'
                            : 'They can sign in again with their current password and are offered as an assignee again.'}
                    </Typography>
                )}
                {error && (
                    <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={onClose} disabled={pending} sx={{ ...secondaryButtonSx, minHeight: 36, flex: { xs: 1, sm: 'none' } }}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={() => void confirm()}
                    disabled={pending}
                    startIcon={pending ? <CircularProgress size={14} color="inherit" /> : undefined}
                    sx={{ ...(action === 'deactivate' ? dangerButtonSx : solidButtonSx), minHeight: 36, flex: { xs: 1, sm: 'none' } }}
                >
                    {action === 'deactivate' ? 'Deactivate and sign out' : 'Activate'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
