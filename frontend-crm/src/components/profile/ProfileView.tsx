'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Skeleton } from '@mui/material';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { AppToast } from '@/components/common/AppToast';
import { PillTabs, errorMessage, secondaryButtonSx, surfaceSx, type PillTabItem } from '@/components/settings/form-customization/builderUi';
import { useMyProfile } from '@/hooks/queries/useProfile';
import { ChangePasswordCard } from './ChangePasswordCard';
import { PersonalDetailsCard } from './PersonalDetailsCard';
import { ProfileHeaderCard } from './ProfileHeaderCard';
import { SessionsCard } from './SessionsCard';
import { WorkDetailsCard } from './WorkDetailsCard';

export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';
/** Shows a top-right toast on the profile page. */
export type Notify = (message: string, severity?: ToastSeverity) => void;

type ProfileTab = 'profile' | 'security';

const TABS: PillTabItem<ProfileTab>[] = [
    { key: 'profile', label: 'Profile', icon: <PersonOutlineRoundedIcon sx={{ fontSize: 17 }} /> },
    { key: 'security', label: 'Security', icon: <ShieldOutlinedIcon sx={{ fontSize: 17 }} /> },
];

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

/** My Profile: header card, then the Profile and Security tabs (`?tab=security`). */
export function ProfileView() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tab: ProfileTab = searchParams.get('tab') === 'security' ? 'security' : 'profile';
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
            ) : (
                <>
                    <ProfileHeaderCard profile={profile} notify={notify} />

                    <PillTabs<ProfileTab> items={TABS} value={tab} onChange={changeTab} sx={{ '& [role="tab"]': { minHeight: 40 } }} />

                    {tab === 'profile' ? (
                        <Box
                            role="tabpanel"
                            aria-label="Profile"
                            sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: 2, alignItems: 'start' }}
                        >
                            <PersonalDetailsCard profile={profile} notify={notify} />
                            <WorkDetailsCard profile={profile} />
                        </Box>
                    ) : (
                        <Box role="tabpanel" aria-label="Security" sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <ChangePasswordCard profile={profile} notify={notify} />
                            <SessionsCard notify={notify} />
                        </Box>
                    )}
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
