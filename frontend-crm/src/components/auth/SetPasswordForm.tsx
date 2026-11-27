"use client";

import React, { useEffect, useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import { PasswordRulesChecklist } from '@/components/common/PasswordRulesChecklist';
import { PasswordInput } from '@/components/profile/ChangePasswordCard';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { ApiClientError } from '@/services/apiClient';
import { authService } from '@/services/auth.service';
import type { SetPasswordLinkInfo } from '@/types/auth.types';
import { formatDateTime } from '@/utils/date';
import { linkPasswordIssue } from '@/utils/passwordPolicy';

/** The API's one answer for any link that can't be used (unknown, expired, used, revoked, account deactivated). */
const INVALID_INVITE = 'INVALID_INVITE';
const INVALID_LINK_TEXT = 'This link is no longer valid. It may have expired or already been used. Ask your administrator to send a new one.';

type LinkState = { kind: 'checking' } | { kind: 'ready'; info: SetPasswordLinkInfo } | { kind: 'invalid'; message: string } | { kind: 'error'; message: string };

const codeOf = (err: unknown) => (err instanceof ApiClientError ? err.details?.code : undefined);
const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const solidSx = {
    minHeight: 46,
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: 600,
    textTransform: 'none',
    color: '#ffffff',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)' },
    '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
    '&.Mui-disabled': { background: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-muted)', boxShadow: 'none' },
} as const;

const outlinedSx = {
    minHeight: 44,
    borderRadius: '10px',
    textTransform: 'none',
    fontWeight: 600,
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

/**
 * The page an emailed set-password link opens (`/set-password?token=…`): a new user's invite, or an admin-sent
 * password reset. Checks the link, asks for the new password twice (the app's password rules, live), then sets it,
 * which also signs the user in, and opens the dashboard. No current password and no prior sign-in. The token is read
 * once and dropped from the address bar, so it doesn't linger in the history or on a shared screen.
 */
export function SetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { setPasswordFromLink } = useAuth();
    // Read once: the address bar loses it just below.
    const [token] = useState(() => searchParams.get('token')?.trim() ?? '');
    const [link, setLink] = useState<LinkState>(() => (token ? { kind: 'checking' } : { kind: 'invalid', message: INVALID_LINK_TEXT }));
    const [attempt, setAttempt] = useState(0);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [confirmTouched, setConfirmTouched] = useState(false);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const checklistId = useId();

    useEffect(() => {
        if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname);
    }, []);

    useEffect(() => {
        if (!token) return;
        let active = true;
        authService
            .verifySetPasswordLink(token)
            .then((info) => {
                if (active) setLink({ kind: 'ready', info });
            })
            .catch((err: unknown) => {
                if (!active) return;
                if (codeOf(err) === INVALID_INVITE) setLink({ kind: 'invalid', message: messageOf(err, INVALID_LINK_TEXT) });
                else setLink({ kind: 'error', message: messageOf(err, 'Could not check the link. Please try again.') });
            });
        return () => {
            active = false;
        };
    }, [token, attempt]);

    if (link.kind === 'checking') {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 4 }} aria-live="polite">
                <CircularProgress size={28} sx={{ color: 'var(--crm-text-blue-600)' }} />
                <Typography sx={{ fontSize: '14px', color: 'var(--mui-palette-text-secondary)' }}>Checking your link…</Typography>
            </Box>
        );
    }

    if (link.kind === 'invalid' || link.kind === 'error') {
        const invalid = link.kind === 'invalid';
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }} role="alert">
                <Box
                    aria-hidden
                    sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'var(--mui-palette-error-soft)',
                        border: '1px solid var(--mui-palette-error-softBorder)',
                        color: 'var(--mui-palette-error-main)',
                    }}
                >
                    <LinkOffRoundedIcon />
                </Box>
                <Typography component="h1" sx={{ fontSize: '20px', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                    {invalid ? 'This link can’t be used' : 'Something went wrong'}
                </Typography>
                <Typography sx={{ fontSize: '14px', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.6 }}>{link.message}</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', width: '100%', mt: 1 }}>
                    {!invalid && (
                        <Button
                            variant="contained"
                            onClick={() => {
                                setLink({ kind: 'checking' });
                                setAttempt((n) => n + 1);
                            }}
                            sx={{ ...solidSx, flex: { xs: '1 1 100%', sm: 'none' }, px: 3 }}
                        >
                            Try again
                        </Button>
                    )}
                    <Button variant="outlined" onClick={() => router.push(ROUTES.LOGIN)} sx={{ ...outlinedSx, flex: { xs: '1 1 100%', sm: 'none' }, px: 3 }}>
                        Go to sign in
                    </Button>
                </Box>
            </Box>
        );
    }

    const { info } = link;
    const isInvite = info.purpose === 'invite';
    const issue = linkPasswordIssue(newPassword, info.username);
    const mismatch = confirmPassword !== '' && confirmPassword !== newPassword;
    const canSubmit = newPassword !== '' && !issue && confirmPassword === newPassword && !saving;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setConfirmTouched(true);
        if (!canSubmit) return;
        setSaving(true);
        setFormError(null);
        setFieldError(null);
        try {
            await setPasswordFromLink({ token, newPassword });
            router.replace(ROUTES.DASHBOARD);
        } catch (err) {
            const code = codeOf(err);
            if (code === INVALID_INVITE) setLink({ kind: 'invalid', message: messageOf(err, INVALID_LINK_TEXT) });
            else if (code === 'WEAK_PASSWORD') setFieldError(messageOf(err, 'Choose a stronger password.'));
            else setFormError(messageOf(err, 'Could not set your password. Please try again.'));
            setSaving(false);
        }
    };

    return (
        <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Box>
                <Typography component="h1" sx={{ fontSize: '22px', fontWeight: 700, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                    {isInvite ? `Welcome, ${info.name}` : 'Choose a new password'}
                </Typography>
                <Typography sx={{ fontSize: '14px', color: 'var(--mui-palette-text-secondary)', mt: 0.5, lineHeight: 1.6 }}>
                    {isInvite
                        ? 'Set a password to finish setting up your Nandini CRM account. You’ll be signed in straight away.'
                        : 'Choose a new password for your Nandini CRM account. Your other sessions are signed out.'}
                </Typography>
            </Box>

            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 1,
                    flexWrap: 'wrap',
                    px: 1.5,
                    py: 1,
                    borderRadius: '10px',
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    border: '1px solid var(--mui-palette-border-main)',
                }}
            >
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: 'var(--crm-slate-600)' }}>User name</Typography>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{info.username}</Typography>
            </Box>
            {/* Lets password managers save the new password against the right account. */}
            <input type="text" name="username" autoComplete="username" value={info.username} readOnly hidden />

            <PasswordInput
                label="New password"
                value={newPassword}
                onChange={(value) => {
                    setNewPassword(value);
                    setFieldError(null);
                    setFormError(null);
                }}
                autoComplete="new-password"
                disabled={saving}
                describedBy={checklistId}
                error={Boolean(fieldError)}
                helperText={fieldError ?? undefined}
            />
            <PasswordInput
                label="Confirm new password"
                value={confirmPassword}
                onChange={(value) => {
                    setConfirmPassword(value);
                    setFormError(null);
                }}
                onBlur={() => setConfirmTouched(true)}
                autoComplete="new-password"
                disabled={saving}
                error={confirmTouched && (mismatch || (confirmPassword === '' && newPassword !== ''))}
                helperText={
                    confirmTouched && mismatch
                        ? 'The passwords do not match.'
                        : confirmTouched && confirmPassword === '' && newPassword !== ''
                          ? 'Type the new password again.'
                          : undefined
                }
            />

            <PasswordRulesChecklist id={checklistId} password={newPassword} context={{ username: info.username }} audience="link" showStrength />

            {formError && (
                <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '13px' }}>
                    {formError}
                </Alert>
            )}

            <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={!canSubmit}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                sx={solidSx}
            >
                {saving ? 'Setting your password…' : 'Set password and sign in'}
            </Button>

            <Typography sx={{ fontSize: '12px', color: 'var(--mui-palette-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                This link works once and expires {formatDateTime(info.expiresAt)}.
            </Typography>
        </Box>
    );
}
