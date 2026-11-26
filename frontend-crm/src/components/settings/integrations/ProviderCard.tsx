'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    CircularProgress,
    FormControlLabel,
    MenuItem,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import {
    ConfirmDeleteDialog,
    errorMessage,
    inputSx,
    panelHeaderSx,
    primaryButtonSx,
    secondaryButtonSx,
    surfaceSx,
} from '@/components/settings/form-customization/builderUi';
import { useClearProviderSecret, useSaveProvider, useTestProvider } from '@/hooks/queries/useIntegrationsAdmin';
import type { GoogleScopeProfile, ProviderAdmin, SaveProviderPayload } from '@/types/integration.types';
import { CopyField, ProviderMark, StatusChip, fieldErrorsOf, fieldLabelSx, formatDateTime, formatDay, hintSx, type ChipTone } from './integrationUi';

/** What the card's form edits. Secrets start empty: they are write-only and never come back from the server. */
interface ProviderForm {
    clientId: string;
    clientSecret: string;
    webhookSecret: string;
    expiresOn: string;
    tenantId: string;
    scopeProfile: GoogleScopeProfile;
    pkce: boolean;
}

function formFrom(p: ProviderAdmin): ProviderForm {
    return {
        clientId: p.clientId ?? '',
        clientSecret: '',
        webhookSecret: '',
        expiresOn: p.secret.expiresOn ?? '',
        tenantId: p.settings.tenantId ?? '',
        scopeProfile: p.settings.scopeProfile ?? 'narrow',
        pkce: p.settings.pkce ?? true,
    };
}

const sameForm = (a: ProviderForm, b: ProviderForm) => (Object.keys(a) as (keyof ProviderForm)[]).every((k) => a[k] === b[k]);

/** Only what changed goes to the server; an empty secret field keeps the stored secret. */
function payloadFor(p: ProviderAdmin, base: ProviderForm, form: ProviderForm): SaveProviderPayload {
    const payload: SaveProviderPayload = {};
    if (form.clientId.trim() !== base.clientId.trim()) payload.clientId = form.clientId.trim() || null;
    if (form.clientSecret.trim()) payload.clientSecret = form.clientSecret.trim();
    if (p.provider === 'zoom' && form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
    if ((p.provider === 'microsoft' || p.provider === 'zoom') && form.expiresOn !== base.expiresOn) payload.clientSecretExpiresOn = form.expiresOn || null;
    if (p.provider === 'microsoft' && form.tenantId.trim() !== base.tenantId.trim()) payload.settings = { tenantId: form.tenantId.trim() || null };
    if (p.provider === 'google' && (form.scopeProfile !== base.scopeProfile || form.pkce !== base.pkce)) {
        payload.settings = { scopeProfile: form.scopeProfile, pkce: form.pkce };
    }
    return payload;
}

/** Not set up / Off / On / Needs attention. */
export function providerStatus(p: ProviderAdmin): { tone: ChipTone; label: string; title?: string } {
    if (p.secret.set && !p.secret.readable) return { tone: 'error', label: 'Needs attention', title: "The stored secret can't be opened with the server's current key." };
    if (!p.configured) return { tone: 'neutral', label: 'Not set up' };
    if (p.enabled && p.lastTest && !p.lastTest.ok) return { tone: 'warning', label: 'Needs attention', title: 'The last connection test failed.' };
    if (p.enabled && p.secret.expiresSoon) return { tone: 'warning', label: 'Needs attention', title: 'The client secret expires soon.' };
    return p.enabled ? { tone: 'success', label: 'On' } : { tone: 'neutral', label: 'Off' };
}

const PROVIDER_BLURB: Record<ProviderAdmin['provider'], string> = {
    google: 'Employees connect their Google Calendar. CRM meetings and follow-ups go to it, and changes made there come back.',
    microsoft: 'Employees connect their Outlook calendar (Microsoft 365). CRM meetings and follow-ups go to it, and changes made there come back.',
    zoom: 'Video meeting links on CRM meetings. You can store the app credentials now; the switch turns on when video meetings ship.',
};

/** One provider's credentials and switch on Admin › API Integrations. */
export function ProviderCard({
    provider,
    keyReady,
    onDirtyChange,
    onToast,
}: {
    provider: ProviderAdmin;
    /** False while the server has no readable encryption key: nothing can be saved. */
    keyReady: boolean;
    onDirtyChange: (provider: ProviderAdmin['provider'], dirty: boolean) => void;
    onToast: (message: string, severity?: 'success' | 'error') => void;
}) {
    const p = provider;
    const serverForm = useMemo(() => formFrom(p), [p]);
    const [base, setBase] = useState<ProviderForm>(serverForm);
    const [form, setForm] = useState<ProviderForm>(serverForm);
    const [replacingSecret, setReplacingSecret] = useState(false);
    const [replacingWebhook, setReplacingWebhook] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [confirmRemove, setConfirmRemove] = useState(false);

    const dirty = !sameForm(form, base);

    // A newer copy from the server (a refetch, another admin's save) replaces the form while nothing is being edited.
    const [seen, setSeen] = useState<ProviderForm>(serverForm);
    if (!sameForm(serverForm, seen)) {
        setSeen(serverForm);
        if (!dirty) {
            setBase(serverForm);
            setForm(serverForm);
        }
    }

    useEffect(() => {
        onDirtyChange(p.provider, dirty);
    }, [dirty, onDirtyChange, p.provider]);
    useEffect(() => () => onDirtyChange(p.provider, false), [onDirtyChange, p.provider]);

    const save = useSaveProvider();
    const test = useTestProvider();
    const clear = useClearProviderSecret();
    const busy = save.isPending || clear.isPending;

    const set = <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => {
            if (!Object.keys(e).length) return e;
            const next = { ...e };
            delete next[key === 'tenantId' ? 'settings.tenantId' : key === 'expiresOn' ? 'clientSecretExpiresOn' : key];
            delete next[''];
            return next;
        });
    };

    const cancel = () => {
        setForm(base);
        setReplacingSecret(false);
        setReplacingWebhook(false);
        setErrors({});
    };

    const submit = async () => {
        const payload = payloadFor(p, base, form);
        if (!Object.keys(payload).length) {
            cancel();
            return;
        }
        try {
            const saved = formFrom(await save.mutateAsync({ provider: p.provider, payload }));
            setBase(saved);
            setForm(saved);
            setReplacingSecret(false);
            setReplacingWebhook(false);
            setErrors({});
            onToast(`${p.label} saved.`);
        } catch (err) {
            setErrors(fieldErrorsOf(err));
            onToast(errorMessage(err, `Could not save ${p.label}.`), 'error');
        }
    };

    const toggleEnabled = async (enabled: boolean) => {
        try {
            await save.mutateAsync({ provider: p.provider, payload: { enabled } });
            onToast(enabled ? `${p.label} is on. Employees can connect from Connected calendars.` : `${p.label} is off. Connected calendars stop syncing until it is turned back on.`);
        } catch (err) {
            onToast(errorMessage(err, `Could not turn ${p.label} ${enabled ? 'on' : 'off'}.`), 'error');
        }
    };

    const runTest = async () => {
        try {
            const result = await test.mutateAsync(p.provider);
            onToast(result.message, result.ok ? 'success' : 'error');
        } catch (err) {
            onToast(errorMessage(err, 'Could not run the connection test.'), 'error');
        }
    };

    const removeSecret = async () => {
        setConfirmRemove(false);
        try {
            await clear.mutateAsync(p.provider);
            cancel();
            onToast(`${p.label} secret removed and the integration switched off.`);
        } catch (err) {
            onToast(errorMessage(err, 'Could not remove the secret.'), 'error');
        }
    };

    const status = providerStatus(p);
    const enableBlocked = !p.available
        ? 'Video meetings · Phase 3'
        : !keyReady
          ? 'Set the encryption key on the server first.'
          : dirty
            ? 'Save or cancel your changes first.'
            : !p.configured && !p.enabled
              ? p.provider === 'microsoft'
                  ? 'Save a client ID, client secret and tenant ID first.'
                  : 'Save a client ID and client secret first.'
              : '';
    const showSecretField = !p.secret.set || !p.secret.readable || replacingSecret;
    const showWebhookField = p.webhookSecret !== null && (!p.webhookSecret.set || !p.webhookSecret.readable || replacingWebhook);
    const hasExpiry = p.provider === 'microsoft' || p.provider === 'zoom';
    const changedBy = (s: { updatedAt: string | null; updatedBy: string | null }) =>
        [s.updatedAt ? `changed ${formatDay(s.updatedAt)}` : '', s.updatedBy ? `by ${s.updatedBy}` : ''].filter(Boolean).join(' ');

    return (
        <Box component="section" aria-label={p.label} sx={{ ...surfaceSx, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            {/* Header: mark, name, status, switch */}
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <Box
                    sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '9px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--crm-slate-700)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        border: '1px solid var(--mui-palette-border-main)',
                    }}
                >
                    <ProviderMark provider={p.provider} size={18} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)', lineHeight: 1.3 }}>
                        {p.label}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {p.kind === 'calendar' ? 'Calendar sync' : 'Video meetings · Phase 3'}
                    </Typography>
                </Box>
                <StatusChip tone={status.tone} title={status.title}>
                    {status.label}
                </StatusChip>
                <Tooltip title={enableBlocked} arrow disableHoverListener={!enableBlocked} disableFocusListener={!enableBlocked}>
                    <span>
                        <Switch
                            checked={p.enabled}
                            disabled={Boolean(enableBlocked && !(p.enabled && !dirty && p.available)) || busy}
                            onChange={(e) => void toggleEnabled(e.target.checked)}
                            slotProps={{ input: { 'aria-label': `${p.label} on or off` } }}
                        />
                    </span>
                </Tooltip>
            </Box>

            <Box sx={{ p: { xs: 1.75, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.75, flex: 1, minWidth: 0 }}>
                <Typography sx={hintSx}>{PROVIDER_BLURB[p.provider]}</Typography>

                {p.secret.set && !p.secret.readable && (
                    <Alert severity="error" sx={{ fontSize: '0.78rem', py: 0.25 }}>
                        The stored client secret can&apos;t be opened with the server&apos;s current encryption key (the key was changed or lost). Enter the secret again and
                        save. Until then nobody can connect.
                    </Alert>
                )}
                {p.secret.expiresSoon && p.secret.expiresOn && (
                    <Alert severity="warning" sx={{ fontSize: '0.78rem', py: 0.25 }}>
                        The client secret expires on {formatDay(p.secret.expiresOn)}. Create a new one in the provider&apos;s console, paste it here and update the expiry date.
                    </Alert>
                )}

                {/* Read-only values the admin pastes into the provider's console */}
                {p.redirectUri && <CopyField label="Redirect URI" value={p.redirectUri} />}
                {p.webhookUrls?.map((url, i) => (
                    <CopyField key={url} label={p.webhookUrls && p.webhookUrls.length > 1 ? `Webhook URL ${i + 1}` : 'Webhook URL'} value={url} />
                ))}

                <TextField
                    label="Client ID"
                    size="small"
                    fullWidth
                    value={form.clientId}
                    onChange={(e) => set('clientId', e.target.value)}
                    disabled={busy}
                    error={Boolean(errors.clientId)}
                    helperText={errors.clientId || (p.provider === 'microsoft' ? 'Application (client) ID from the app registration.' : undefined)}
                    autoComplete="off"
                    sx={inputSx}
                    slotProps={{ htmlInput: { maxLength: 200, spellCheck: false } }}
                />

                {/* Client secret (write-only) */}
                <Box sx={{ minWidth: 0 }}>
                    {showSecretField ? (
                        <TextField
                            label={p.secret.set ? 'New client secret' : 'Client secret'}
                            type="password"
                            size="small"
                            fullWidth
                            value={form.clientSecret}
                            onChange={(e) => set('clientSecret', e.target.value)}
                            disabled={busy}
                            error={Boolean(errors.clientSecret)}
                            helperText={errors.clientSecret || 'Stored encrypted. It is never shown again after you save.'}
                            autoComplete="new-password"
                            sx={inputSx}
                            slotProps={{ htmlInput: { maxLength: 2000, spellCheck: false } }}
                        />
                    ) : (
                        <>
                            <Typography sx={fieldLabelSx}>Client secret</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-900)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                                    •••• {p.secret.last4 ?? ''}
                                </Typography>
                                {changedBy(p.secret) && <Typography sx={{ ...hintSx, flex: 1, minWidth: 0 }}>· {changedBy(p.secret)}</Typography>}
                                <Button size="small" variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 32 }} onClick={() => setReplacingSecret(true)} disabled={busy}>
                                    Replace
                                </Button>
                            </Box>
                        </>
                    )}
                    {replacingSecret && (
                        <Button
                            size="small"
                            sx={{ ...secondaryButtonSx, mt: 0.5, minHeight: 32, px: 1 }}
                            onClick={() => {
                                setReplacingSecret(false);
                                set('clientSecret', '');
                            }}
                        >
                            Keep the current secret
                        </Button>
                    )}
                </Box>

                {hasExpiry && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                        <TextField
                            label="Secret expires on"
                            type="date"
                            size="small"
                            value={form.expiresOn}
                            onChange={(e) => set('expiresOn', e.target.value)}
                            disabled={busy}
                            error={Boolean(errors.clientSecretExpiresOn)}
                            helperText={errors.clientSecretExpiresOn || 'The page warns 30 days before.'}
                            sx={{ ...inputSx, width: { xs: '100%', sm: 220 } }}
                            slotProps={{ inputLabel: { shrink: true } }}
                        />
                        {p.secret.expiresSoon && (
                            <Box sx={{ pt: 1 }}>
                                <StatusChip tone="warning">Expires soon</StatusChip>
                            </Box>
                        )}
                    </Box>
                )}

                {p.provider === 'microsoft' && (
                    <TextField
                        label="Tenant ID"
                        size="small"
                        fullWidth
                        value={form.tenantId}
                        onChange={(e) => set('tenantId', e.target.value)}
                        disabled={busy}
                        error={Boolean(errors['settings.tenantId'])}
                        helperText={errors['settings.tenantId'] || 'Directory (tenant) ID, or the tenant domain (company.onmicrosoft.com). Only this company’s accounts can connect.'}
                        autoComplete="off"
                        sx={inputSx}
                        slotProps={{ htmlInput: { maxLength: 100, spellCheck: false } }}
                    />
                )}

                {p.webhookSecret && (
                    <Box sx={{ minWidth: 0 }}>
                        {showWebhookField ? (
                            <TextField
                                label={p.webhookSecret.set ? 'New webhook secret token' : 'Webhook secret token'}
                                type="password"
                                size="small"
                                fullWidth
                                value={form.webhookSecret}
                                onChange={(e) => set('webhookSecret', e.target.value)}
                                disabled={busy}
                                error={Boolean(errors.webhookSecret)}
                                helperText={errors.webhookSecret || 'The event subscription’s Secret Token. Stored encrypted.'}
                                autoComplete="new-password"
                                sx={inputSx}
                            />
                        ) : (
                            <>
                                <Typography sx={fieldLabelSx}>Webhook secret token</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-900)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                                        •••• {p.webhookSecret.last4 ?? ''}
                                    </Typography>
                                    <Button size="small" variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 32 }} onClick={() => setReplacingWebhook(true)} disabled={busy}>
                                        Replace
                                    </Button>
                                </Box>
                            </>
                        )}
                    </Box>
                )}

                {p.provider === 'google' && (
                    <Accordion
                        disableGutters
                        elevation={0}
                        sx={{
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '8px !important',
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            '&::before': { display: 'none' },
                        }}
                    >
                        <AccordionSummary
                            expandIcon={<ExpandMoreRoundedIcon />}
                            sx={{ minHeight: 40, fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', '&:hover': { color: 'var(--crm-text-blue-700)' } }}
                        >
                            Advanced
                        </AccordionSummary>
                        <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0 }}>
                            <TextField
                                select
                                label="Permission profile"
                                size="small"
                                value={form.scopeProfile}
                                onChange={(e) => set('scopeProfile', e.target.value as GoogleScopeProfile)}
                                disabled={busy}
                                helperText={
                                    form.scopeProfile === 'narrow'
                                        ? 'Narrow: the CRM only sees events it created plus free / busy times. Recommended.'
                                        : 'Broad: the CRM can read every event on the connected calendar (needed for bringing in customer meetings later).'
                                }
                                sx={inputSx}
                            >
                                <MenuItem value="narrow" sx={{ fontSize: '0.85rem' }}>
                                    Narrow (recommended)
                                </MenuItem>
                                <MenuItem value="broad" sx={{ fontSize: '0.85rem' }}>
                                    Broad
                                </MenuItem>
                            </TextField>
                            <FormControlLabel
                                control={<Switch size="small" checked={form.pkce} onChange={(e) => set('pkce', e.target.checked)} disabled={busy} />}
                                label={<Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>Use PKCE when employees connect (recommended)</Typography>}
                                sx={{ ml: 0, gap: 1 }}
                            />
                        </AccordionDetails>
                    </Accordion>
                )}

                {errors[''] && <Alert severity="error">{errors['']}</Alert>}

                {/* Last test */}
                {p.lastTest && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, color: p.lastTest.ok ? 'var(--crm-emerald-700)' : 'var(--crm-red-700)' }}>
                        {p.lastTest.ok ? <CheckCircleOutlineRoundedIcon sx={{ fontSize: 17, mt: '1px' }} /> : <ErrorOutlineRoundedIcon sx={{ fontSize: 17, mt: '1px' }} />}
                        <Typography sx={{ fontSize: '0.76rem', lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                            {p.lastTest.message ?? (p.lastTest.ok ? 'Credentials accepted.' : 'The test failed.')}{' '}
                            <Box component="span" sx={{ color: 'var(--mui-palette-text-secondary)' }}>
                                · tested {formatDateTime(p.lastTest.at)}
                            </Box>
                        </Typography>
                    </Box>
                )}
                {p.kind === 'calendar' && (
                    <Typography sx={hintSx}>The test checks the app credentials only. The final check is connecting your own calendar once the switch is on.</Typography>
                )}

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 'auto', pt: 0.5 }}>
                    {p.kind === 'calendar' && (
                        <Tooltip title={dirty ? 'Save or cancel your changes first.' : !p.configured ? 'Save the credentials first.' : ''} arrow>
                            <span>
                                <Button
                                    variant="outlined"
                                    sx={{ ...secondaryButtonSx, minHeight: 36 }}
                                    disabled={dirty || !p.configured || test.isPending || busy}
                                    onClick={() => void runTest()}
                                    startIcon={test.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                                >
                                    {test.isPending ? 'Testing…' : 'Test connection'}
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                    {(p.secret.set || p.webhookSecret?.set) && (
                        <Button
                            size="small"
                            sx={{
                                ...secondaryButtonSx,
                                minHeight: 36,
                                px: 1.25,
                                color: 'var(--mui-palette-text-secondary)',
                                '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
                            }}
                            disabled={busy || dirty}
                            onClick={() => setConfirmRemove(true)}
                        >
                            Remove secret
                        </Button>
                    )}
                    <Box sx={{ flex: 1 }} />
                    {dirty && (
                        <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={cancel} disabled={busy}>
                            Cancel
                        </Button>
                    )}
                    <Button variant="contained" sx={{ ...primaryButtonSx, minHeight: 36 }} disabled={!dirty || busy || !keyReady} onClick={() => void submit()}>
                        {save.isPending ? 'Saving…' : 'Save'}
                    </Button>
                </Box>
                {(p.updatedAt || p.updatedBy) && (
                    <Typography sx={{ ...hintSx, fontSize: '0.7rem' }}>
                        Last changed {formatDateTime(p.updatedAt)}
                        {p.updatedBy ? ` by ${p.updatedBy}` : ''}
                    </Typography>
                )}
            </Box>

            <ConfirmDeleteDialog open={confirmRemove} title={`Remove the ${p.label} secret?`} confirmLabel="Remove secret" onConfirm={() => void removeSecret()} onClose={() => setConfirmRemove(false)}>
                <span>
                    The stored secret{p.webhookSecret?.set ? 's are' : ' is'} deleted and {p.label} is switched off. Connected calendars stop syncing until a new secret is saved
                    and the switch is turned back on.
                </span>
            </ConfirmDeleteDialog>
        </Box>
    );
}
