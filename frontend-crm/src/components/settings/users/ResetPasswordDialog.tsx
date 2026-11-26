'use client';

import React, { useId, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import { PasswordInput } from '@/components/profile/ChangePasswordCard';
import { solidButtonSx } from '@/components/profile/profileUi';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useResetAdminUserPassword } from '@/hooks/queries/useUserAdmin';
import type { AdminUserDto, ResetPasswordResult } from '@/types/userAdmin.types';
import type { PasswordMode } from '@/validations/userAdmin.schema';
import { PasswordRulesChecklist, adminPasswordIssue, apiFieldErrors, phoneDialogPaperSx, userLabel } from './userAdminUi';


/** "Generate a temporary password" / "Set one" radio pair (Add user and Reset password). */
export function PasswordModeChoice({ value, onChange, disabled }: { value: PasswordMode; onChange: (mode: PasswordMode) => void; disabled?: boolean }) {
    const labelSx = { fontSize: '0.84rem', color: 'var(--crm-slate-700)' } as const;
    return (
        <RadioGroup value={value} onChange={(e) => onChange(e.target.value as PasswordMode)} sx={{ gap: 0.25 }}>
            <FormControlLabel
                value="generate"
                disabled={disabled}
                control={<Radio size="small" />}
                label={<Typography sx={labelSx}>Generate a temporary password</Typography>}
                sx={{ ml: 0, minHeight: 36 }}
            />
            <FormControlLabel
                value="set"
                disabled={disabled}
                control={<Radio size="small" />}
                label={<Typography sx={labelSx}>Set one myself</Typography>}
                sx={{ ml: 0, minHeight: 36 }}
            />
        </RadioGroup>
    );
}

/**
 * Resets another user's password: generated (shown once afterwards) or typed by the admin. The user must change it
 * at the next sign-in, and all their sessions are signed out. Mount with a `key` per user so it starts fresh.
 */
export function ResetPasswordDialog({
    user,
    onClose,
    onDone,
}: {
    user: AdminUserDto | null;
    onClose: () => void;
    onDone: (result: ResetPasswordResult) => void;
}) {
    const reset = useResetAdminUserPassword();
    const [mode, setMode] = useState<PasswordMode>('generate');
    const [password, setPassword] = useState('');
    const [touched, setTouched] = useState(false);
    const [fieldError, setFieldError] = useState('');
    const [formError, setFormError] = useState('');
    const checklistId = useId();
    const username = user?.username ?? '';
    const issue = mode === 'set' ? adminPasswordIssue(password, username) : null;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setTouched(true);
        if (issue || reset.isPending) return;
        setFieldError('');
        setFormError('');
        try {
            const result = await reset.mutateAsync({ id: user.id, password: mode === 'set' ? password : undefined });
            onDone(result);
        } catch (err) {
            const fields = apiFieldErrors(err);
            if (fields.password) setFieldError(fields.password);
            else setFormError(errorMessage(err, 'Could not reset the password.'));
        }
    };

    return (
        <Dialog
            open={Boolean(user)}
            onClose={reset.isPending ? undefined : onClose}
            maxWidth="xs"
            fullWidth
            aria-labelledby="reset-password-title"
            slotProps={{ paper: { sx: phoneDialogPaperSx } }}
        >
            <DialogTitle id="reset-password-title" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                Reset password{user ? ` for ${userLabel(user)}` : ''}?
            </DialogTitle>
            <Box component="form" noValidate onSubmit={submit} sx={{ display: 'contents' }}>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)', lineHeight: 1.55 }}>
                        They are <strong>signed out of every session</strong> and must choose a new password at their next sign-in.
                    </Typography>
                    <PasswordModeChoice value={mode} onChange={setMode} disabled={reset.isPending} />
                    {mode === 'set' && (
                        <>
                            {/* Lets password managers file the password under the right account. */}
                            <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
                            <PasswordInput
                                label="New password"
                                value={password}
                                onChange={(value) => {
                                    setPassword(value);
                                    setFieldError('');
                                }}
                                onBlur={() => setTouched(true)}
                                autoComplete="new-password"
                                disabled={reset.isPending}
                                describedBy={checklistId}
                                error={Boolean(fieldError) || (touched && Boolean(issue))}
                                helperText={fieldError || (touched && issue ? issue : undefined)}
                            />
                            <PasswordRulesChecklist id={checklistId} password={password} username={username} />
                        </>
                    )}
                    {formError && (
                        <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                            {formError}
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="outlined" onClick={onClose} disabled={reset.isPending} sx={{ ...secondaryButtonSx, minHeight: 40, flex: { xs: 1, sm: 'none' } }}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={reset.isPending || (mode === 'set' && touched && Boolean(issue))}
                        startIcon={reset.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                        sx={solidButtonSx}
                    >
                        {reset.isPending ? 'Resetting…' : 'Reset password'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
