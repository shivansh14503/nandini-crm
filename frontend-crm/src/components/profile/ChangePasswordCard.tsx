'use client';

import React, { useId, useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { fieldSx } from '@/components/forms/FormField';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useChangePassword } from '@/hooks/queries/useProfile';
import { ApiClientError } from '@/services/apiClient';
import type { ProfileDto } from '@/types/profile.types';
import { formatDateTime } from '@/utils/date';
import { PASSWORD_MAX_LENGTH, PASSWORD_RULES, passwordPolicyIssue, passwordStrength, type PasswordStrengthLevel } from '@/utils/passwordPolicy';
import type { Notify } from './ProfileView';
import { ProfileCard, cardButtonLayoutSx, relativeInSentence, solidButtonSx } from './profileUi';

const STRENGTH_COLOR: Record<PasswordStrengthLevel, string> = {
    empty: 'var(--mui-palette-border-main)',
    weak: 'var(--mui-palette-error-main)',
    fair: 'var(--mui-palette-warning-main)',
    good: 'var(--mui-palette-success-main)',
    strong: 'var(--mui-palette-success-main)',
};

/** Password input with a show / hide button. */
function PasswordInput({
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

/** My Profile › Security › Change password. Other sessions are signed out by the API on success. */
export function ChangePasswordCard({ profile, notify }: { profile: ProfileDto; notify: Notify }) {
    const changePassword = useChangePassword();
    const [values, setValues] = useState(EMPTY);
    const [confirmTouched, setConfirmTouched] = useState(false);
    const [serverErrors, setServerErrors] = useState<{ currentPassword?: string; newPassword?: string }>({});
    const [formError, setFormError] = useState<string | null>(null);
    const checklistId = useId();

    const ctx = { username: profile.username, currentPassword: values.currentPassword };
    const policyIssue = passwordPolicyIssue(values.newPassword, ctx);
    const strength = passwordStrength(values.newPassword, ctx);
    const confirmMismatch = values.confirmPassword !== '' && values.confirmPassword !== values.newPassword;
    const canSubmit = values.currentPassword !== '' && values.newPassword !== '' && !policyIssue && values.confirmPassword === values.newPassword;
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
            const result = await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
            clear();
            const n = result.signedOutSessions;
            if (n === null) {
                notify('Password changed, but your other sessions could not be signed out. Sign them out below, or try again in a moment.', 'warning');
            } else {
                notify(n > 0 ? `Password changed. ${n} other session${n === 1 ? ' was' : 's were'} signed out.` : 'Password changed.');
            }
        } catch (err) {
            const code = err instanceof ApiClientError ? err.details?.code : undefined;
            const message = err instanceof Error && err.message ? err.message : 'Could not change your password.';
            if (code === 'WRONG_PASSWORD') setServerErrors({ currentPassword: message });
            else if (code === 'WEAK_PASSWORD') setServerErrors({ newPassword: message });
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
                <Box
                    id={checklistId}
                    sx={{
                        p: 1.5,
                        borderRadius: '10px',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                        border: '1px solid var(--mui-palette-border-light)',
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--crm-slate-700)', flex: 1, minWidth: 140 }}>
                            Your new password needs
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }} aria-live="polite">
                            <Box sx={{ display: 'flex', gap: 0.4 }} aria-hidden>
                                {[1, 2, 3, 4].map((segment) => (
                                    <Box
                                        key={segment}
                                        sx={{
                                            width: 22,
                                            height: 5,
                                            borderRadius: '3px',
                                            backgroundColor: segment <= strength.score ? STRENGTH_COLOR[strength.level] : 'var(--mui-palette-border-main)',
                                            transition: 'background-color 0.2s ease',
                                        }}
                                    />
                                ))}
                            </Box>
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)', minWidth: 44 }}>
                                {strength.label ? `${strength.label}` : ''}
                            </Typography>
                        </Box>
                    </Box>
                    <Box
                        component="ul"
                        sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}
                    >
                        {PASSWORD_RULES.map((rule) => {
                            const met = values.newPassword !== '' && rule.test(values.newPassword, ctx);
                            return (
                                <Box
                                    component="li"
                                    key={rule.key}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.75,
                                        fontSize: '0.78rem',
                                        color: met ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-secondary)',
                                    }}
                                >
                                    {met ? (
                                        <CheckCircleRoundedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-success-main)' }} />
                                    ) : (
                                        <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)' }} />
                                    )}
                                    <span>
                                        {rule.label}
                                        <Box component="span" sx={visuallyHidden}>
                                            {met ? ' (done)' : ' (not yet)'}
                                        </Box>
                                    </span>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>

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

const visuallyHidden = {
    position: 'absolute',
    // Strings, not numbers: in `sx` a width of 1 means 100%.
    width: '1px',
    height: '1px',
    p: 0,
    m: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
} as const;
