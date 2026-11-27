'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, AlertTitle, Box, Button, Skeleton } from '@mui/material';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import { AppToast } from '@/components/common/AppToast';
import { CalendarConnectionsCard } from '@/components/integrations/CalendarConnectionsCard';
import { EmailLoggingStatusCard } from '@/components/integrations/EmailLoggingStatusCard';
import { useAuth } from '@/context/AuthContext';
import { PillTabs, errorMessage, secondaryButtonSx, surfaceSx, type PillTabItem } from '@/components/settings/form-customization/builderUi';
import { useMyProfile } from '@/hooks/queries/useProfile';
import type { ProfileDto } from '@/types/profile.types';
import { ChangePasswordCard } from './ChangePasswordCard';
import { NotificationsPanel } from './NotificationsPanel';
import { PersonalDetailsCard } from './PersonalDetailsCard';
import { ProfileHeaderCard } from './ProfileHeaderCard';
import { SessionsCard } from './SessionsCard';
import { WorkDetailsCard } from './WorkDetailsCard';

export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';
/** Shows a top-right toast on the profile page. */
export type Notify = (message: string, severity?: ToastSeverity) => void;

type ProfileTab = 'profile' | 'notifications' | 'connected-accounts' | 'security';

const TABS: PillTabItem<ProfileTab>[] = [
    { key: 'profile', label: 'Profile', icon: <PersonOutlineRoundedIcon sx={{ fontSize: 17 }} /> },
    { key: 'notifications', label: 'Notifications', icon: <NotificationsNoneRoundedIcon sx={{ fontSize: 17 }} /> },
    { key: 'connected-accounts', label: 'Connected accounts', icon: <LinkRoundedIcon sx={{ fontSize: 17 }} /> },
    { key: 'security', label: 'Security', icon: <ShieldOutlinedIcon sx={{ fontSize: 17 }} /> },
];

const TAB_KEYS: readonly string[] = TABS.map((t) => t.key);

/** The `?tab=` value as a tab; anything unknown opens Profile. */
const parseTab = (value: string | null): ProfileTab => (value && TAB_KEYS.includes(value) ? (value as ProfileTab) : 'profile');

function ProfileSkeleton() {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-busy aria-label="Loading your profile">
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', gap: 2.5, alignItems: 'center', flexDirection: { xs: 'column', sm: 'row' } }}>
                <Skeleton variant="circular" width={88} height={88} />
                <Box sx={{ flex: 1, width: '100%' }}>
                    <Skeleton width="45%" height={30} />
                    <Skeleton width="30%" />
                    <Skeleton width="55%" />
                </Box>
            </Box>
            <Skeleton variant="rounded" width={200} height={36} />
            <Skeleton variant="rounded" height={260} />
        </Box>
    );
}

/**
 * My Profile: header card, then the Profile, Notifications, Connected accounts and Security tabs
 * (`?tab=notifications|connected-accounts|security`). While an admin-set password must be changed
 * (`mustChangePassword`), only the change-password card shows, under a warning; everything else unlocks as soon as
 * the password is changed.
 *
 * Connected accounts hosts the self-contained CalendarConnectionsCard. The OAuth callback lands on
 * `?tab=connected-accounts&calendar=connected|error&reason=&provider=`: the card reads those params itself and drops
 * only them, so `?tab=` stays; a tab switch keeps every other param, as before.
 */
export function ProfileView() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const locked = Boolean(user?.mustChangePassword);
    const tab: ProfileTab = locked ? 'security' : parseTab(searchParams.get('tab'));
    const { data: profile, isLoading, isError, error, refetch, isFetching } = useMyProfile();

    const [toast, setToast] = useState<{ open: boolean; message: string; severity: ToastSeverity }>({ open: false, message: '', severity: 'success' });
    const notify = useCallback<Notify>((message, severity = 'success') => setToast({ open: true, message, severity }), []);

    const changeTab = (next: ProfileTab) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'profile') params.delete('tab');
        else params.set('tab', next);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    const renderPanel = (current: ProfileTab, data: ProfileDto) => {
        switch (current) {
            case 'notifications':
                return <NotificationsPanel notify={notify} />;
            case 'connected-accounts':
                return (
                    <Box role="tabpanel" aria-label="Connected accounts" sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <CalendarConnectionsCard />
                        <EmailLoggingStatusCard />
                    </Box>
                );
            case 'security':
                return (
                    <Box role="tabpanel" aria-label="Security" sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <ChangePasswordCard profile={data} notify={notify} />
                        <SessionsCard notify={notify} />
                    </Box>
                );
            default:
                return (
                    <Box
                        role="tabpanel"
                        aria-label="Profile"
                        sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: 2, alignItems: 'start' }}
                    >
                        <PersonalDetailsCard profile={data} notify={notify} />
                        <WorkDetailsCard profile={data} />
                    </Box>
                );
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {isLoading ? (
                <ProfileSkeleton />
            ) : isError || !profile ? (
                <Alert
                    severity="error"
                    sx={{ borderRadius: '10px', alignItems: 'center' }}
                    action={
                        <Button variant="outlined" size="small" onClick={() => refetch()} disabled={isFetching} sx={{ ...secondaryButtonSx, minHeight: 36 }}>
                            Try again
                        </Button>
                    }
                >
                    {errorMessage(error, 'Could not load your profile.')}
                </Alert>
            ) : locked ? (
                <>
                    <Alert
                        severity="warning"
                        sx={{ borderRadius: '10px', fontSize: '0.84rem', alignItems: 'flex-start' }}
                        aria-live="polite"
                    >
                        <AlertTitle sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 0.25 }}>Choose a new password to continue</AlertTitle>
                        An administrator set a temporary password for your account. Change it here to start using the CRM; the rest of the app opens as soon as
                        you do. Already changed it on another device? Sign out and sign in again with the new password.
                    </Alert>
                    <Box role="tabpanel" aria-label="Security" sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <ChangePasswordCard profile={profile} notify={notify} />
                    </Box>
                </>
            ) : (
                <>
                    <ProfileHeaderCard profile={profile} notify={notify} />

                    <PillTabs<ProfileTab> items={TABS} value={tab} onChange={changeTab} sx={{ '& [role="tab"]': { minHeight: 40 } }} />

                    {renderPanel(tab, profile)}
                </>
            )}

            <AppToast
                open={toast.open}
                message={toast.message}
                severity={toast.severity}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
                autoHideDuration={toast.severity === 'error' ? 6000 : 4000}
            />
        </Box>
    );
}
