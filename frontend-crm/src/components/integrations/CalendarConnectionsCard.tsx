'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton, Typography } from '@mui/material';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import { AppToast } from '@/components/common/AppToast';
import { errorMessage, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { formatDateTime, formatDay, hintSx, ProviderMark, StatusChip, type ChipTone } from '@/components/settings/integrations/integrationUi';
import { ENV } from '@/config/env';
import {
    CALLBACK_REASON_MESSAGES,
    isCallbackReason,
    needsReconnect,
    STATUS_REASON_MESSAGES,
    type CalendarProvider,
    type ConnectionStatusReason,
    type OwnConnection,
    type ProviderOption,
} from './calendarConnections.types';
import { useDisconnectCalendar, useOwnCalendarConnections, useStartCalendarConnect } from './useCalendarConnections';

/**
 * An employee's own calendar connection (Calendar Phase 2 P2-2): connect Google or Microsoft 365, reconnect, disconnect.
 * Self-contained (own service, types and React Query hooks) so it can move into My Profile later unchanged. It reads
 * the OAuth callback's `?calendar=connected|error&reason=&provider=` itself, unless the page passes `callback`.
 */

export interface CalendarCallbackResult {
    calendar: 'connected' | 'error';
    reason?: string | null;
    provider?: string | null;
}

export interface CalendarConnectionsCardProps {
    /** The callback result when the host page reads the URL itself; omitted = the card reads `?calendar=`. */
    callback?: CalendarCallbackResult | null;
    /** Called once the callback result has been shown (the card clears the URL params itself when it read them). */
    onCallbackHandled?: () => void;
}

const STATUS_TONES: Record<string, { tone: ChipTone; label: string }> = {
    active: { tone: 'success', label: 'Connected' },
    reauth_required: { tone: 'warning', label: 'Reconnect needed' },
    error: { tone: 'error', label: 'Not working' },
};

const MICROSOFT_APPS_URL = 'https://myapps.microsoft.com';

const destructiveButtonSx = {
    ...secondaryButtonSx,
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

function ProviderBadge({ provider, size = 22 }: { provider: string; size?: number }) {
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
            {provider === 'google' || provider === 'microsoft' ? <ProviderMark provider={provider} size={size} /> : <EventAvailableOutlinedIcon sx={{ fontSize: size }} />}
        </Box>
    );
}

const originOf = (url: string | null | undefined) => {
    if (!url) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
};

/** Reads (and then clears) the `?calendar=` params of the OAuth callback redirect. */
function useCallbackParams(enabled: boolean): { result: CalendarCallbackResult | null; clear: () => void } {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const calendar = enabled ? params.get('calendar') : null;
    const result = useMemo<CalendarCallbackResult | null>(
        () => (calendar === 'connected' || calendar === 'error' ? { calendar, reason: params.get('reason'), provider: params.get('provider') } : null),
        [calendar, params],
    );
    const clear = () => {
        const next = new URLSearchParams(params.toString());
        for (const key of ['calendar', 'reason', 'provider']) next.delete(key);
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };
    return { result, clear };
}

export function CalendarConnectionsCard({ callback, onCallbackHandled }: CalendarConnectionsCardProps) {
    const readsUrl = callback === undefined;
    const fromUrl = useCallbackParams(readsUrl);
    const result = readsUrl ? fromUrl.result : callback;

    const { data, isLoading, error, refetch } = useOwnCalendarConnections();
    const start = useStartCalendarConnect();
    const disconnect = useDisconnectCalendar();

    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
    const [confirming, setConfirming] = useState<OwnConnection | null>(null);

    // The callback result is kept in state (taken over while rendering, React's "adjust state on prop change"), so it
    // stays on screen after the URL params are dropped; `dismissed` hides it again.
    const resultKey = result ? `${result.calendar}:${result.reason ?? ''}:${result.provider ?? ''}` : null;
    const [shown, setShown] = useState<{ key: string; result: CalendarCallbackResult; dismissed: boolean } | null>(null);
    if (result && resultKey && resultKey !== shown?.key) setShown({ key: resultKey, result, dismissed: false });
    const dismissCallback = () => setShown((current) => (current ? { ...current, dismissed: true } : current));
    const visible = shown && !shown.dismissed ? shown.result : null;
    const callbackError =
        visible?.calendar === 'error' ? (isCallbackReason(visible.reason) ? CALLBACK_REASON_MESSAGES[visible.reason] : CALLBACK_REASON_MESSAGES.server_error) : null;
    const connectedToast = visible?.calendar === 'connected';

    // Side effects of a new callback result: refresh the list, drop the params so a reload doesn't show it again.
    const handled = useRef<string | null>(null);
    const clearUrl = fromUrl.clear;
    useEffect(() => {
        if (!shown || handled.current === shown.key) return;
        handled.current = shown.key;
        if (shown.result.calendar === 'connected') void refetch();
        if (readsUrl) clearUrl();
        onCallbackHandled?.();
        // clearUrl is a new function every render; the key guard runs this once per result.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown, readsUrl, onCallbackHandled, refetch]);

    const live = data?.connections ?? [];
    const providers = data?.providers ?? [];
    const available = providers.filter((p) => p.available);
    const providerOf = (key: string): ProviderOption | undefined => providers.find((p) => p.provider === key);
    const apiOrigin = originOf(ENV.API_URL);
    const publicOrigin = originOf(data?.publicApiUrl);
    const otherOrigin = Boolean(publicOrigin && apiOrigin && publicOrigin !== apiOrigin);

    const connect = (provider: CalendarProvider) => {
        dismissCallback();
        start.mutate(provider, {
            onError: (err) => setToast({ open: true, message: errorMessage(err, 'Could not start connecting. Please try again.'), severity: 'error' }),
        });
    };

    const confirmDisconnect = async () => {
        if (!confirming) return;
        try {
            await disconnect.mutateAsync(confirming.id);
            setToast({ open: true, message: 'Calendar disconnected.', severity: 'success' });
            setConfirming(null);
        } catch (err) {
            setToast({ open: true, message: errorMessage(err, 'Could not disconnect. Please try again.'), severity: 'error' });
        }
    };

    const busy = start.isPending || disconnect.isPending;
    const confirmingProvider = confirming ? providerOf(confirming.provider) : undefined;

    return (
        <Box component="section" aria-labelledby="calendar-connections-title" sx={{ ...surfaceSx, minWidth: 0, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <EventAvailableOutlinedIcon sx={{ fontSize: 20, color: 'var(--crm-text-blue-600)' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography id="calendar-connections-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)', lineHeight: 1.3 }}>
                        Connected calendars
                    </Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                        Put your CRM meetings on your own Google or Outlook calendar. One calendar per person.
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ p: { xs: 1.75, sm: 2.25 }, display: 'flex', flexDirection: 'column', gap: 1.75, minWidth: 0 }}>
                {callbackError && (
                    <Alert severity="error" onClose={dismissCallback} sx={{ fontSize: '0.8rem' }}>
                        {callbackError}
                    </Alert>
                )}

                {isLoading && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Skeleton variant="rounded" height={64} />
                        <Skeleton variant="rounded" height={40} width="60%" />
                    </Box>
                )}

                {error && !isLoading && (
                    <Alert
                        severity="error"
                        action={
                            <Button size="small" sx={{ ...secondaryButtonSx, minHeight: 32 }} variant="outlined" onClick={() => void refetch()}>
                                Retry
                            </Button>
                        }
                    >
                        {errorMessage(error, 'Could not load your calendar connections.')}
                    </Alert>
                )}

                {data && (
                    <>
                        {!data.ready && (
                            <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                                An admin is still setting up calendar connections. You can connect your calendar once that is done.
                            </Alert>
                        )}

                        {live.map((c) => {
                            const status = STATUS_TONES[c.status] ?? { tone: 'neutral' as ChipTone, label: c.status };
                            const option = providerOf(c.provider);
                            const canReconnect = needsReconnect(c) && Boolean(option?.available) && data.ready;
                            return (
                                <Box
                                    key={c.id}
                                    sx={{
                                        display: 'flex',
                                        flexDirection: { xs: 'column', sm: 'row' },
                                        alignItems: { xs: 'stretch', sm: 'center' },
                                        gap: 1.5,
                                        p: 1.5,
                                        borderRadius: '10px',
                                        border: '1px solid var(--mui-palette-border-main)',
                                        backgroundColor: 'var(--mui-palette-background-subtle)',
                                        minWidth: 0,
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0 }}>
                                        <ProviderBadge provider={c.provider} />
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--crm-slate-900)' }}>{option?.label ?? c.provider}</Typography>
                                                <StatusChip tone={status.tone}>{status.label}</StatusChip>
                                            </Box>
                                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', overflowWrap: 'anywhere' }}>{c.accountEmail}</Typography>
                                            <Typography sx={hintSx}>
                                                Connected {formatDateTime(c.connectedAt)}
                                                {c.accessEndsAt ? ` · Access ends on ${formatDay(c.accessEndsAt)}` : ''}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                                        {canReconnect && (
                                            <Button
                                                variant="contained"
                                                size="small"
                                                sx={{ ...primaryButtonSx, minHeight: 36 }}
                                                startIcon={start.isPending && start.variables === c.provider ? <CircularProgress size={14} color="inherit" /> : <SyncRoundedIcon />}
                                                disabled={busy}
                                                onClick={() => connect(c.provider as CalendarProvider)}
                                            >
                                                Reconnect
                                            </Button>
                                        )}
                                        <Button variant="outlined" size="small" sx={{ ...destructiveButtonSx, minHeight: 36 }} startIcon={<LinkOffRoundedIcon />} disabled={busy} onClick={() => setConfirming(c)}>
                                            Disconnect
                                        </Button>
                                    </Box>
                                </Box>
                            );
                        })}

                        {live.map((c) => {
                            const reasonText = needsReconnect(c) && c.statusReason ? STATUS_REASON_MESSAGES[c.statusReason as ConnectionStatusReason] : undefined;
                            return reasonText ? (
                                <Alert key={`reason-${c.id}`} severity="warning" sx={{ fontSize: '0.8rem' }}>
                                    {reasonText}
                                </Alert>
                            ) : null;
                        })}

                        {live.some((c) => c.status === 'active') && !data.syncActive && (
                            <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                                Your calendar is connected. Sync arrives in the next update: until then the CRM does not add or read anything in your calendar.
                            </Alert>
                        )}

                        {live.length === 0 && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                                {available.length === 0 ? (
                                    <Typography sx={{ fontSize: '0.84rem', color: 'var(--mui-palette-text-secondary)' }}>
                                        No calendar provider is switched on yet. An admin turns them on under Admin › API Integrations.
                                    </Typography>
                                ) : (
                                    <>
                                        <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)' }}>
                                            {data.email ? (
                                                <>
                                                    Sign in with your company account{' '}
                                                    <Box component="span" sx={{ fontWeight: 700, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                                                        {data.email}
                                                    </Box>
                                                    .
                                                </>
                                            ) : (
                                                'Sign in with your company account. Your CRM email will be set from it.'
                                            )}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                            {available.map((p) => (
                                                <Button
                                                    key={p.provider}
                                                    variant="contained"
                                                    sx={{ ...primaryButtonSx, minHeight: 40, px: 2 }}
                                                    startIcon={
                                                        start.isPending && start.variables === p.provider ? (
                                                            <CircularProgress size={14} color="inherit" />
                                                        ) : p.provider === 'google' || p.provider === 'microsoft' ? (
                                                            <ProviderMark provider={p.provider} size={16} />
                                                        ) : (
                                                            <EventAvailableOutlinedIcon />
                                                        )
                                                    }
                                                    disabled={busy || !data.ready}
                                                    onClick={() => connect(p.provider)}
                                                >
                                                    Connect {p.label}
                                                </Button>
                                            ))}
                                        </Box>
                                    </>
                                )}
                            </Box>
                        )}

                        <Typography sx={hintSx}>
                            Once sync is on, the CRM adds your CRM meetings to this calendar and reads busy times and meeting invitations from it, so the CRM
                            calendar shows when you are free. It never reads your email. You can disconnect at any time; events already in your calendar stay
                            there.
                        </Typography>
                        {otherOrigin && (
                            <Typography sx={hintSx}>
                                Sign-in returns through {publicOrigin}. If connecting says the sign-in expired, open the CRM through that address and try again.
                            </Typography>
                        )}
                    </>
                )}
            </Box>

            <Dialog
                open={Boolean(confirming)}
                onClose={() => !disconnect.isPending && setConfirming(null)}
                maxWidth="xs"
                fullWidth
                slotProps={{ paper: { sx: { borderRadius: '12px', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } } }}
            >
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', pb: 0.5 }}>Disconnect calendar?</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: '8px !important' }}>
                    <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)' }}>
                        The CRM stops using{' '}
                        <Box component="span" sx={{ fontWeight: 700, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                            {confirming?.accountEmail}
                        </Box>
                        . Events already in your calendar stay there.
                    </Typography>
                    {confirmingProvider && !confirmingProvider.canRevoke && (
                        <Typography sx={hintSx}>
                            Microsoft keeps the permission you gave until you remove it: open{' '}
                            <Box component="a" href={MICROSOFT_APPS_URL} target="_blank" rel="noopener noreferrer" sx={{ color: 'var(--crm-text-blue-700)', '&:hover': { color: 'var(--crm-text-blue-600)' } }}>
                                myapps.microsoft.com
                            </Box>{' '}
                            to remove the CRM app too.
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="outlined" sx={secondaryButtonSx} onClick={() => setConfirming(null)} disabled={disconnect.isPending}>
                        Cancel
                    </Button>
                    <Button
                        variant="outlined"
                        sx={{ ...destructiveButtonSx, color: 'var(--mui-palette-error-main)', borderColor: 'var(--mui-palette-error-softBorder)' }}
                        onClick={() => void confirmDisconnect()}
                        disabled={disconnect.isPending}
                        startIcon={disconnect.isPending ? <CircularProgress size={14} color="inherit" /> : <LinkOffRoundedIcon />}
                    >
                        Disconnect
                    </Button>
                </DialogActions>
            </Dialog>

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
            <AppToast open={connectedToast} message="Calendar connected." severity="success" onClose={dismissCallback} />
        </Box>
    );
}
