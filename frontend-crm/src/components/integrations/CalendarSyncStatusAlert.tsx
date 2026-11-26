'use client';

import Link from 'next/link';
import { Alert, Button } from '@mui/material';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { ROUTES } from '@/config/constants';
import { needsAttention } from './calendarConnections.types';
import { useCalendarPagePull, useOwnCalendarSync } from './useCalendarConnections';

/**
 * A slim notice on the CRM calendar page while the employee's company calendar isn't syncing (status `error`, or
 * `paused` for the whole company). Calendar sync is admin-managed (P2-2b), so there is nothing to reconnect: it says
 * admins know, and links to the status card. Shows nothing otherwise, including while loading or on a read error.
 * Also starts the silent page pull (P2-5): calendar changes come back when the page opens, debounced.
 */
export function CalendarSyncStatusAlert() {
    const { data } = useOwnCalendarSync();
    const calendar = data?.calendar;
    useCalendarPagePull(calendar?.status);
    if (!calendar || !needsAttention(calendar)) return null;
    const text =
        calendar.status === 'paused'
            ? `Sync with your ${calendar.providerLabel} is paused for the company. Your admins are on it; CRM meetings catch up once it is back.`
            : `Your ${calendar.providerLabel} isn't syncing right now. Your admins have been told; nothing is needed from you.`;
    return (
        <Alert
            severity="info"
            sx={{ fontSize: '0.8rem', alignItems: 'center', flexWrap: 'wrap', '& .MuiAlert-action': { pl: { xs: 0, sm: 2 }, ml: { xs: 0, sm: 'auto' } } }}
            action={
                <Button component={Link} href={ROUTES.PROFILE_CONNECTED_ACCOUNTS} size="small" variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 32, backgroundColor: 'var(--mui-palette-background-paper)' }}>
                    Details
                </Button>
            }
        >
            {text}
        </Alert>
    );
}
