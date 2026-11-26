'use client';

import Link from 'next/link';
import { Alert, Button } from '@mui/material';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { ROUTES } from '@/config/constants';
import { needsReconnect } from './calendarConnections.types';
import { useOwnCalendarConnections } from './useCalendarConnections';

/**
 * A slim banner (CRM calendar page) when the user's connected calendar needs a reconnect. Shows nothing otherwise,
 * including while loading or when the connections can't be read.
 */
export function CalendarReconnectAlert() {
    const { data } = useOwnCalendarConnections();
    const broken = data?.connections.find(needsReconnect);
    if (!broken) return null;
    const label = data?.providers.find((p) => p.provider === broken.provider)?.label ?? 'calendar';
    return (
        <Alert
            severity="warning"
            sx={{ fontSize: '0.8rem', alignItems: 'center', flexWrap: 'wrap', '& .MuiAlert-action': { pl: { xs: 0, sm: 2 }, ml: { xs: 0, sm: 'auto' } } }}
            action={
                <Button component={Link} href={ROUTES.CONNECTED_CALENDARS} size="small" variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 32, backgroundColor: 'var(--mui-palette-background-paper)' }}>
                    Reconnect
                </Button>
            }
        >
            Your {label} needs a reconnect ({broken.accountEmail}).
        </Alert>
    );
}
