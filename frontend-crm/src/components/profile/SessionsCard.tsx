'use client';

import { useState } from 'react';
import { Box, Button, Skeleton, Tooltip, Typography } from '@mui/material';
import DevicesRoundedIcon from '@mui/icons-material/DevicesRounded';
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded';
import SmartphoneRoundedIcon from '@mui/icons-material/SmartphoneRounded';
import TabletMacRoundedIcon from '@mui/icons-material/TabletMacRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { Badge, ConfirmDeleteDialog, errorMessage } from '@/components/settings/form-customization/builderUi';
import { useMySessions, useRevokeOtherSessions, useRevokeSession } from '@/hooks/queries/useProfile';
import { ApiClientError } from '@/services/apiClient';
import type { SessionDto } from '@/types/profile.types';
import { formatDateTime } from '@/utils/date';
import type { Notify } from './ProfileView';
import { ProfileCard, relativeInSentence } from './profileUi';

function DeviceIcon({ device }: { device: string }) {
    const sx = { fontSize: 20 };
    if (/iPad/i.test(device)) return <TabletMacRoundedIcon sx={sx} />;
    if (/(Android|iOS)/i.test(device)) return <SmartphoneRoundedIcon sx={sx} />;
    return <ComputerRoundedIcon sx={sx} />;
}

const signOutButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    borderRadius: '8px',
    minHeight: 40,
    whiteSpace: 'nowrap',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

function SessionRow({ session, onSignOut, busy }: { session: SessionDto; onSignOut: (s: SessionDto) => void; busy: boolean }) {
    const details = [session.ip ? `IP ${session.ip}` : null].filter(Boolean).join(' · ');
    return (
        <Box
            component="li"
            sx={{
                display: 'flex',
                alignItems: { xs: 'flex-start', sm: 'center' },
                gap: 1.5,
                py: 1.5,
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
                '& + &': { borderTop: '1px solid var(--mui-palette-border-light)' },
            }}
        >
            <Box
                aria-hidden
                sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: session.current ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-subtle)',
                    border: `1px solid ${session.current ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)'}`,
                    color: session.current ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)',
                }}
            >
                <DeviceIcon device={session.device} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{session.device}</Typography>
                    {session.current && <Badge tone="custom">This device</Badge>}
                </Box>
                <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, overflowWrap: 'anywhere' }}>
                    {session.createdAt ? (
                        <>
                            Signed in {relativeInSentence(session.createdAt)}
                            <Box component="span" sx={{ color: 'var(--mui-palette-text-muted)' }}>
                                {' '}
                                ({formatDateTime(session.createdAt)})
                            </Box>
                        </>
                    ) : (
                        'Sign-in time unknown'
                    )}
                    {details && ` · ${details}`}
                </Typography>
                {session.userAgent && (
                    <Tooltip title={session.userAgent} arrow>
                        <Typography noWrap sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)', mt: 0.25, maxWidth: '100%' }}>
                            {session.userAgent}
                        </Typography>
                    </Tooltip>
                )}
            </Box>
            {!session.current && (
                <Button
                    variant="outlined"
                    startIcon={<LogoutRoundedIcon sx={{ fontSize: '16px !important' }} />}
                    onClick={() => onSignOut(session)}
                    disabled={busy}
                    aria-label={`Sign out ${session.device}${session.createdAt ? `, signed in ${formatDateTime(session.createdAt)}` : ''}`}
                    sx={{ ...signOutButtonSx, flex: { xs: '1 1 100%', sm: 'none' }, ml: { xs: 0, sm: 1 } }}
                >
                    Sign out
                </Button>
            )}
        </Box>
    );
}

/** My Profile › Security › Where you're signed in: the user's live sessions, with sign out per session or all others. */
export function SessionsCard({ notify }: { notify: Notify }) {
    const { data, isLoading, isError } = useMySessions();
    const revokeSession = useRevokeSession();
    const revokeOthers = useRevokeOtherSessions();
    const [confirmOne, setConfirmOne] = useState<SessionDto | null>(null);
    const [confirmAll, setConfirmAll] = useState(false);

    const sessions = data?.sessions ?? [];
    const available = Boolean(data?.tracked) && !isError;
    const others = sessions.filter((s) => !s.current);
    const busy = revokeSession.isPending || revokeOthers.isPending;

    const signOutOne = async () => {
        const session = confirmOne;
        setConfirmOne(null);
        if (!session) return;
        try {
            await revokeSession.mutateAsync(session.id);
            notify(`Signed out of ${session.device}.`);
        } catch (err) {
            if (err instanceof ApiClientError && err.status === 404) notify('That session had already ended.', 'info');
            else notify(errorMessage(err, 'Could not sign out that session.'), 'error');
        }
    };

    const signOutOthers = async () => {
        setConfirmAll(false);
        try {
            const { signedOutSessions: n } = await revokeOthers.mutateAsync();
            notify(n > 0 ? `Signed out of ${n} other session${n === 1 ? '' : 's'}.` : 'There were no other sessions to sign out.');
        } catch (err) {
            notify(errorMessage(err, 'Could not sign out your other sessions.'), 'error');
        }
    };

    return (
        <ProfileCard
            id="sessions"
            icon={<DevicesRoundedIcon fontSize="small" />}
            title="Where you're signed in"
            description="Browsers and devices signed in to your account. Sign out any you don't recognise, then change your password."
            actions={
                available && others.length > 0 ? (
                    <Button
                        variant="outlined"
                        startIcon={<LogoutRoundedIcon sx={{ fontSize: '16px !important' }} />}
                        onClick={() => setConfirmAll(true)}
                        disabled={busy}
                        sx={{ ...signOutButtonSx, flex: { xs: 1, sm: 'none' } }}
                    >
                        Sign out of all other sessions
                    </Button>
                ) : undefined
            }
        >
            {isLoading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }} aria-busy>
                    {[0, 1].map((i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                            <Skeleton variant="rounded" width={40} height={40} />
                            <Box sx={{ flex: 1 }}>
                                <Skeleton width="40%" />
                                <Skeleton width="70%" />
                            </Box>
                        </Box>
                    ))}
                </Box>
            ) : !available ? (
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>Session list is unavailable right now.</Typography>
            ) : sessions.length === 0 ? (
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>No active sessions found.</Typography>
            ) : (
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', mt: -1.5, mb: -1.5 }}>
                    {sessions.map((session) => (
                        <SessionRow key={session.id} session={session} onSignOut={setConfirmOne} busy={busy} />
                    ))}
                </Box>
            )}

            <ConfirmDeleteDialog
                open={Boolean(confirmOne)}
                title="Sign out this session?"
                confirmLabel="Sign out"
                onConfirm={signOutOne}
                onClose={() => setConfirmOne(null)}
            >
                {confirmOne && (
                    <>
                        <span>
                            <strong>{confirmOne.device}</strong>
                            {confirmOne.ip ? ` (IP ${confirmOne.ip})` : ''} will be signed out and must sign in again.
                        </span>
                        <span>If you don&apos;t recognise it, change your password too.</span>
                    </>
                )}
            </ConfirmDeleteDialog>
            <ConfirmDeleteDialog
                open={confirmAll}
                title="Sign out of all other sessions?"
                confirmLabel="Sign out all others"
                onConfirm={signOutOthers}
                onClose={() => setConfirmAll(false)}
            >
                {others.length === 1 ? '1 other session' : `${others.length} other sessions`} will be signed out. You stay signed in on this device.
            </ConfirmDeleteDialog>
        </ProfileCard>
    );
}
