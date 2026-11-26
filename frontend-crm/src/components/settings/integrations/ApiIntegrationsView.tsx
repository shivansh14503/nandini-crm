'use client';

import React, { useCallback, useState } from 'react';
import { Alert, AlertTitle, Box, Button, Skeleton, Typography } from '@mui/material';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import { AppToast } from '@/components/common/AppToast';
import { errorMessage, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useLeaveGuard } from '@/components/settings/useLeaveGuard';
import { useIntegrationsAdmin } from '@/hooks/queries/useIntegrationsAdmin';
import type { IntegrationsAdmin } from '@/types/integration.types';
import { CalendarSyncSettingsCard } from './CalendarSyncSettingsCard';
import { PeopleTable } from './PeopleTable';
import { ProviderCard } from './ProviderCard';
import { SyncTypesCard } from './SyncTypesCard';
import { CopyField, StatusChip, formatDateTime, hintSx } from './integrationUi';

/** The command the owner runs once to make the key (also in backend-crm/.env.example). */
export const KEY_GENERATE_COMMAND = `node -e "console.log('k1:'+require('crypto').randomBytes(32).toString('base64'))"`;

const LEAVE_MESSAGE = 'You have unsaved changes on API Integrations. Leave without saving?';

function ReadinessAlerts({ data }: { data: IntegrationsAdmin }) {
    const notHttps = Boolean(data.publicApiUrl && data.publicApiUrl.startsWith('http://'));
    return (
        <>
            {data.keyStatus === 'missing' && (
                <Alert severity="warning" sx={{ '& .MuiAlert-message': { minWidth: 0, flex: 1 } }}>
                    <AlertTitle sx={{ fontSize: '0.86rem', fontWeight: 700 }}>The server has no encryption key yet</AlertTitle>
                    <Typography sx={{ fontSize: '0.8rem', mb: 1 }}>
                        Client secrets are stored encrypted, so nothing can be saved until the key is set. Generate a key once, set it as{' '}
                        <code>INTEGRATIONS_ENCRYPTION_KEY</code> on the API <strong>and</strong> the worker, keep a copy in the password manager, then restart both.
                    </Typography>
                    <CopyField label="Generate the key" value={KEY_GENERATE_COMMAND} />
                </Alert>
            )}
            {data.keyStatus === 'unreadable' && (
                <Alert severity="error">
                    <AlertTitle sx={{ fontSize: '0.86rem', fontWeight: 700 }}>A stored secret can&apos;t be opened</AlertTitle>
                    <Typography sx={{ fontSize: '0.8rem' }}>
                        The server&apos;s <code>INTEGRATIONS_ENCRYPTION_KEY</code> no longer opens a stored secret (the key was replaced without keeping the old one). Put the old key
                        back after the new one (<code>k2:…,k1:…</code>) and run <code>npm run integrations:reencrypt</code>, or enter the affected secret again below.
                    </Typography>
                </Alert>
            )}
            {data.ready.reason === 'public_url_missing' && (
                <Alert severity="error">
                    <AlertTitle sx={{ fontSize: '0.86rem', fontWeight: 700 }}>The public API address is not set</AlertTitle>
                    <Typography sx={{ fontSize: '0.8rem' }}>
                        Set <code>PUBLIC_API_URL</code> on the API (the https address the browser and Google / Microsoft reach it at) and restart. Sign-in redirects and webhooks are
                        built from it.
                    </Typography>
                </Alert>
            )}
            {notHttps && data.keyStatus !== 'missing' && (
                <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                    Instant updates need HTTPS; until then changes from calendars arrive within 5 minutes during office hours.
                </Alert>
            )}
        </>
    );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mui-palette-text-secondary)' }}>{label}</Typography>
            <Box sx={{ minWidth: 0, fontSize: '0.82rem', color: 'var(--crm-slate-900)' }}>{children}</Box>
        </Box>
    );
}

function ServerFacts({ data }: { data: IntegrationsAdmin }) {
    const notHttps = Boolean(data.publicApiUrl && data.publicApiUrl.startsWith('http://'));
    return (
        <Box
            sx={{
                ...surfaceSx,
                p: { xs: 1.75, sm: 2 },
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))', lg: 'minmax(0,2fr) repeat(3, minmax(0,1fr))' },
                gap: 2,
                alignItems: 'start',
            }}
        >
            <Fact label="Public API address">
                {data.publicApiUrl ? (
                    <CopyField value={data.publicApiUrl} />
                ) : (
                    <StatusChip tone="error">Not set</StatusChip>
                )}
                {data.publicApiUrl && !data.publicApiUrlConfigured && <Typography sx={{ ...hintSx, mt: 0.5 }}>Development default (PUBLIC_API_URL not set).</Typography>}
            </Fact>
            <Fact label="Encryption key">
                {data.keyStatus === 'missing' ? (
                    <StatusChip tone="warning">Not set</StatusChip>
                ) : (
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <StatusChip tone={data.keyStatus === 'ok' ? 'success' : 'error'}>{data.keyStatus === 'ok' ? 'Set' : 'Secret unreadable'}</StatusChip>
                        {data.activeKeyId && <Typography sx={hintSx}>key {data.activeKeyId}</Typography>}
                    </Box>
                )}
            </Fact>
            <Fact label="Sync worker">
                {data.worker ? (
                    <Typography sx={{ fontSize: '0.82rem' }}>Last seen {formatDateTime(data.worker.lastSeenAt)}</Typography>
                ) : (
                    <Typography sx={hintSx}>Arrives with calendar sync</Typography>
                )}
            </Fact>
            <Fact label="Webhooks">
                {data.webhooksActive ? (
                    <StatusChip tone="success">Active</StatusChip>
                ) : notHttps ? (
                    <StatusChip tone="warning" title="Google and Microsoft only call https addresses.">
                        Needs HTTPS
                    </StatusChip>
                ) : (
                    <Typography sx={hintSx}>Arrive with calendar sync</Typography>
                )}
            </Fact>
        </Box>
    );
}

/**
 * Admin › API Integrations: server readiness, Google / Microsoft / Zoom credentials, company calendar settings, which
 * Followup Types go to calendars, and people's company emails.
 */
export function ApiIntegrationsView() {
    const query = useIntegrationsAdmin();
    const data = query.data;
    const [dirtyParts, setDirtyParts] = useState<Record<string, boolean>>({});
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    const markDirty = useCallback((part: string, dirty: boolean) => setDirtyParts((d) => (Boolean(d[part]) === dirty ? d : { ...d, [part]: dirty })), []);
    const onProviderDirty = useCallback((provider: string, dirty: boolean) => markDirty(`provider:${provider}`, dirty), [markDirty]);
    const onSettingsDirty = useCallback((dirty: boolean) => markDirty('settings', dirty), [markDirty]);
    const onSyncTypesDirty = useCallback((dirty: boolean) => markDirty('syncTypes', dirty), [markDirty]);
    const showToast = useCallback((message: string, severity: 'success' | 'error' = 'success') => setToast({ open: true, message, severity }), []);

    useLeaveGuard(Object.values(dirtyParts).some(Boolean), LEAVE_MESSAGE);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Header */}
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        color: 'var(--crm-text-blue-600)',
                    }}
                >
                    <HubOutlinedIcon />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                        API Integrations
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, lineHeight: 1.55 }}>
                        Connect the CRM to Google Workspace and Microsoft 365 so employees can sync CRM meetings and follow-ups with their own calendars. Everything stays
                        off until you turn a provider on; employees then connect from Connected calendars.
                    </Typography>
                </Box>
            </Box>

            {query.isLoading ? (
                <>
                    <Skeleton variant="rounded" height={90} sx={{ borderRadius: '12px' }} />
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))', xl: 'repeat(3, minmax(0,1fr))' }, gap: 2 }}>
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} variant="rounded" height={360} sx={{ borderRadius: '12px' }} />
                        ))}
                    </Box>
                </>
            ) : !data ? (
                // Full-page error only when nothing is cached: a failed background refetch keeps the cards (and their
                // unsaved edits) mounted and shows the inline alert below instead.
                <Alert
                    severity="error"
                    action={
                        <Button size="small" variant="outlined" sx={secondaryButtonSx} onClick={() => void query.refetch()}>
                            Try again
                        </Button>
                    }
                >
                    {errorMessage(query.error, 'Could not load API Integrations.')}
                </Alert>
            ) : (
                <>
                    {query.isError && (
                        <Alert
                            severity="warning"
                            action={
                                <Button size="small" variant="outlined" sx={secondaryButtonSx} onClick={() => void query.refetch()} disabled={query.isFetching}>
                                    Try again
                                </Button>
                            }
                            sx={{ '& .MuiAlert-message': { minWidth: 0 }, flexWrap: 'wrap' }}
                        >
                            {errorMessage(query.error, 'Could not refresh API Integrations.')} The values below may be out of date; unsaved edits are kept.
                        </Alert>
                    )}
                    <ReadinessAlerts data={data} />
                    <ServerFacts data={data} />

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))', xl: 'repeat(3, minmax(0,1fr))' }, gap: 2, alignItems: 'start' }}>
                        {data.providers.map((p) => (
                            <ProviderCard key={p.provider} provider={p} keyReady={data.keyStatus !== 'missing'} onDirtyChange={onProviderDirty} onToast={showToast} />
                        ))}
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,3fr) minmax(0,2fr)' }, gap: 2, alignItems: 'stretch' }}>
                        <CalendarSyncSettingsCard settings={data.settings} onDirtyChange={onSettingsDirty} onToast={showToast} />
                        <SyncTypesCard types={data.syncTypes} onDirtyChange={onSyncTypesDirty} onToast={showToast} />
                    </Box>

                    <PeopleTable companyDomains={data.settings.companyDomains} onToast={showToast} />
                </>
            )}

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
