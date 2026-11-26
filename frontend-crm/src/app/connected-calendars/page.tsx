'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { AppPageLayout } from '@/components/layout/AppPageLayout';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { CalendarConnectionsCard } from '@/components/integrations/CalendarConnectionsCard';

/**
 * /connected-calendars[?calendar=connected|error&reason=&provider=]: the signed-in user's calendar connection. Any
 * signed-in user. Temporary home of CalendarConnectionsCard (the OAuth callback and `calendar_reconnect`
 * notifications land here) until it moves into My Profile.
 */
export default function ConnectedCalendarsPage() {
    const router = useRouter();
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) router.push(`${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.CONNECTED_CALENDARS)}`);
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading your calendars..." />;
    if (!user) return null;

    return (
        <AppPageLayout breadcrumbItems={[{ label: 'Connected calendars' }]} maxWidth="md">
            {/* The card reads the ?calendar= callback params (useSearchParams needs a Suspense boundary). */}
            <Suspense fallback={null}>
                <CalendarConnectionsCard />
            </Suspense>
        </AppPageLayout>
    );
}
