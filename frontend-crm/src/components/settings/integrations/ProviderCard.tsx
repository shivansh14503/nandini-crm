'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Tooltip, Typography, Switch } from '@mui/material';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { ConfirmDeleteDialog, errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useClearProviderSecret, usePeople, useSaveProvider, useTestProvider } from '@/hooks/queries/useIntegrationsAdmin';
import { SERVICE_ACCOUNT_KEY_MAX_BYTES, type Person, type ProviderAdmin, type ProviderWebhook, type SaveProviderPayload, type TestConnectionResult } from '@/types/integration.types';
import { CopyField, PROVIDER_WEBHOOK_LABELS, ProviderMark, StatusChip, fieldErrorsOf, fieldLabelSx, formatDateTime, formatDay, hintSx, webhooksOffSentence, type ChipTone } from './integrationUi';

/**
 * One provider on Admin › API Integrations (Calendar Phase 2, P2-2b: admin-managed calendar sync).
 *   - Google Workspace: upload or paste the service account key (.json); the client email, numeric client ID and the
 *     exact scopes string are shown read-only to copy into the Admin console's domain-wide delegation.
 *   - Microsoft 365: one Entra app with the application permission Calendars.ReadWrite: client ID, client secret,
 *     tenant ID.
 *   - Both: which company email domains they serve, a two-step "Test connection" (the app, then optionally one
 *     person's calendar), health found while syncing, and people counts.
 *   - Zoom: credentials only (video meetings arrive in Phase 3).
 * Secrets are write-only: the form starts empty and the server never sends one back.
 */

/** What the card's form edits. */
interface ProviderForm {
    clientId: string;
    clientSecret: string;
    webhookSecret: string;
    expiresOn: string;
    tenantId: string;
    /** Google: the key file's text (write-only). */
    serviceAccountKey: string;
    domains: string[];
}

function formFrom(p: ProviderAdmin): ProviderForm {
    return {
        clientId: p.provider === 'google' ? '' : (p.clientId ?? ''),
        clientSecret: '',
        webhookSecret: '',
        expiresOn: p.secret.expiresOn ?? '',
        tenantId: p.settings.tenantId ?? '',
        serviceAccountKey: '',
        domains: [...p.domains].sort(),
    };
}

const sameForm = (a: ProviderForm, b: ProviderForm) => (Object.keys(a) as (keyof ProviderForm)[]).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

/** Only what changed goes to the server; empty secret fields keep the stored ones. */
function payloadFor(p: ProviderAdmin, base: ProviderForm, form: ProviderForm): SaveProviderPayload {
    const payload: SaveProviderPayload = {};
    const settings: NonNullable<SaveProviderPayload['settings']> = {};
    if (p.provider === 'google') {
        if (form.serviceAccountKey.trim()) payload.serviceAccountKey = form.serviceAccountKey.trim();
    } else {
        if (form.clientId.trim() !== base.clientId.trim()) payload.clientId = form.clientId.trim() || null;
        if (form.clientSecret.trim()) payload.clientSecret = form.clientSecret.trim();
        if (form.expiresOn !== base.expiresOn) payload.clientSecretExpiresOn = form.expiresOn || null;
    }
    if (p.provider === 'zoom' && form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
    if (p.provider === 'microsoft' && form.tenantId.trim() !== base.tenantId.trim()) settings.tenantId = form.tenantId.trim() || null;
    if (p.kind === 'calendar' && JSON.stringify(form.domains) !== JSON.stringify(base.domains)) settings.domains = form.domains;
    if (Object.keys(settings).length) payload.settings = settings;
    return payload;
}

/** A first look at a key file in the browser (the server checks it properly); never echoes the key. */
function keyFilePreview(text: string): { clientEmail: string } | { error: string } | null {
    if (!text.trim()) return null;
    try {
        const json = JSON.parse(text) as Record<string, unknown>;
        if (json.type !== 'service_account') return { error: 'This is not a service account key (type must be "service_account").' };
        if (typeof json.client_email !== 'string' || typeof json.private_key !== 'string') return { error: 'The key file has no client_email or private key.' };
        return { clientEmail: json.client_email };
    } catch {
        return { error: 'This is not a JSON key file.' };
    }
}

const credentialsUnreadable = (p: ProviderAdmin) => (p.secret.set && !p.secret.readable) || Boolean(p.serviceAccount?.set && !p.serviceAccount.readable);

/** Not set up / Off / On / Needs attention. */
export function providerStatus(p: ProviderAdmin): { tone: ChipTone; label: string; title?: string } {
    if (credentialsUnreadable(p)) return { tone: 'error', label: 'Needs attention', title: "The stored credentials can't be opened with the server's current key." };
    if (!p.configured) return { tone: 'neutral', label: 'Not set up' };
    if (p.enabled && p.health.status === 'error') return { tone: 'error', label: 'Not working', title: p.health.message ?? undefined };
    if (p.enabled && p.secret.expiresSoon) return { tone: 'warning', label: 'Needs attention', title: 'The client secret expires soon.' };
    return p.enabled ? { tone: 'success', label: 'On' } : { tone: 'neutral', label: 'Off' };
}

const PROVIDER_BLURB: Record<ProviderAdmin['provider'], string> = {
    google:
        'A service account with domain-wide delegation puts CRM meetings on everyone’s Google Calendar. Nobody signs in: people on the domains below are synced automatically.',
    microsoft:
        'One Entra app with the application permission Calendars.ReadWrite (admin consent) puts CRM meetings on everyone’s Outlook calendar. Nobody signs in. To limit the app to some mailboxes, scope it with RBAC for Applications in Exchange Online.',
    zoom: 'Video meeting links on CRM meetings. You can store the app credentials now; the switch turns on when video meetings ship.',
};

const monoSx = { fontSize: '0.8rem', color: 'var(--crm-slate-900)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' } as const;

const domainChipSx = (on: boolean, taken: boolean) =>
    ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: 36,
        px: 1.25,
        borderRadius: '999px',
        fontSize: '0.78rem',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: taken ? 'not-allowed' : 'pointer',
        border: on ? '1px solid var(--mui-palette-primary-softBorder)' : '1px solid var(--mui-palette-border-main)',
        backgroundColor: on ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)',
        color: taken ? 'var(--mui-palette-text-muted)' : on ? 'var(--crm-text-blue-900)' : 'var(--crm-slate-700)',
        transition: 'all 0.15s ease',
        '&:hover': taken ? {} : { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
        '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
    }) as const;

/** Which company email domains a calendar provider serves: one toggle per company domain (a domain has one provider). */
function DomainsField({
    value,
    companyDomains,
    takenBy,
    disabled,
    error,
    onChange,
}: {
    value: string[];
    companyDomains: string[];
    takenBy: Record<string, string>;
    disabled: boolean;
    error?: string;
    onChange: (domains: string[]) => void;
}) {
    // A stored domain that is no longer a company domain still shows, so it can be removed.
    const all = [...new Set([...companyDomains, ...value])].sort();
    const toggle = (domain: string) => onChange(value.includes(domain) ? value.filter((d) => d !== domain) : [...value, domain].sort());
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={fieldLabelSx}>Email domains it serves</Typography>
            <Box role="group" aria-label="Email domains" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {all.map((domain) => {
                    const on = value.includes(domain);
                    const taken = !on && Boolean(takenBy[domain]);
                    return (
                        <Tooltip key={domain} title={taken ? `Served by ${takenBy[domain]}` : ''} arrow disableHoverListener={!taken} disableFocusListener={!taken}>
                            <Box
                                component="button"
                                type="button"
                                aria-pressed={on}
                                disabled={disabled || taken}
                                onClick={() => toggle(domain)}
                                sx={domainChipSx(on, taken)}
                            >
                                {on && <CheckRoundedIcon sx={{ fontSize: 15 }} />}
                                {domain}
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>
            <Typography sx={{ ...hintSx, mt: 0.5, color: error ? 'var(--mui-palette-error-main)' : hintSx.color }}>
                {error || 'Company domains come from the calendar settings below. Each domain belongs to one provider; people on it are synced automatically.'}
            </Typography>
        </Box>
    );
}

/** The two steps of the last test run in this session. */
function TestSteps({ result }: { result: TestConnectionResult }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {result.steps.map((s) => (
                <Box key={s.step} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, color: s.ok ? 'var(--crm-emerald-700)' : 'var(--crm-red-700)' }}>
                    {s.ok ? <CheckCircleOutlineRoundedIcon sx={{ fontSize: 17, mt: '1px' }} /> : <ErrorOutlineRoundedIcon sx={{ fontSize: 17, mt: '1px' }} />}
                    <Typography sx={{ fontSize: '0.76rem', lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                        <Box component="span" sx={{ fontWeight: 700 }}>
                            {s.step === 'app' ? 'App: ' : 'As the person: '}
                        </Box>
                        {s.message}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
}

export interface ProviderCardProps {
    provider: ProviderAdmin;
    /** False while the server has no readable encryption key: nothing can be saved. */
    keyReady: boolean;
    companyDomains: string[];
    /** Domains other providers serve → their label. */
    takenBy: Record<string, string>;
    onDirtyChange: (provider: ProviderAdmin['provider'], dirty: boolean) => void;
    onToast: (message: string, severity?: 'success' | 'error') => void;
    /** Opens the People list filtered to calendar problems. */
    onShowProblems?: () => void;
    /** The company's first-sync window (Calendar settings), for the switch-on confirmation (P2-3c). */
    backfillDays?: number;
}

/** A plain (non-destructive) confirmation, the look of builderUi's ConfirmDeleteDialog with a brand button. */
function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onClose }: { open: boolean; title: string; children: React.ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>{title}</DialogTitle>
            <DialogContent sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)', display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Button onClick={onClose} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={onConfirm} sx={{ ...primaryButtonSx, color: '#ffffff' }}>
                    {confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/**
 * People a calendar provider would start syncing when switched on (P2-3c confirmation): an email on one of its domains
 * or an admin's choice of this provider, not excluded. An estimate from the People list (the server's rules decide).
 */
export function peopleToSync(people: readonly Person[] | undefined, provider: ProviderAdmin['provider'], domains: readonly string[]): number {
    const own = new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean));
    return (people ?? []).filter((person) => {
        const { choice } = person.calendar;
        if (!person.email || choice?.excluded) return false;
        if (choice?.provider) return choice.provider === provider;
        return own.has(person.email.split('@').pop()?.trim().toLowerCase() ?? '');
    }).length;
}

/**
 * The card's webhook line (P2-7): the CRM creates and renews the calendar channels itself (nothing to set up in the
 * provider's console); this says whether they deliver. Counts are people with a synced calendar.
 */
function ProviderWebhookLine({ webhook }: { webhook: ProviderWebhook }) {
    const words = PROVIDER_WEBHOOK_LABELS[webhook.status];
    const detail =
        webhook.status === 'unavailable'
            ? webhooksOffSentence(webhook.reason, 'Calendars sync by polling.')
            : webhook.status === 'off'
              ? 'Switch the provider on to start them.'
              : [
                    `${webhook.active} instant`,
                    webhook.waiting > 0 ? `${webhook.waiting} starting` : null,
                    webhook.failed > 0 ? `${webhook.failed} refused (polling instead; retried every few hours)` : null,
                ]
                    .filter(Boolean)
                    .join(' · ');
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={fieldLabelSx}>Instant updates (webhooks)</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                <StatusChip tone={words.tone}>{words.label}</StatusChip>
                <Typography sx={{ ...hintSx, minWidth: 0, overflowWrap: 'anywhere' }}>{detail}</Typography>
            </Box>
        </Box>
    );
}

/** One provider's credentials, domains, test and switch on Admin › API Integrations. */
export function ProviderCard({ provider, keyReady, companyDomains, takenBy, onDirtyChange, onToast, onShowProblems, backfillDays }: ProviderCardProps) {
    const p = provider;
    const isGoogle = p.provider === 'google';
    const serverForm = useMemo(() => formFrom(p), [p]);
    const [base, setBase] = useState<ProviderForm>(serverForm);
    const [form, setForm] = useState<ProviderForm>(serverForm);
    const [replacingSecret, setReplacingSecret] = useState(false);
    const [replacingWebhook, setReplacingWebhook] = useState(false);
    const [replacingKey, setReplacingKey] = useState(false);
    const [keyFileName, setKeyFileName] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [confirmEnable, setConfirmEnable] = useState(false);
    const [asUsername, setAsUsername] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

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
    const people = usePeople();
    const busy = save.isPending || clear.isPending;

    const set = <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => {
            if (!Object.keys(e).length) return e;
            const next = { ...e };
            delete next[key === 'tenantId' ? 'settings.tenantId' : key === 'domains' ? 'settings.domains' : key === 'expiresOn' ? 'clientSecretExpiresOn' : key];
            delete next[''];
            return next;
        });
    };

    const cancel = () => {
        setForm(base);
        setReplacingSecret(false);
        setReplacingWebhook(false);
        setReplacingKey(false);
        setKeyFileName('');
        setErrors({});
    };

    const pickKeyFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > SERVICE_ACCOUNT_KEY_MAX_BYTES) {
            setErrors((e) => ({ ...e, serviceAccountKey: 'That file is too large to be a service account key.' }));
            return;
        }
        try {
            set('serviceAccountKey', await file.text());
            setKeyFileName(file.name);
        } catch {
            setErrors((e) => ({ ...e, serviceAccountKey: "The file couldn't be read." }));
        }
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
            setReplacingKey(false);
            setKeyFileName('');
            setErrors({});
            setTestResult(null);
            onToast(payload.serviceAccountKey || payload.clientSecret || payload.clientId !== undefined ? `${p.label} saved. Run Test connection next.` : `${p.label} saved.`);
        } catch (err) {
            setErrors(fieldErrorsOf(err));
            onToast(errorMessage(err, `Could not save ${p.label}.`), 'error');
        }
    };

    const toggleEnabled = async (enabled: boolean) => {
        try {
            await save.mutateAsync({ provider: p.provider, payload: { enabled } });
            onToast(
                enabled
                    ? `${p.label} is on. People on its domains are being enrolled.`
                    : `${p.label} is off. Calendar sync stops for its people; events already in their calendars stay.`,
            );
        } catch (err) {
            onToast(errorMessage(err, `Could not turn ${p.label} ${enabled ? 'on' : 'off'}.`), 'error');
        }
    };

    const runTest = async () => {
        try {
            const result = await test.mutateAsync({ provider: p.provider, payload: asUsername ? { asUsername } : {} });
            setTestResult(result);
            onToast(result.ok ? 'Test passed.' : result.message, result.ok ? 'success' : 'error');
        } catch (err) {
            onToast(errorMessage(err, 'Could not run the connection test.'), 'error');
        }
    };

    const removeSecret = async () => {
        setConfirmRemove(false);
        try {
            await clear.mutateAsync(p.provider);
            cancel();
            setTestResult(null);
            onToast(isGoogle ? 'Google key removed and Google Workspace switched off.' : `${p.label} secret removed and the integration switched off.`);
        } catch (err) {
            onToast(errorMessage(err, isGoogle ? 'Could not remove the key.' : 'Could not remove the secret.'), 'error');
        }
    };

    const status = providerStatus(p);
    const enableBlocked = !p.available
        ? 'Video meetings · Phase 3'
        : !keyReady
          ? 'Set the encryption key on the server first.'
          : dirty
            ? 'Save or cancel your changes first.'
            : p.enabled
              ? ''
              : !p.configured
                ? isGoogle
                    ? 'Upload the service account key first.'
                    : 'Save a client ID, client secret and tenant ID first.'
                : !p.appTested
                  ? 'Run Test connection with these credentials first.'
                  : '';
    const showSecretField = !isGoogle && (!p.secret.set || !p.secret.readable || replacingSecret);
    const showWebhookField = p.webhookSecret !== null && (!p.webhookSecret.set || !p.webhookSecret.readable || replacingWebhook);
    const showKeyField = isGoogle && (!p.serviceAccount?.set || !p.serviceAccount.readable || replacingKey);
    const keyPreview = isGoogle ? keyFilePreview(form.serviceAccountKey) : null;
    const hasExpiry = p.provider === 'microsoft' || p.provider === 'zoom';
    const changedBy = (s: { updatedAt: string | null; updatedBy: string | null }) =>
        [s.updatedAt ? `changed ${formatDay(s.updatedAt)}` : '', s.updatedBy ? `by ${s.updatedBy}` : ''].filter(Boolean).join(' ');
    const hasStoredSecret = p.secret.set || Boolean(p.webhookSecret?.set) || Boolean(p.serviceAccount?.set);
    // Only people this provider would sync: the server refuses anyone else (409 CALENDAR_TEST_NOT_ALLOWED).
    const testPeople = useMemo(
        () =>
            (people.data ?? []).filter((person) => {
                const { choice, target, reason } = person.calendar;
                if (!person.email || choice?.excluded || reason === 'not_company') return false;
                if (choice?.provider && choice.provider !== p.provider) return false;
                return !target || target.provider === p.provider;
            }),
        [people.data, p.provider],
    );
    const selectedPerson = testPeople.find((person) => person.username === asUsername) ?? null;
    const counts = p.counts;

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
                        {p.kind === 'calendar' ? 'Company calendar sync' : 'Video meetings · Phase 3'}
                    </Typography>
                </Box>
                <StatusChip tone={status.tone} title={status.title}>
                    {status.label}
                </StatusChip>
                <Tooltip title={enableBlocked} arrow disableHoverListener={!enableBlocked} disableFocusListener={!enableBlocked}>
                    <span>
                        <Switch
                            checked={p.enabled}
                            disabled={Boolean(enableBlocked) || busy}
                            onChange={(e) => {
                                // Switching a calendar on copies upcoming meetings to everyone's calendar: confirmed first (P2-3c).
                                if (e.target.checked && p.kind === 'calendar') setConfirmEnable(true);
                                else void toggleEnabled(e.target.checked);
                            }}
                            slotProps={{ input: { 'aria-label': `${p.label} on or off` } }}
                        />
                    </span>
                </Tooltip>
            </Box>

            <Box sx={{ p: { xs: 1.75, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.75, flex: 1, minWidth: 0 }}>
                <Typography sx={hintSx}>{PROVIDER_BLURB[p.provider]}</Typography>

                {p.enabled && p.health.status === 'error' && (
                    <Alert severity="error" sx={{ fontSize: '0.78rem', py: 0.25, '& .MuiAlert-message': { minWidth: 0 } }}>
                        <Box component="span" sx={{ fontWeight: 700 }}>
                            Calendar sync has stopped.{' '}
                        </Box>
                        {p.health.message}
                        {p.health.at ? ` (found ${formatDateTime(p.health.at)})` : ''} Fix it, then run Test connection.
                    </Alert>
                )}
                {credentialsUnreadable(p) && (
                    <Alert severity="error" sx={{ fontSize: '0.78rem', py: 0.25 }}>
                        The stored {isGoogle ? 'key' : 'client secret'} can&apos;t be opened with the server&apos;s current encryption key (the key was changed or lost).{' '}
                        {isGoogle ? 'Upload the key again' : 'Enter the secret again'} and save. Until then calendar sync is paused.
                    </Alert>
                )}
                {p.secret.expiresSoon && p.secret.expiresOn && (
                    <Alert severity="warning" sx={{ fontSize: '0.78rem', py: 0.25 }}>
                        The client secret expires on {formatDay(p.secret.expiresOn)}. Create a new one in the provider&apos;s console, paste it here and update the expiry date.
                    </Alert>
                )}

                {/* Google: the service account key */}
                {isGoogle && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
                        {showKeyField ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                                <Typography sx={fieldLabelSx}>{p.serviceAccount?.set ? 'New service account key' : 'Service account key'}</Typography>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Button
                                        variant="outlined"
                                        sx={{ ...secondaryButtonSx, minHeight: 40 }}
                                        startIcon={<UploadFileRoundedIcon />}
                                        onClick={() => fileInput.current?.click()}
                                        disabled={busy || !keyReady}
                                    >
                                        Upload key (.json)
                                    </Button>
                                    {keyFileName && <Typography sx={{ ...hintSx, overflowWrap: 'anywhere', minWidth: 0 }}>{keyFileName}</Typography>}
                                    <input
                                        ref={fileInput}
                                        type="file"
                                        accept="application/json,.json"
                                        hidden
                                        onChange={(e) => {
                                            void pickKeyFile(e.target.files?.[0]);
                                            e.target.value = '';
                                        }}
                                    />
                                </Box>
                                <TextField
                                    label="…or paste the key file’s contents"
                                    size="small"
                                    fullWidth
                                    multiline
                                    minRows={2}
                                    maxRows={6}
                                    value={keyFileName ? '' : form.serviceAccountKey}
                                    placeholder={keyFileName ? `${keyFileName} loaded` : '{ "type": "service_account", … }'}
                                    onChange={(e) => {
                                        setKeyFileName('');
                                        set('serviceAccountKey', e.target.value);
                                    }}
                                    disabled={busy || !keyReady}
                                    error={Boolean(errors.serviceAccountKey) || Boolean(keyPreview && 'error' in keyPreview)}
                                    helperText={
                                        errors.serviceAccountKey ||
                                        (keyPreview && 'error' in keyPreview ? keyPreview.error : keyPreview ? `Key for ${keyPreview.clientEmail}. Save to store it encrypted.` : 'Stored encrypted. It is never shown again after you save.')
                                    }
                                    autoComplete="off"
                                    sx={{ ...inputSx, '& textarea': monoSx }}
                                    slotProps={{ htmlInput: { spellCheck: false, maxLength: SERVICE_ACCOUNT_KEY_MAX_BYTES } }}
                                />
                                {replacingKey && (
                                    <Button
                                        size="small"
                                        sx={{ ...secondaryButtonSx, minHeight: 32, px: 1, alignSelf: 'flex-start' }}
                                        onClick={() => {
                                            setReplacingKey(false);
                                            setKeyFileName('');
                                            set('serviceAccountKey', '');
                                        }}
                                    >
                                        Keep the current key
                                    </Button>
                                )}
                            </Box>
                        ) : (
                            p.serviceAccount && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                    <Typography sx={fieldLabelSx}>Service account key</Typography>
                                    <Typography sx={{ ...monoSx, fontSize: '0.74rem', minWidth: 0, overflowWrap: 'anywhere' }}>{p.serviceAccount.privateKeyId?.slice(0, 12)}…</Typography>
                                    {changedBy(p.serviceAccount) && <Typography sx={{ ...hintSx, flex: 1, minWidth: 0 }}>· {changedBy(p.serviceAccount)}</Typography>}
                                    <Button size="small" variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={() => setReplacingKey(true)} disabled={busy}>
                                        Replace key
                                    </Button>
                                </Box>
                            )
                        )}
                        {p.serviceAccount?.clientEmail && <CopyField label="Service account" value={p.serviceAccount.clientEmail} />}
                        {p.serviceAccount?.clientId && <CopyField label="Client ID (for domain-wide delegation)" value={p.serviceAccount.clientId} />}
                        {p.scopesAdminConsole && <CopyField label="OAuth scopes (paste exactly)" value={p.scopesAdminConsole} />}
                        <Typography sx={hintSx}>
                            In the Google Admin console open Security › Access and data control › API controls › Manage domain-wide delegation, add the client ID above with
                            these scopes. It can take a few minutes (rarely up to 24 h) before Google accepts it.
                        </Typography>
                    </Box>
                )}

                {/* Microsoft / Zoom: client credentials */}
                {!isGoogle && (
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
                )}

                {!isGoogle && (
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
                                helperText={errors.clientSecret || 'The secret’s Value (not its ID). Stored encrypted; never shown again after you save.'}
                                autoComplete="new-password"
                                sx={inputSx}
                                slotProps={{ htmlInput: { maxLength: 2000, spellCheck: false } }}
                            />
                        ) : (
                            <>
                                <Typography sx={fieldLabelSx}>Client secret</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                    <Typography sx={monoSx}>•••• {p.secret.last4 ?? ''}</Typography>
                                    {changedBy(p.secret) && <Typography sx={{ ...hintSx, flex: 1, minWidth: 0 }}>· {changedBy(p.secret)}</Typography>}
                                    <Button size="small" variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={() => setReplacingSecret(true)} disabled={busy}>
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
                )}

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
                        helperText={errors['settings.tenantId'] || 'Directory (tenant) ID, or the tenant domain (company.onmicrosoft.com).'}
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
                                    <Typography sx={monoSx}>•••• {p.webhookSecret.last4 ?? ''}</Typography>
                                    <Button size="small" variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 36 }} onClick={() => setReplacingWebhook(true)} disabled={busy}>
                                        Replace
                                    </Button>
                                </Box>
                            </>
                        )}
                    </Box>
                )}

                {p.webhookUrls?.map((url, i) => (
                    <CopyField key={url} label={p.webhookUrls && p.webhookUrls.length > 1 ? `Webhook URL ${i + 1}` : 'Webhook URL'} value={url} />
                ))}

                {p.webhook && <ProviderWebhookLine webhook={p.webhook} />}

                {p.kind === 'calendar' && (
                    <DomainsField
                        value={form.domains}
                        companyDomains={companyDomains}
                        takenBy={takenBy}
                        disabled={busy}
                        error={errors['settings.domains']}
                        onChange={(domains) => set('domains', domains)}
                    />
                )}

                {errors[''] && <Alert severity="error">{errors['']}</Alert>}

                {/* People counts */}
                {p.kind === 'calendar' && (p.enabled || counts.ok + counts.pending + counts.error + counts.excluded > 0) && (
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                        <StatusChip tone="success">{counts.ok} synced</StatusChip>
                        {counts.pending > 0 && <StatusChip tone="info">{counts.pending} setting up</StatusChip>}
                        {counts.error > 0 &&
                            (onShowProblems ? (
                                <Box
                                    component="button"
                                    type="button"
                                    onClick={onShowProblems}
                                    // A 32 px tap target around the small chip (responsive-ui rule 4).
                                    sx={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        minHeight: 32,
                                        px: 0.25,
                                        py: 0,
                                        border: 0,
                                        background: 'none',
                                        cursor: 'pointer',
                                        borderRadius: '999px',
                                        '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                    }}
                                    aria-label={`Show the ${counts.error} people with calendar problems`}
                                >
                                    <StatusChip tone="error">{counts.error} with problems</StatusChip>
                                </Box>
                            ) : (
                                <StatusChip tone="error">{counts.error} with problems</StatusChip>
                            ))}
                        {counts.excluded > 0 && <StatusChip tone="neutral">{counts.excluded} excluded</StatusChip>}
                    </Box>
                )}

                {/* Last test */}
                {testResult ? (
                    <TestSteps result={testResult} />
                ) : (
                    p.lastTest && (
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, color: p.lastTest.ok ? 'var(--crm-emerald-700)' : 'var(--crm-red-700)' }}>
                            {p.lastTest.ok ? <CheckCircleOutlineRoundedIcon sx={{ fontSize: 17, mt: '1px' }} /> : <ErrorOutlineRoundedIcon sx={{ fontSize: 17, mt: '1px' }} />}
                            <Typography sx={{ fontSize: '0.76rem', lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                                {p.lastTest.message ?? (p.lastTest.ok ? 'Credentials accepted.' : 'The test failed.')}{' '}
                                <Box component="span" sx={{ color: 'var(--mui-palette-text-secondary)' }}>
                                    · tested {formatDateTime(p.lastTest.at)}
                                </Box>
                            </Typography>
                        </Box>
                    )
                )}

                {p.kind === 'calendar' && p.available && (
                    <Autocomplete
                        size="small"
                        options={testPeople}
                        value={selectedPerson}
                        onChange={(_e, value) => setAsUsername(value?.username ?? null)}
                        getOptionLabel={(o) => `${o.fullName || o.username} (${o.email})`}
                        isOptionEqualToValue={(a, b) => a.username === b.username}
                        loading={people.isLoading}
                        disabled={dirty || !p.configured || test.isPending}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Also test as (optional)"
                                helperText={isGoogle ? 'Reads one event from this person’s calendar as them: proves domain-wide delegation.' : 'Reads one event from this person’s mailbox: proves the app may reach it.'}
                                sx={inputSx}
                            />
                        )}
                    />
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
                    {hasStoredSecret && (
                        <Button
                            size="small"
                            sx={{
                                ...secondaryButtonSx,
                                minHeight: 36,
                                px: 1.25,
                                color: 'var(--mui-palette-text-secondary)',
                                '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)', borderColor: 'var(--mui-palette-error-softBorder)' },
                            }}
                            disabled={busy || dirty}
                            onClick={() => setConfirmRemove(true)}
                        >
                            {isGoogle ? 'Remove key' : 'Remove secret'}
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

            <ConfirmDialog
                open={confirmEnable}
                title={`Turn ${p.label} on?`}
                confirmLabel="Turn on"
                onConfirm={() => {
                    setConfirmEnable(false);
                    void toggleEnabled(true);
                }}
                onClose={() => setConfirmEnable(false)}
            >
                <span>
                    {(() => {
                        const n = peopleToSync(people.data, p.provider, p.domains);
                        return people.isLoading ? 'People on its domains will start syncing.' : `${n} ${n === 1 ? 'person' : 'people'} will start syncing.`;
                    })()}{' '}
                    Upcoming CRM meetings{backfillDays ? ` (next ${backfillDays} days)` : ''} will be copied to their calendars as private entries; invitations are sent
                    only when each owner presses Send invitations.
                </span>
            </ConfirmDialog>

            <ConfirmDeleteDialog
                open={confirmRemove}
                title={isGoogle ? 'Remove the Google key?' : `Remove the ${p.label} secret?`}
                confirmLabel={isGoogle ? 'Remove key' : 'Remove secret'}
                onConfirm={() => void removeSecret()}
                onClose={() => setConfirmRemove(false)}
            >
                <span>
                    The stored {isGoogle ? 'key is' : p.webhookSecret?.set ? 'secrets are' : 'secret is'} deleted and {p.label} is switched off. Calendar sync stops for its people
                    until new credentials are saved, tested and the switch is turned back on. Events already in their calendars stay.
                </span>
            </ConfirmDeleteDialog>
        </Box>
    );
}
