"use client";

import React, { useState } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Button, CircularProgress, InputAdornment, Link, TextField, Typography } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { ROUTES } from '@/config/constants';
import { authService } from '@/services/auth.service';
import { FIELD_MAX_LENGTH } from '../forms/fieldSizing';

/** Shown when the API's own answer can't be read; the same words the API uses. */
const SENT_TEXT = 'If this account exists, we’ve emailed a reset link to its company email. The link works once, within 72 hours.';

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

const backLinkSx = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0.5,
    minHeight: 40,
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--crm-text-blue-600)',
    '&:hover': { color: 'var(--crm-text-blue-700)' },
} as const;

/**
 * "Forgot password?" (`/forgot-password`), reached only when the sign-in page's username was empty (with a username
 * typed, the sign-in page sends the link itself). Takes the username and asks the API to email a password reset link to
 * that account's company email (single use, 72 hours, the same link an admin sends). The answer reads the same whether
 * or not an account matched, so the page never says which usernames exist.
 */
export function ForgotPasswordForm() {
    const [identifier, setIdentifier] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = identifier.trim();
        if (!value) {
            setError('Enter your username.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            setSent((await authService.requestPasswordReset(value)) || SENT_TEXT);
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'Could not send the request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const backToSignIn = (
        <Link component={NextLink} href={ROUTES.LOGIN} underline="hover" sx={backLinkSx}>
            <ArrowBackRoundedIcon sx={{ fontSize: 16 }} />
            Back to sign in
        </Link>
    );

    if (sent) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }} role="status" aria-live="polite">
                <Box
                    aria-hidden
                    sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        color: 'var(--crm-text-blue-600)',
                    }}
                >
                    <MarkEmailReadOutlinedIcon />
                </Box>
                <Typography component="h1" sx={{ fontSize: '20px', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                    Check your email
                </Typography>
                <Typography sx={{ fontSize: '14px', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.6 }}>{sent}</Typography>
                <Typography sx={{ fontSize: '13px', color: 'var(--mui-palette-text-muted)', lineHeight: 1.6 }}>
                    Nothing arrived after a few minutes? Check your spam folder, or ask your administrator to send you a link.
                </Typography>
                {backToSignIn}
            </Box>
        );
    }

    return (
        <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Box>
                <Typography component="h1" sx={{ fontSize: '22px', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                    Forgot your password?
                </Typography>
                <Typography sx={{ fontSize: '14px', color: 'var(--mui-palette-text-secondary)', mt: 0.5, lineHeight: 1.6 }}>
                    Enter your CRM username. We’ll email a link to choose a new password to your company email.
                </Typography>
            </Box>

            <Box>
                <Typography
                    component="label"
                    htmlFor="forgot-identifier"
                    sx={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--crm-slate-600)', mb: 0.75 }}
                >
                    User Name
                </Typography>
                <TextField
                    id="forgot-identifier"
                    fullWidth
                    autoFocus
                    placeholder="Enter your CRM username"
                    value={identifier}
                    onChange={(e) => {
                        setIdentifier(e.target.value);
                        setError(null);
                    }}
                    autoComplete="username"
                    disabled={submitting}
                    error={Boolean(error)}
                    slotProps={{
                        htmlInput: { maxLength: FIELD_MAX_LENGTH.email },
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <PersonOutlineIcon sx={{ color: 'var(--mui-palette-text-muted)', fontSize: '20px' }} />
                                </InputAdornment>
                            ),
                        },
                    }}
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            borderRadius: '10px',
                            backgroundColor: 'var(--mui-palette-background-subtle)',
                            fontSize: '14px',
                            '& fieldset': { borderColor: 'var(--mui-palette-border-main)' },
                            '&:hover fieldset': { borderColor: 'primary.main' },
                            '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: '1.5px' },
                        },
                        '& .MuiInputBase-input': {
                            color: 'var(--mui-palette-text-primary)',
                            py: '12px',
                            '&::placeholder': { color: 'var(--mui-palette-text-muted)', opacity: 1 },
                        },
                    }}
                />
            </Box>

            {error && (
                <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '13px' }}>
                    {error}
                </Alert>
            )}

            <Button
                id="forgot-password-submit"
                type="submit"
                variant="contained"
                fullWidth
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
                sx={solidSx}
            >
                {submitting ? 'Sending…' : 'Email me a reset link'}
            </Button>

            <Box sx={{ display: 'flex', justifyContent: 'center' }}>{backToSignIn}</Box>
        </Box>
    );
}
