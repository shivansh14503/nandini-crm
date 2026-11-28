'use client';

import React, { useState } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Button, MenuItem, Skeleton, Switch, TextField, Typography } from '@mui/material';
import { AppToast } from '@/components/common/AppToast';
import { errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useLeaveGuard } from '@/components/settings/useLeaveGuard';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { useCheckOutboundEmail, useOutboundEmail, useSaveOutboundEmail, useSendTestEmail } from '@/hooks/queries/useEmailAdmin';
import { ApiClientError } from '@/services/apiClient';
import type { OutboundEmailDto, OutboundProvider } from '@/types/emailAdmin.types';
import { fmtInstant } from '@/utils/formats';
import { buttonSize, Fact, fieldLabelSx, hintSx, StatusChip } from './emailUi';

interface Draft {
    provider: OutboundProvider;
    enabled: boolean;
    senderEmail: string;
    senderName: string;
    replyTo: string;
    dailyLimit: string;
}

const draftOf = (dto: OutboundEmailDto): Draft => ({
    provider: dto.provider,
    enabled: dto.enabled,
    senderEmail: dto.senderEmail ?? '',
    senderName: dto.senderName ?? '',
    replyTo: dto.replyTo ?? '',
    dailyLimit: String(dto.dailyLimit),
});

const sameDraft = (a: Draft, b: Draft) => (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k]);

/** Field errors of a 400 (`errors[].path[0]`). */
function fieldErrorsOf(err: unknown): Record<string, string> {
    if (!(err instanceof ApiClientError)) return {};
    return Object.fromEntries((err.details?.errors ?? []).map((e) => [String(e.path?.[0] ?? ''), e.message]));
}

/**
 * Outbound Email: how the CRM sends email. Gmail API = the sender mailbox through the Google Workspace service account
 * already uploaded on API Integrations (domain-wide delegation with the gmail.send scope); SMTP = the server's own
 * settings. No credential is typed or shown here.
 */
export function OutboundEmailPanel({ onOpenQueue }: { onOpenQueue: () => void }) {
    const query = useOutboundEmail();
    const save = useSaveOutboundEmail();
    const check = useCheckOutboundEmail();
    const sendTest = useSendTestEmail();
    const { user } = useAuth();
    const [draft, setDraft] = useState<Draft | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [testTo, setTestTo] = useState<string | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    const [syncedFrom, setSyncedFrom] = useState<OutboundEmailDto | undefined>(undefined);
    if (query.data && query.data !== syncedFrom) {
        const firstLoad = !syncedFrom;
        setSyncedFrom(query.data);
        // Keep the admin's unsaved edits when only the status changed (check / test results).
        if (firstLoad || !draft || !syncedFrom || sameDraft(draft, draftOf(syncedFrom))) setDraft(draftOf(query.data));
    }
    const testAddress = testTo ?? (user as { email?: string | null } | null)?.email ?? '';

    const dirty = Boolean(query.data && draft && !sameDraft(draft, draftOf(query.data)));
    useLeaveGuard(dirty, 'You have unsaved outbound email changes. Leave this page and lose them?');

    if (query.isPending) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-busy="true">
                <Skeleton variant="rounded" height={120} sx={{ borderRadius: '12px' }} />
                <Skeleton variant="rounded" height={320} sx={{ borderRadius: '12px' }} />
            </Box>
        );
    }
    if (!query.data || !draft) {
        return (
            <Alert severity="error" sx={{ borderRadius: '10px' }} action={<Button size="small" onClick={() => void query.refetch()}>Try again</Button>}>
                {errorMessage(query.error, 'Could not load the outbound email settings.')}
            </Alert>
        );
    }

    const dto = query.data;
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
        setDraft({ ...draft, [key]: value });
        setErrors((e) => ({ ...e, [key]: '' }));
    };

    const onSave = async () => {
        setErrors({});
        try {
            await save.mutateAsync({
                provider: draft.provider,
                enabled: draft.enabled,
                senderEmail: draft.senderEmail.trim() || null,
                senderName: draft.senderName.trim() || null,
                replyTo: draft.replyTo.trim() || null,
                dailyLimit: Number(draft.dailyLimit),
            });
            setToast({ open: true, message: 'Outbound email settings saved.', severity: 'success' });
        } catch (err) {
            setErrors(fieldErrorsOf(err));
            setToast({ open: true, message: errorMessage(err, 'Could not save the settings.'), severity: 'error' });
        }
    };

    const onCheck = async () => {
        try {
            const result = await check.mutateAsync();
            setToast({ open: true, message: result.message, severity: result.ok ? 'success' : 'error' });
        } catch (err) {
            setToast({ open: true, message: errorMessage(err, 'The check failed.'), severity: 'error' });
        }
    };

    const onSendTest = async () => {
        try {
            const result = await sendTest.mutateAsync(testAddress.trim());
            setToast({ open: true, message: result.message, severity: result.ok ? 'success' : 'error' });
        } catch (err) {
            setToast({ open: true, message: errorMessage(err, 'The test email could not be sent.'), severity: 'error' });
        }
    };

    const { status } = dto;
    const busy = save.isPending || check.isPending || sendTest.isPending;
    const gmail = draft.provider === 'gmail';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Connection status */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
                <Box sx={{ ...panelHeaderSx, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--crm-slate-900)', flex: 1, minWidth: 0 }}>Connection status</Typography>
                    {status.ready ? <StatusChip tone="success">Sending is on</StatusChip> : <StatusChip tone="warning">Not sending</StatusChip>}
                </Box>
                <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {!status.ready && status.reason && (
                        <Alert severity="warning" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                            {status.reason} Emails are logged as skipped until this is fixed.
                        </Alert>
                    )}
                    {status.lastTestAt && (
                        <Alert severity={status.lastTestOk ? 'success' : 'error'} sx={{ borderRadius: '10px', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>
                            Last check {fmtInstant(status.lastTestAt)}: {status.lastTestMessage}
                        </Alert>
                    )}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
                        <Fact label="Sent today">
                            {status.sentToday} of {dto.dailyLimit}
                        </Fact>
                        <Fact label="Waiting in queue">{status.queued}</Fact>
                        <Fact label="Failed (last 7 days)">
                            {status.failed > 0 ? (
                                <Button
                                    size="small"
                                    onClick={onOpenQueue}
                                    sx={{ p: 0, minWidth: 0, textTransform: 'none', fontWeight: 600, color: 'var(--crm-text-blue-700)', '&:hover': { color: 'var(--crm-text-blue-600)', backgroundColor: 'transparent', textDecoration: 'underline' } }}
                                >
                                    {status.failed}: open queue
                                </Button>
                            ) : (
                                0
                            )}
                        </Fact>
                        <Fact label="Sends with">{dto.provider === 'gmail' ? 'Gmail API' : 'SMTP'}</Fact>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}>
                        <Button variant="outlined" sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: '1 1 100%', sm: 'none' } }} onClick={onCheck} disabled={busy || dirty}>
                            {check.isPending ? 'Checking…' : 'Check connection'}
                        </Button>
                        <TextField
                            size="small"
                            label="Send a test to"
                            value={testAddress}
                            onChange={(e) => setTestTo(e.target.value)}
                            sx={{ ...inputSx, flex: { xs: '1 1 100%', sm: '1 1 240px' }, maxWidth: { sm: 320 } }}
                            type="email"
                        />
                        <Button
                            variant="contained"
                            sx={{ ...primaryButtonSx, ...buttonSize, flex: { xs: '1 1 100%', sm: 'none' } }}
                            onClick={onSendTest}
                            disabled={busy || dirty || !status.ready || !testAddress.trim()}
                        >
                            {sendTest.isPending ? 'Sending…' : 'Send test email'}
                        </Button>
                    </Box>
                    {dirty && <Typography sx={hintSx}>Save your changes before checking the connection or sending a test.</Typography>}
                </Box>
            </Box>

            {/* Settings */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
                <Box sx={{ ...panelHeaderSx }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--crm-slate-900)' }}>Sender</Typography>
                </Box>
                <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                        <Switch checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} slotProps={{ input: { 'aria-label': 'Send email' } }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>Send email</Typography>
                            <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                                Off: nothing is sent; invites and reset links say email is not set up.
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                        <Box>
                            <Typography component="label" htmlFor="outbound-provider" sx={fieldLabelSx}>
                                Send with
                            </Typography>
                            <TextField id="outbound-provider" select fullWidth size="small" value={draft.provider} onChange={(e) => set('provider', e.target.value as OutboundProvider)} sx={inputSx}>
                                <MenuItem value="gmail">Gmail API (Google Workspace)</MenuItem>
                                <MenuItem value="smtp">SMTP (server settings)</MenuItem>
                            </TextField>
                        </Box>
                        <Box>
                            <Typography component="label" htmlFor="outbound-limit" sx={fieldLabelSx}>
                                Daily send limit
                            </Typography>
                            <TextField
                                id="outbound-limit"
                                fullWidth
                                size="small"
                                type="number"
                                value={draft.dailyLimit}
                                onChange={(e) => set('dailyLimit', e.target.value)}
                                error={Boolean(errors.dailyLimit)}
                                helperText={errors.dailyLimit || `Bulk emails past this wait for the next day. Invites and reset links always go out. Google allows ${dto.maxDailyLimit} a day.`}
                                slotProps={{ htmlInput: { min: 1, max: dto.maxDailyLimit } }}
                                sx={inputSx}
                            />
                        </Box>
                        <Box>
                            <Typography component="label" htmlFor="outbound-sender" sx={fieldLabelSx}>
                                Sender address{gmail ? ' *' : ''}
                            </Typography>
                            <TextField
                                id="outbound-sender"
                                fullWidth
                                size="small"
                                type="email"
                                placeholder="crm@nandiniinfosys.com"
                                value={draft.senderEmail}
                                onChange={(e) => set('senderEmail', e.target.value)}
                                error={Boolean(errors.senderEmail)}
                                helperText={errors.senderEmail || (gmail ? 'A real Workspace mailbox. Emails go out from it and appear in its Sent folder.' : `Leave empty to use ${dto.smtp.from}.`)}
                                sx={inputSx}
                            />
                        </Box>
                        <Box>
                            <Typography component="label" htmlFor="outbound-name" sx={fieldLabelSx}>
                                Display name
                            </Typography>
                            <TextField
                                id="outbound-name"
                                fullWidth
                                size="small"
                                placeholder="Nandini CRM"
                                value={draft.senderName}
                                onChange={(e) => set('senderName', e.target.value)}
                                error={Boolean(errors.senderName)}
                                helperText={errors.senderName || 'The name people see next to the sender address.'}
                                sx={inputSx}
                            />
                        </Box>
                        <Box>
                            <Typography component="label" htmlFor="outbound-reply" sx={fieldLabelSx}>
                                Reply-to address
                            </Typography>
                            <TextField
                                id="outbound-reply"
                                fullWidth
                                size="small"
                                type="email"
                                value={draft.replyTo}
                                onChange={(e) => set('replyTo', e.target.value)}
                                error={Boolean(errors.replyTo)}
                                helperText={errors.replyTo || 'Optional: where replies go, if not to the sender.'}
                                sx={inputSx}
                            />
                        </Box>
                    </Box>

                    {gmail ? (
                        <Box sx={{ borderRadius: '10px', border: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--crm-slate-900)', flex: 1, minWidth: 0 }}>Google Workspace service account</Typography>
                                {dto.gmail.keyConfigured ? <StatusChip tone="success">Key uploaded</StatusChip> : <StatusChip tone="warning">No key yet</StatusChip>}
                            </Box>
                            {dto.gmail.keyConfigured ? (
                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
                                    <Fact label="Service account">{dto.gmail.serviceAccountEmail}</Fact>
                                    <Fact label="Client ID (for domain-wide delegation)">{dto.gmail.clientId}</Fact>
                                </Box>
                            ) : (
                                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                                    The same key that calendar sync uses. Upload it on{' '}
                                    <Box component={NextLink} href={ROUTES.API_INTEGRATIONS} sx={{ color: 'var(--crm-text-blue-700)', fontWeight: 600, '&:hover': { color: 'var(--crm-text-blue-600)' } }}>
                                        API Integrations
                                    </Box>
                                    ; it is stored encrypted and never shown again.
                                </Typography>
                            )}
                            <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.7 }}>
                                <li>In Google Cloud, enable the Gmail API in the service account&apos;s project.</li>
                                <li>
                                    In the Google Admin console › Security › Access and data control › API controls › Domain-wide delegation, add this scope to the entry for the client ID above:{' '}
                                    <Box component="code" sx={{ fontSize: '0.75rem', px: 0.5, borderRadius: '4px', backgroundColor: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                                        {dto.gmail.scope}
                                    </Box>
                                    {' '}(keep the calendar scopes in the same box, separated by commas).
                                </li>
                                <li>Enter the sender mailbox here, switch Send email on, save, then use Check connection.</li>
                            </Box>
                        </Box>
                    ) : (
                        <Alert severity={dto.smtp.configured ? 'info' : 'warning'} sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                            {dto.smtp.configured
                                ? `SMTP uses the server's settings: ${dto.smtp.host}, port ${dto.smtp.port}. Its password stays on the server.`
                                : 'SMTP is turned off on the server (MAIL_ENABLED / SMTP_HOST). Ask whoever runs the server, or use the Gmail API.'}
                        </Alert>
                    )}

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
                        <Button variant="outlined" sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: 1, sm: 'none' } }} disabled={!dirty || busy} onClick={() => setDraft(draftOf(dto))}>
                            Cancel
                        </Button>
                        <Button variant="contained" sx={{ ...primaryButtonSx, ...buttonSize, flex: { xs: 1, sm: 'none' } }} disabled={!dirty || busy} onClick={onSave}>
                            {save.isPending ? 'Saving…' : 'Save changes'}
                        </Button>
                    </Box>
                </Box>
            </Box>

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} autoHideDuration={6000} />
        </Box>
    );
}
