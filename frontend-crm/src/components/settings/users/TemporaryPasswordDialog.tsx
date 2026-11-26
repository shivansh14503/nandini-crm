'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import { primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { phoneDialogPaperSx } from './userAdminUi';

export interface TemporaryPasswordInfo {
    /** Whose password it is (name or username). */
    name: string;
    username: string;
    password: string;
    /** "created" after Add user, "reset" after Reset password. */
    reason: 'created' | 'reset';
}

/**
 * Shows a generated temporary password once, with Copy. It is never shown again (the API keeps only its hash), so the
 * dialog only closes from its own button.
 */
export function TemporaryPasswordDialog({ info, onClose }: { info: TemporaryPasswordInfo | null; onClose: () => void }) {
    const [copied, setCopied] = useState<'password' | 'both' | null>(null);

    const copy = async (what: 'password' | 'both') => {
        if (!info) return;
        const text = what === 'both' ? `Username: ${info.username}\nTemporary password: ${info.password}` : info.password;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(what);
            window.setTimeout(() => setCopied(null), 1800);
        } catch {
            // Clipboard blocked (http, permissions): the password stays selectable.
        }
    };

    return (
        <Dialog
            open={Boolean(info)}
            // Backdrop clicks and Escape don't close it: the password can't be shown again.
            onClose={(_, reason) => {
                if (reason !== 'backdropClick' && reason !== 'escapeKeyDown') onClose();
            }}
            maxWidth="xs"
            fullWidth
            aria-labelledby="temporary-password-title"
            slotProps={{ paper: { sx: phoneDialogPaperSx } }}
        >
            <DialogTitle id="temporary-password-title" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', display: 'flex', alignItems: 'center', gap: 1 }}>
                <KeyRoundedIcon sx={{ fontSize: 20, color: 'var(--crm-text-blue-600)' }} />
                {info?.reason === 'reset' ? 'Password reset' : 'User added'}
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)', lineHeight: 1.55 }}>
                    Give{' '}
                    <Box component="strong" sx={{ color: 'var(--crm-slate-900)' }}>
                        {info?.name}
                    </Box>{' '}
                    this temporary password to sign in with the username{' '}
                    <Box component="strong" sx={{ color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                        {info?.username}
                    </Box>
                    .
                </Typography>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1.25,
                        borderRadius: '10px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                    }}
                >
                    <Typography
                        component="code"
                        aria-label="Temporary password"
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                            fontSize: '1.05rem',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            color: 'var(--crm-slate-900)',
                            overflowWrap: 'anywhere',
                            userSelect: 'all',
                        }}
                    >
                        {info?.password}
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => void copy('password')}
                        startIcon={copied === 'password' ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
                        sx={{ ...secondaryButtonSx, minHeight: 36, flexShrink: 0 }}
                    >
                        {copied === 'password' ? 'Copied' : 'Copy'}
                    </Button>
                </Box>
                <Alert severity="info" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                    They must change it at first sign-in. This password is shown only once; if it is lost, reset it again.
                </Alert>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                <Button
                    variant="outlined"
                    onClick={() => void copy('both')}
                    startIcon={copied === 'both' ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
                    sx={{ ...secondaryButtonSx, minHeight: 36, flex: { xs: 1, sm: 'none' } }}
                >
                    {copied === 'both' ? 'Copied' : 'Copy username and password'}
                </Button>
                <Button variant="contained" onClick={onClose} sx={{ ...primaryButtonSx, minHeight: 36, flex: { xs: 1, sm: 'none' } }}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}
