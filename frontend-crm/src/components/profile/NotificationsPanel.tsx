'use client';

import { Alert, Box, Button, Skeleton } from '@mui/material';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useMyPreferences } from '@/hooks/queries/useProfile';
import { MorningSummaryCard } from './MorningSummaryCard';
import { NotificationTypesCard } from './NotificationTypesCard';
import { OutOfOfficeCard } from './OutOfOfficeCard';
import type { Notify } from './ProfileView';
import { ReminderDefaultCard } from './ReminderDefaultCard';

/**
 * My Profile › Notifications (`?tab=notifications`): bell notification types, the morning summary email, the
 * default reminder and out of office. Each card saves on its own.
 */
export function NotificationsPanel({ notify }: { notify: Notify }) {
    const { data: preferences, isPending, isError, error, refetch, isFetching } = useMyPreferences();

    return (
        <Box role="tabpanel" aria-label="Notifications" sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {isPending ? (
                <Box aria-busy="true" aria-label="Loading your notification settings" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Skeleton variant="rounded" height={300} sx={{ borderRadius: '12px' }} />
                    <Skeleton variant="rounded" height={170} sx={{ borderRadius: '12px' }} />
                    <Skeleton variant="rounded" height={150} sx={{ borderRadius: '12px' }} />
                </Box>
            ) : isError || !preferences ? (
                <Alert
                    severity="error"
                    sx={{ borderRadius: '10px', alignItems: 'center' }}
                    action={
                        <Button variant="outlined" size="small" onClick={() => refetch()} disabled={isFetching} sx={{ ...secondaryButtonSx, minHeight: 36 }}>
                            Try again
                        </Button>
                    }
                >
                    {errorMessage(error, 'Could not load your notification settings.')}
                </Alert>
            ) : (
                <>
                    <NotificationTypesCard preferences={preferences} notify={notify} />
                    <MorningSummaryCard preferences={preferences} notify={notify} />
                    <ReminderDefaultCard preferences={preferences} notify={notify} />
                    <OutOfOfficeCard preferences={preferences} notify={notify} />
                </>
            )}
        </Box>
    );
}
