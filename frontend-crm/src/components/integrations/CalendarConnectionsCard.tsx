'use client';

import { Alert, Box, Button, Skeleton, Typography } from '@mui/material';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { errorMessage, panelHeaderSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { formatDateTime, hintSx, ProviderMark, StatusChip, type ChipTone } from '@/components/settings/integrations/integrationUi';
import { NOT_SYNCED_REASON_MESSAGES, type OwnCalendarStatus } from './calendarConnections.types';
import { useOwnCalendarSync } from './useCalendarConnections';

/**
 * An employee's own company calendar sync, status only (Calendar Phase 2, P2-2b: admin-managed). Admins connect the
 * company's Google Workspace or Microsoft 365 once, and everyone with a company email is synced automatically, so
 * there is nothing to connect or disconnect here. Problems are fixed by admins, so the card never shows an error code
 * or provider text, only a calm sentence. Self-contained (own service, types and React Query hook).
 */

/** Kept for the profile thread's Connected accounts tab: P2-2's OAuth callback result (no longer used). */
export interface CalendarCallbackResult {
    calendar: 'connected' | 'error';
    reason?: string | null;
    provider?: string | null;
}

export interface CalendarConnectionsCardProps {
    /** @deprecated P2-2's OAuth callback is gone (P2-2b); ignored. */
    callback?: CalendarCallbackResult | null;
    /** @deprecated Ignored (see `callback`). */
    onCallbackHandled?: () => void;
}

const STATUS: Record<OwnCalendarStatus, { tone: ChipTone; label: string; text: string }> = {
    pending: { tone: 'neutral', label: 'Setting up', text: 'Your calendar is being set up. This usually takes a few minutes.' },
    ok: { tone: 'success', label: 'Synced', text: 'Your CRM meetings go to this calendar automatically.' },
    error: { tone: 'warning', label: 'Needs attention', text: "Your calendar isn't syncing right now. Your admins have been told and will fix it; nothing is needed from you." },
    paused: { tone: 'warning', label: 'Paused', text: "Calendar sync is paused for the company. Your admins are on it; nothing is needed from you." },
};

function ProviderBadge({ provider }: { provider: string }) {
    return (
        <Box
            aria-hidden
            sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: '10px',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--crm-text-blue-700)',
                backgroundColor: 'var(--mui-palette-primary-soft)',
                border: '1px solid var(--mui-palette-primary-softBorder)',
            }}
        >
            {provider === 'google' || provider === 'microsoft' ? <ProviderMark provider={provider} size={22} /> : <EventAvailableOutlinedIcon sx={{ fontSize: 22 }} />}
        </Box>
    );
}

export function CalendarConnectionsCard(props: CalendarConnectionsCardProps = {}) {
    void props; // accepted for compatibility only (see above)
    const { data, isLoading, error, refetch } = useOwnCalendarSync();
    const calendar = data?.calendar ?? null;
    const status = calendar ? (STATUS[calendar.status as OwnCalendarStatus] ?? STATUS.pending) : null;

    return (
        <Box component="section" aria-labelledby="calendar-connections-title" sx={{ ...surfaceSx, minWidth: 0, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <EventAvailableOutlinedIcon sx={{ fontSize: 20, color: 'var(--crm-text-blue-600)' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography id="calendar-connections-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)', lineHeight: 1.3 }}>
                        Company calendar
                    </Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                        Your CRM meetings on your work calendar. Set up by your admins for everyone.
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ p: { xs: 1.75, sm: 2.25 }, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
                {isLoading && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Skeleton variant="rounded" height={64} />
                        <Skeleton variant="rounded" height={20} width="60%" />
                    </Box>
                )}

                {error && !isLoading && (
                    <Alert
                        severity="error"
                        sx={{ fontSize: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}
                        action={
                            <Button size="small" sx={{ ...secondaryButtonSx, minHeight: 32 }} variant="outlined" onClick={() => void refetch()}>
                                Retry
                            </Button>
                        }
                    >
                        {errorMessage(error, 'Could not load your calendar sync.')}
                    </Alert>
                )}

                {data && calendar && status && (
                    <>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.25,
                                p: 1.5,
                                borderRadius: '10px',
                                border: '1px solid var(--mui-palette-border-main)',
                                backgroundColor: 'var(--mui-palette-background-subtle)',
                                minWidth: 0,
                            }}
                        >
                            <ProviderBadge provider={calendar.provider} />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                    <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--crm-slate-900)' }}>{calendar.providerLabel}</Typography>
                                    <StatusChip tone={status.tone}>{status.label}</StatusChip>
                                </Box>
                                <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', overflowWrap: 'anywhere' }}>{calendar.accountEmail}</Typography>
                                <Typography sx={hintSx}>
                                    Since {formatDateTime(calendar.since)}
                                    {calendar.lastSyncedAt ? ` · Last synced ${formatDateTime(calendar.lastSyncedAt)}` : ''}
                                </Typography>
                            </Box>
                        </Box>
                        <Typography sx={{ fontSize: '0.82rem', color: 'var(--crm-slate-700)' }}>{status.text}</Typography>
                    </>
                )}

                {data && !calendar && (
                    <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)' }}>
                        {data.reason ? NOT_SYNCED_REASON_MESSAGES[data.reason] : data.ready ? 'Your calendar will be set up shortly.' : "Calendar sync isn't switched on for the company yet."}
                    </Typography>
                )}

                {data && (
                    <Typography sx={hintSx}>
                        The CRM adds your CRM meetings to your work calendar and reads busy times from it, so colleagues see when you are free. It never reads
                        your email. Events already in your calendar stay there if sync stops.
                    </Typography>
                )}
            </Box>
        </Box>
    );
}
