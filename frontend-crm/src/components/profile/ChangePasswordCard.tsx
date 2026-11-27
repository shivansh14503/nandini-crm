'use client';

import React, { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { PasswordRulesChecklist } from '@/components/common/PasswordRulesChecklist';
import { fieldSx } from '@/components/forms/FormField';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { useChangePassword } from '@/hooks/queries/useProfile';
import { ApiClientError } from '@/services/apiClient';
import type { ProfileDto } from '@/types/profile.types';
import { formatDateTime } from '@/utils/date';
import { PASSWORD_MAX_LENGTH, passwordPolicyIssue, type PasswordPolicyContext } from '@/utils/passwordPolicy';
import type { Notify } from './ProfileView';
import { ProfileCard, cardButtonLayoutSx, relativeInSentence, solidButtonSx } from './profileUi';

/** Password input with a show / hide button (also used by Admin › Users to set a user's password). */
export function PasswordInput({
    label,
    value,
    onChange,
    onBlur,
    autoComplete,
    error,
    helperText,
    disabled,
    describedBy,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    autoComplete: string;
    error?: boolean;
    helperText?: React.ReactNode;
    disabled?: boolean;
    describedBy?: string;
}) {
    const [visible, setVisible] = useState(false);
    const id = useId();
    // Setting aria-describedby on the input replaces the TextField's own link to its helper text (`${id}-helper-text`),
    // so both are listed: a server error such as WEAK_PASSWORD must still be announced.
    const ariaDescribedBy = [describedBy, helperText ? `${id}-helper-text` : null].filter(Boolean).join(' ');
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography component="label" htmlFor={id} sx={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.5 }}>
                {label}
            </Typography>
            <TextField
                id={id}
                fullWidth
                size="small"
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                disabled={disabled}
                error={error}
                helperText={helperText}
                sx={fieldSx}
                slotProps={{
                    htmlInput: {
                        maxLength: PASSWORD_MAX_LENGTH,
                        autoComplete,
                        spellCheck: false,
                        autoCapitalize: 'off',
                        ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
                    },
                    input: {
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton
                                    aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                                    aria-pressed={visible}
                                    // Out of the Tab order: Tab goes from this field straight to the next one.
                                    tabIndex={-1}
                                    // Keeps the caret in the field when the eye is clicked.
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setVisible((v) => !v)}
                                    edge="end"
                                    sx={{
                                        width: 40,
                                        height: 40,
                                        color: 'var(--mui-palette-text-muted)',
                                        transition: 'color 0.15s ease, background-color 0.15s ease',
                                        '&:hover': { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                                    }}
                                >
                                    {visible ? <VisibilityOffOutlinedIcon sx={{ fontSize: 19 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 19 }} />}
                                </IconButton>
                            </InputAdornment>
                        ),
                    },
                }}
            />
        </Box>
    );
}

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * My Profile › Security › Change password. Other sessions are signed out by the API on success.
 *
 * First login / forced change (a new user or an admin reset, signed in a moment ago with the temporary password): the
 * current password isn't asked for again, and the user goes on to the dashboard once the new one is saved. Should the
 * API still ask for it (a session opened before the reset), the field is shown.
 */
export function ChangePasswordCard({ profile, notify }: { profile: ProfileDto; notify: Notify }) {
    const changePassword = useChangePassword();
    const router = useRouter();
    const { user } = useAuth();
    const forced = Boolean(user?.mustChangePassword && profile.mustChangePassword);
    const [currentAsked, setCurrentAsked] = useState(false);
    const askCurrent = !forced || currentAsked;
    const [values, setValues] = useState(EMPTY);
    const [confirmTouched, setConfirmTouched] = useState(false);
    const [serverErrors, setServerErrors] = useState<{ currentPassword?: string; newPassword?: string }>({});
    const [formError, setFormError] = useState<string | null>(null);
    const checklistId = useId();

    const ctx: PasswordPolicyContext = { username: profile.username, currentPassword: values.currentPassword };
    const policyIssue = passwordPolicyIssue(values.newPassword, ctx);
    const confirmMismatch = values.confirmPassword !== '' && values.confirmPassword !== values.newPassword;
    const canSubmit = (!askCurrent || values.currentPassword !== '') && values.newPassword !== '' && !policyIssue && values.confirmPassword === values.newPassword;
    const saving = changePassword.isPending;
    const touchedAny = values.currentPassword !== '' || values.newPassword !== '' || values.confirmPassword !== '';

    const set = (key: keyof typeof EMPTY) => (value: string) => {
        setValues((v) => ({ ...v, [key]: value }));
        if (key !== 'confirmPassword') setServerErrors((e) => ({ ...e, [key]: undefined }));
        setFormError(null);
    };

    const clear = () => {
        setValues(EMPTY);
        setConfirmTouched(false);
        setServerErrors({});
        setFormError(null);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setConfirmTouched(true);
        if (!canSubmit || saving) return;
        try {
            const wasRequired = Boolean(user?.mustChangePassword || profile.mustChangePassword);
            const result = await changePassword.mutateAsync({
                ...(askCurrent || values.currentPassword ? { currentPassword: values.currentPassword } : {}),
                newPassword: values.newPassword,
            });
            clear();
            const n = result.signedOutSessions;
            if (wasRequired) {
                notify('Password changed. You can now use the CRM.');
                router.push(ROUTES.DASHBOARD);
            } else if (n === null) {
                notify('Password changed, but your other sessions could not be signed out. Sign them out below, or try again in a moment.', 'warning');
            } else {
                notify(n > 0 ? `Password changed. ${n} other session${n === 1 ? ' was' : 's were'} signed out.` : 'Password changed.');
            }
        } catch (err) {
            const code = err instanceof ApiClientError ? err.details?.code : undefined;
            const message = err instanceof Error && err.message ? err.message : 'Could not change your password.';
            const onCurrent = err instanceof ApiClientError && err.details?.errors?.some((e) => e.path?.[0] === 'currentPassword');
            if (code === 'WRONG_PASSWORD' || onCurrent) {
                setCurrentAsked(true);
                setServerErrors({ currentPassword: message });
            } else if (code === 'WEAK_PASSWORD') setServerErrors({ newPassword: message });
            else setFormError(message);
        }
    };

    const changedAt = profile.passwordChangedAt;

    return (
        <ProfileCard
            id="change-password"
            icon={<LockResetRoundedIcon fontSize="small" />}
            title="Change password"
            description={
                changedAt ? (
                    <span title={formatDateTime(changedAt)}>Password last changed {relativeInSentence(changedAt)}.</span>
                ) : (
                    'Never changed in the new CRM.'
                )
            }
        >
            <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Lets password managers save the new password against the right account. */}
                <input type="text" name="username" autoComplete="username" value={profile.username} readOnly hidden />

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, columnGap: 3, rowGap: 2 }}>
                    {askCurrent && (
                        <>
                            <PasswordInput
                                label="Current password"
                                value={values.currentPassword}
                                onChange={set('currentPassword')}
                                autoComplete="current-password"
                                disabled={saving}
                                error={Boolean(serverErrors.currentPassword)}
                                helperText={serverErrors.currentPassword}
                            />
                            <Box sx={{ display: { xs: 'none', md: 'block' } }} />
                        </>
                    )}
                    <PasswordInput
                        label="New password"
                        value={values.newPassword}
                        onChange={set('newPassword')}
                        autoComplete="new-password"
                        disabled={saving}
                        describedBy={checklistId}
                        error={Boolean(serverErrors.newPassword)}
                        helperText={serverErrors.newPassword}
                    />
                    <PasswordInput
                        label="Confirm new password"
                        value={values.confirmPassword}
                        onChange={set('confirmPassword')}
                        onBlur={() => setConfirmTouched(true)}
                        autoComplete="new-password"
                        disabled={saving}
                        error={confirmTouched && (confirmMismatch || (values.confirmPassword === '' && values.newPassword !== ''))}
                        helperText={
                            confirmTouched && confirmMismatch
                                ? 'The passwords do not match.'
                                : confirmTouched && values.confirmPassword === '' && values.newPassword !== ''
                                  ? 'Type the new password again.'
                                  : undefined
                        }
                    />
                </Box>

                {/* Live policy checklist + strength hint */}
                <PasswordRulesChecklist id={checklistId} password={values.newPassword} context={ctx} audience="self" showStrength />

                {formError && (
                    <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                        {formError}
                    </Alert>
                )}

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-muted)', flex: '1 1 240px' }}>
                        You stay signed in here. Your other sessions are signed out.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: { xs: '1 1 100%', sm: 'none' } }}>
                        <Button variant="outlined" onClick={clear} disabled={!touchedAny || saving} sx={{ ...secondaryButtonSx, ...cardButtonLayoutSx }}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={!canSubmit || saving}
                            startIcon={saving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                            sx={solidButtonSx}
                        >
                            {saving ? 'Changing…' : 'Change password'}
                        </Button>
                    </Box>
                </Box>
            </Box>
        </ProfileCard>
    );
}
