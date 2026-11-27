'use client';

import React, { useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { solidButtonSx } from '@/components/profile/profileUi';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useSendAdminUserInvite } from '@/hooks/queries/useUserAdmin';
import type { AdminUserDto, SendInviteResult } from '@/types/userAdmin.types';
import { phoneDialogPaperSx, userLabel } from './userAdminUi';

/** How long an emailed set-password link works (the API's INVITE_TTL_HOURS). */
export const INVITE_LINK_HOURS = 72;

/**
 * Emails a user a new one-time set-password link: "Resend invite" for an Invited user, "Send password reset link"
 * for an active account (their current password keeps working until they use it). Older links stop working. When the
 * email can't be sent the API's reason is shown here and nothing changes, so the admin can fix it and try again.
 *
 * `initialError`: opened right after Add user when the invite email failed (the user is added, Invited); the dialog
 * then says so and offers to try again. Mount with a `key` per user so it starts fresh.
 */
export function SendInviteDialog({
    user,
    initialError,
    onClose,
    onSent,
}: {
    user: AdminUserDto | null;
    initialError?: string | null;
    onClose: () => void;
    onSent: (result: SendInviteResult) => void;
}) {
    const send = useSendAdminUserInvite();
    const [error, setError] = useState<string | null>(initialError ?? null);
    const name = user ? userLabel(user) : '';
    const invite = user?.invitePending ?? true;
    const afterAdd = Boolean(initialError);

    const submit = async () => {
        if (!user || send.isPending) return;
        setError(null);
        try {
            onSent(await send.mutateAsync(user.id));
        } catch (err) {
            setError(errorMessage(err, 'The email could not be sent.'));
        }
    };

    const title = afterAdd
        ? `${name} was added, but the invite email wasn’t sent`
        : invite
          ? `Resend the invite to ${name}?`
          : `Send ${name} a password reset link?`;

    return (
        <Dialog
            open={Boolean(user)}
            onClose={send.isPending ? undefined : onClose}
            maxWidth="xs"
            fullWidth
            aria-labelledby="send-invite-title"
            slotProps={{ paper: { sx: phoneDialogPaperSx } }}
        >
            <DialogTitle id="send-invite-title" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                {title}
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)', lineHeight: 1.55, overflowWrap: 'anywhere' }}>
                    {afterAdd ? 'They show as Invited and can’t sign in until they set a password. ' : ''}A one-time link goes to{' '}
                    <strong>{user?.email || 'their work email'}</strong>. It works once, for {INVITE_LINK_HOURS} hours, and any link sent before stops working.
                </Typography>
                {!invite && (
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 }}>
                        Their current password keeps working until they choose a new one. Choosing one signs them out everywhere else.
                    </Typography>
                )}
                {error && (
                    <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={onClose} disabled={send.isPending} sx={{ ...secondaryButtonSx, minHeight: 40, flex: { xs: 1, sm: 'none' } }}>
                    {afterAdd ? 'Close' : 'Cancel'}
                </Button>
                <Button
                    variant="contained"
                    onClick={() => void submit()}
                    disabled={send.isPending}
                    startIcon={send.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                    sx={solidButtonSx}
                >
                    {send.isPending ? 'Sending…' : afterAdd || error ? 'Try again' : invite ? 'Resend invite' : 'Send link'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
