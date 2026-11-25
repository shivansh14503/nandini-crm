'use client';

import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Box } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';

// FullCalendar (and the Temporal polyfill it needs) loads only on this route.
const CalendarView = dynamic(() => import('@/components/activities/calendar/CalendarView'), {
    ssr: false,
    loading: () => <LoadingScreen message="Loading calendar..." />,
});

function CalendarContent() {
    const router = useRouter();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading calendar..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100dvh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />
            <CalendarView />
        </Box>
    );
}

export default function CalendarPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading calendar..." />}>
            <CalendarContent />
        </Suspense>
    );
}
