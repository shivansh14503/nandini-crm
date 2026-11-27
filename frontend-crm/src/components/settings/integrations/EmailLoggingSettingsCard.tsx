'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, MenuItem, Skeleton, Switch, TextField, Typography } from '@mui/material';
import { errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useEmailLoggingOverview, useSaveEmailLoggingSettings } from '@/hooks/queries/useEmailLogs';
import {
    EMAIL_VISIBILITIES,
    EMAIL_VISIBILITY_LABELS,
    RETENTION_MONTH_CHOICES,
    type EmailLoggingProvider,
    type EmailLoggingSettings,
    type MailboxMode,
    type RetentionMonths,
    type EmailVisibility,
} from '@/types/emailLog.types';
import { CopyField, ProviderMark, StatusChip, formatDateTime, hintSx } from './integrationUi';

/**
 * Admin › API Integrations › Email logging (Calendar Phase 4; docs/system-design.md › Email logging). The company
 * switch (default off), who is logged by default, who sees logged emails, retention and snippets, plus the scopes the
 * owner adds to the existing Google / Microsoft connections and each provider's mail health. Saved as the form-config
 * module setting activities/emailLogging (PUT /api/admin/email-logging/settings, audited).
 */

const KEYS: (keyof EmailLoggingSettings)[] = ['enabled', 'defaultForPeople', 'visibility', 'retentionMonths', 'storeSnippets'];

const switchRowSx = { display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 } as const;
const switchLabelSx = { fontSize: '0.86rem', fontWeight: 600, color: 'var(--crm-slate-900)' } as const;

function ProviderHealth({ p }: { p: EmailLoggingProvider }) {
    return (
        <Box
            sx={{
                p: 1.25,
                borderRadius: '10px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                minWidth: 0,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', color: 'var(--crm-slate-900)' }}>
                {(p.provider === 'google' || p.provider === 'microsoft') && <ProviderMark provider={p.provider} size={16} />}
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--crm-slate-900)' }}>{p.label}</Typography>
                <StatusChip tone={p.problem ? 'error' : p.mailboxes.ok > 0 ? 'success' : 'neutral'}>{p.problem ? 'Needs attention' : p.mailboxes.ok > 0 ? 'Working' : 'No mailboxes yet'}</StatusChip>
            </Box>
            <Typography sx={hintSx}>
                {p.people} {p.people === 1 ? 'person' : 'people'} logged · {p.mailboxes.ok} ok · {p.mailboxes.error} with errors
            </Typography>
            {p.problem && (
                <Typography sx={{ ...hintSx, color: 'var(--crm-red-700)' }}>
                    {p.problem.message}
                    {p.problem.at ? ` (${formatDateTime(p.problem.at)})` : ''}
                </Typography>
            )}
        </Box>
    );
}

export function EmailLoggingSettingsCard({ onDirtyChange, onToast }: { onDirtyChange: (dirty: boolean) => void; onToast: (message: string, severity?: 'success' | 'error') => void }) {
    const query = useEmailLoggingOverview();
    const save = useSaveEmailLoggingSettings();
    const [draft, setDraft] = useState<Partial<EmailLoggingSettings>>({});
    const saved = query.data?.settings;
    const value: EmailLoggingSettings | null = saved ? { ...saved, ...draft } : null;
    const dirty = Boolean(saved && value && KEYS.some((k) => value[k] !== saved[k]));

    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    const set = <K extends keyof EmailLoggingSettings>(key: K, v: EmailLoggingSettings[K]) => setDraft((d) => ({ ...d, [key]: v }));

    const submit = async () => {
        if (!value || !saved) return;
        const patch: Partial<EmailLoggingSettings> = {};
        for (const k of KEYS) if (value[k] !== saved[k]) (patch as Record<string, unknown>)[k] = value[k];
        try {
            await save.mutateAsync(patch);
            setDraft({});
            onToast(value.enabled ? 'Saved. Email logging is on.' : 'Saved. Email logging is off: nothing new is logged and the Emails tabs are hidden.');
        } catch (err) {
            onToast(errorMessage(err, 'Could not save the email logging settings.'), 'error');
        }
    };

    const data = query.data;

    return (
        <Box component="section" aria-labelledby="email-logging-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={panelHeaderSx}>
                <Typography id="email-logging-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)' }}>
                    Email logging
                </Typography>
                <Typography sx={hintSx}>
                    Logs emails between enrolled employees and CRM contacts and leads on those records (and on the contacts&apos; opportunities), from the
                    same Google / Microsoft connection as calendar sync. Only the subject, participants, time and a short plain-text snippet are kept: never
                    bodies or attachments. Bcc, internal-only, private and automated mail is skipped.
                </Typography>
            </Box>
            <Box sx={{ p: { xs: 1.75, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.75, flex: 1, minWidth: 0 }}>
                {query.isLoading ? (
                    <Skeleton variant="rounded" height={160} />
                ) : !value || !data ? (
                    <Alert severity="error">{errorMessage(query.error, 'Could not load the email logging settings.')}</Alert>
                ) : (
                    <>
                        {!data.serverEnabled && (
                            <Alert severity="warning">EMAIL_LOG_ENABLED is false on the server, so nothing is logged whatever is chosen here.</Alert>
                        )}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2, minmax(0,1fr))' }, gap: 1.5, alignItems: 'start' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
                                <Box sx={switchRowSx}>
                                    <Switch
                                        size="small"
                                        checked={value.enabled}
                                        disabled={save.isPending}
                                        onChange={(e) => set('enabled', e.target.checked)}
                                        slotProps={{ input: { 'aria-label': 'Log emails with customers' } }}
                                    />
                                    <Typography sx={switchLabelSx}>Log emails with customers {value.enabled ? '(on)' : '(off)'}</Typography>
                                </Box>
                                <TextField
                                    select
                                    size="small"
                                    label="Default for people"
                                    value={value.defaultForPeople}
                                    disabled={save.isPending}
                                    onChange={(e) => set('defaultForPeople', e.target.value as MailboxMode)}
                                    helperText="Each person can be switched on or off in People › calendar."
                                    sx={{ ...inputSx, maxWidth: 360 }}
                                >
                                    <MenuItem value="off">Off: only people an admin switches on</MenuItem>
                                    <MenuItem value="on">On: everyone with a synced company calendar</MenuItem>
                                </TextField>
                                <TextField
                                    select
                                    size="small"
                                    label="Who sees logged emails"
                                    value={value.visibility}
                                    disabled={save.isPending}
                                    onChange={(e) => set('visibility', e.target.value as EmailVisibility)}
                                    sx={{ ...inputSx, maxWidth: 360 }}
                                >
                                    {EMAIL_VISIBILITIES.map((v) => (
                                        <MenuItem key={v} value={v} sx={{ whiteSpace: 'normal' }}>
                                            {EMAIL_VISIBILITY_LABELS[v]}
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <TextField
                                    select
                                    size="small"
                                    label="Keep logged emails for"
                                    value={value.retentionMonths}
                                    disabled={save.isPending}
                                    onChange={(e) => set('retentionMonths', Number(e.target.value) as RetentionMonths)}
                                    sx={{ ...inputSx, maxWidth: 240 }}
                                >
                                    {RETENTION_MONTH_CHOICES.map((m) => (
                                        <MenuItem key={m} value={m}>
                                            {m} months
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <Box sx={switchRowSx}>
                                    <Switch
                                        size="small"
                                        checked={value.storeSnippets}
                                        disabled={save.isPending}
                                        onChange={(e) => set('storeSnippets', e.target.checked)}
                                        slotProps={{ input: { 'aria-label': 'Keep a short snippet' } }}
                                    />
                                    <Typography sx={switchLabelSx}>Keep a short plain-text snippet</Typography>
                                </Box>
                                {saved?.storeSnippets && !value.storeSnippets && (
                                    <Typography sx={hintSx}>Saving also deletes the snippets already kept; they stop showing at once.</Typography>
                                )}
                                <Typography sx={hintSx}>
                                    New mail is checked about every {data.pollMinutes} minutes inside the calendar sync hours. Only mail from the moment logging is
                                    switched on is logged: switching it off and on again never catches up on the time it was off. Turning logging off stops new
                                    logging and hides the Emails tabs; logged emails stay until they age out or are deleted per person (People › calendar).
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
                                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                                    {data.counts.people} {data.counts.people === 1 ? 'person' : 'people'} logged · {data.counts.emails} emails kept
                                </Typography>
                                {data.providers.map((p) => (
                                    <ProviderHealth key={p.provider} p={p} />
                                ))}
                                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-900)', mt: 0.5 }}>Owner steps: scopes to add</Typography>
                                <CopyField label="Google: domain-wide delegation scopes (replace the service account's list)" value={data.scopes.googleAdminConsole} />
                                <Typography sx={hintSx}>
                                    gmail.readonly is the narrowest Gmail scope that returns the snippet and supports incremental history; the CRM only reads headers
                                    and the snippet.
                                </Typography>
                                <CopyField label="Microsoft: Graph application permission (admin consent)" value={data.scopes.microsoft} monospace={false} />
                                <Typography sx={hintSx}>
                                    Recommended: limit it to the enrolled mailboxes with Exchange RBAC for Applications (role &quot;Application Mail.Read&quot;) instead of
                                    tenant-wide consent. A missing scope shows here as a problem; calendar sync keeps working.
                                </Typography>
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', mt: 'auto' }}>
                            {dirty && (
                                <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={() => setDraft({})} disabled={save.isPending}>
                                    Cancel
                                </Button>
                            )}
                            <Button variant="contained" sx={{ ...primaryButtonSx, minHeight: 36 }} disabled={!dirty || save.isPending} onClick={() => void submit()}>
                                {save.isPending ? 'Saving…' : 'Save'}
                            </Button>
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}
