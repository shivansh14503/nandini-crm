'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { PasswordInput } from '@/components/profile/ChangePasswordCard';
import { phoneDialogPaperSx, solidButtonSx } from '@/components/profile/profileUi';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';

const discardButtonSx = {
    ...secondaryButtonSx,
    minHeight: 40,
    flex: { xs: 1, sm: 'none' },
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

/**
 * The sign-in form inside the dialog. Mounted from the time the dialog opens until its exit animation ends, so every
 * expiry starts blank and the dialog keeps its body while it fades out.
 */
function ReauthForm({ username }: { username: string }) {
    const { reauthenticate, continueToPasswordChange, endExpiredSession } = useAuth();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    // Signed in, but an admin reset the password: the page can't be saved until it is changed (the API refuses with
    // 403), and the password-change gate replaces the page, so say so before the draft goes.
    const [mustChange, setMustChange] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!password) {
            setError('Password is required.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            // Same account only (the username is fixed, and AuthContext checks the id): the draft belongs to this user.
            const outcome = await reauthenticate(password);
            if (outcome === 'mustChangePassword') {
                setMustChange(true);
                setBusy(false);
            }
        } catch (err) {
            setError(errorMessage(err, 'Sign-in failed. Please try again.'));
            setBusy(false);
        }
    };

    if (mustChange) {
        return (
            <>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Alert severity="warning" sx={{ borderRadius: '10px', fontSize: '0.82rem' }}>
                        An administrator reset your password. You must change it before you can keep working, and{' '}
                        <strong>the unsaved changes on this page can&apos;t be saved</strong>: they are lost when you continue.
                    </Alert>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="contained" onClick={continueToPasswordChange} sx={{ ...solidButtonSx, flex: { xs: 1, sm: 'none' } }}>
                        Change password
                    </Button>
                </DialogActions>
            </>
        );
    }

    return (
        <Box component="form" noValidate onSubmit={submit} sx={{ display: 'contents' }}>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)', lineHeight: 1.55 }}>
                    You were signed out (the session expired or was ended). <strong>Your unsaved changes are still on this page.</strong>{' '}
                    Sign in again to keep working, then save. (If an administrator reset your password, the changes can&apos;t
                    be saved until it is changed.)
                </Typography>
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.5 }}>User name</Typography>
                    <Typography sx={{ fontSize: '0.88rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{username}</Typography>
                    {/* Lets password managers fill the password for the right account. */}
                    <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
                </Box>
                <PasswordInput
                    label="Password"
                    value={password}
                    onChange={(value) => {
                        setPassword(value);
                        setError('');
                    }}
                    autoComplete="current-password"
                    disabled={busy}
                />
                {error && (
                    <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                        {error}
                    </Alert>
                )}
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 }}>
                    Signed in again in another tab? Come back to this tab and it carries on by itself.
                </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={endExpiredSession} disabled={busy} sx={discardButtonSx}>
                    Discard changes
                </Button>
                <Button
                    type="submit"
                    variant="contained"
                    disabled={busy}
                    startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
                    sx={{ ...solidButtonSx, flex: { xs: 1, sm: 'none' } }}
                >
                    {busy ? 'Signing in…' : 'Sign in'}
                </Button>
            </DialogActions>
        </Box>
    );
}

/**
 * Shown when the session ends mid-session (any API 401) while unsaved edits are on screen (AuthContext's
 * `sessionExpired`). It blocks the page without unmounting it: the user signs in again here (or in another tab) and
 * saves, or discards the edits and goes to the login page. Mounted once in the root layout.
 */
export function SessionExpiredDialog() {
    const { user, sessionExpired } = useAuth();
    const open = sessionExpired && Boolean(user);
    // The account the form is for, kept until the exit animation ends (after a sign-in or a discard the dialog fades
    // out with its body instead of shrinking to the title). Cleared on exit, so the next expiry starts blank.
    const [formFor, setFormFor] = useState<string | null>(null);
    if (open && user && formFor !== user.username) setFormFor(user.username);

    return (
        <Dialog
            open={open}
            // Blocking: no onClose, so neither the backdrop nor Escape closes it (the page cannot save until the user
            // signs in again or discards).
            maxWidth="xs"
            fullWidth
            aria-labelledby="session-expired-title"
            slotProps={{ paper: { sx: phoneDialogPaperSx }, transition: { onExited: () => setFormFor(null) } }}
        >
            <DialogTitle id="session-expired-title" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                Your session has ended
            </DialogTitle>
            {formFor ? <ReauthForm username={formFor} /> : null}
        </Dialog>
    );
}
