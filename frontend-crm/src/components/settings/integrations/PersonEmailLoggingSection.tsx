'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, MenuItem, Skeleton, TextField, Typography } from '@mui/material';
import { errorMessage, inputSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { usePersonEmailLogging, usePurgePersonEmails, useRunPersonEmailLogging, useSetPersonEmailLogging } from '@/hooks/queries/useEmailLogs';
import { NOT_LOGGED_LABELS, type MailboxMode } from '@/types/emailLog.types';
import { formatDateTime, hintSx, StatusChip } from './integrationUi';

/**
 * Email logging for one person (Calendar Phase 4), inside the People › calendar dialog: the admin switch (company
 * default / on / off, saved at once and audited), the mailbox status, "Log now" and deleting everything logged from
 * this person's mailbox (audited PURGE). Employees have no switch of their own; they see the status on My Profile.
 */

const DEFAULT = 'default';

const dangerButtonSx = {
    minHeight: 36,
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '8px',
    background: 'var(--crm-fill-red-700)',
    color: '#ffffff',
    '&:hover': { background: 'var(--crm-fill-red-800)' },
} as const;

const quietDangerSx = {
    ...secondaryButtonSx,
    minHeight: 36,
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

export function PersonEmailLoggingSection({ username, onToast }: { username: string; onToast: (message: string, severity?: 'success' | 'error') => void }) {
    const query = usePersonEmailLogging(username);
    const setMode = useSetPersonEmailLogging();
    const run = useRunPersonEmailLogging();
    const purge = usePurgePersonEmails();
    const [confirmPurge, setConfirmPurge] = useState(false);
    const data = query.data;
    const busy = setMode.isPending || run.isPending || purge.isPending;

    const changeMode = async (next: string) => {
        const mode: MailboxMode | null = next === DEFAULT ? null : (next as MailboxMode);
        try {
            await setMode.mutateAsync({ username, mode });
            onToast('Email logging saved for this person.');
        } catch (err) {
            onToast(errorMessage(err, 'Could not save email logging for this person.'), 'error');
        }
    };

    const logNow = async () => {
        try {
            const res = await run.mutateAsync(username);
            onToast(res.run.status === 'queued' ? 'Checking the mailbox now. New emails appear within a minute or two.' : 'logged' in res.run ? `Mailbox checked: ${res.run.logged} new emails logged.` : 'Mailbox checked.');
        } catch (err) {
            onToast(errorMessage(err, 'Could not check the mailbox.'), 'error');
        }
    };

    const doPurge = async () => {
        try {
            const res = await purge.mutateAsync(username);
            setConfirmPurge(false);
            onToast(`Deleted ${res.copies} logged emails from this person's mailbox (${res.emails} no longer on any record).`);
        } catch (err) {
            onToast(errorMessage(err, 'Could not delete the logged emails.'), 'error');
        }
    };

    return (
        <Box component="section" aria-label="Email logging" sx={{ pt: 1.5, borderTop: '1px solid var(--mui-palette-border-light)', display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>Email logging</Typography>
            {query.isLoading ? (
                <Skeleton variant="rounded" height={64} />
            ) : !data ? (
                <Alert severity="error" sx={{ fontSize: '0.78rem', py: 0.25 }}>
                    {errorMessage(query.error, 'Could not load email logging for this person.')}
                </Alert>
            ) : (
                <>
                    <TextField
                        select
                        size="small"
                        label="Log this person's emails with customers"
                        value={data.mode ?? DEFAULT}
                        onChange={(e) => void changeMode(e.target.value)}
                        disabled={busy}
                        helperText="Saved at once and kept in the audit log."
                        sx={inputSx}
                    >
                        <MenuItem value={DEFAULT} sx={{ fontSize: '0.85rem' }}>
                            Company default ({data.companyDefault === 'on' ? 'on' : 'off'})
                        </MenuItem>
                        <MenuItem value="on" sx={{ fontSize: '0.85rem' }}>
                            On
                        </MenuItem>
                        <MenuItem value="off" sx={{ fontSize: '0.85rem' }}>
                            Off
                        </MenuItem>
                    </TextField>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <StatusChip tone={!data.logging ? 'neutral' : data.mailbox?.status === 'error' ? 'error' : 'success'}>
                            {!data.logging ? 'Not logged' : data.mailbox?.status === 'error' ? 'Error' : 'Logging'}
                        </StatusChip>
                        <Typography sx={{ ...hintSx, minWidth: 0, overflowWrap: 'anywhere' }}>
                            {data.reason ? NOT_LOGGED_LABELS[data.reason] : data.mailbox?.lastSuccessAt ? `Last checked ${formatDateTime(data.mailbox.lastSuccessAt)}` : 'Not checked yet'}
                            {` · ${data.copies} emails kept`}
                        </Typography>
                    </Box>
                    {data.mailbox?.status === 'error' && data.mailbox.lastErrorMessage && (
                        <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-error-main)', overflowWrap: 'anywhere' }}>{data.mailbox.lastErrorMessage}</Typography>
                    )}

                    {confirmPurge ? (
                        <Alert severity="warning" sx={{ fontSize: '0.78rem', alignItems: 'flex-start' }}>
                            Delete all {data.copies} emails logged from this person&apos;s mailbox? Emails another enrolled employee also took part in stay on the records.
                            This can&apos;t be undone.
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                                <Button variant="contained" sx={dangerButtonSx} onClick={() => void doPurge()} disabled={busy}>
                                    {purge.isPending ? 'Deleting…' : 'Delete logged emails'}
                                </Button>
                                <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={() => setConfirmPurge(false)} disabled={purge.isPending}>
                                    Keep them
                                </Button>
                            </Box>
                        </Alert>
                    ) : (
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {data.logging && (
                                <Button
                                    variant="outlined"
                                    sx={{ ...secondaryButtonSx, minHeight: 36 }}
                                    onClick={() => void logNow()}
                                    disabled={busy}
                                    startIcon={run.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                                >
                                    {run.isPending ? 'Checking…' : 'Log now'}
                                </Button>
                            )}
                            {data.copies > 0 && (
                                <Button variant="outlined" sx={quietDangerSx} onClick={() => setConfirmPurge(true)} disabled={busy}>
                                    Delete logged emails
                                </Button>
                            )}
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
}
