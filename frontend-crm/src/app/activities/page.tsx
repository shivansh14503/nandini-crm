'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useFreshOnReturn } from '@/hooks/useFreshOnReturn';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { ActivitiesMasterView } from '@/components/activities/ActivitiesMasterView';

function ActivitiesContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();
    // Back from a record page (or any other page) shows the plain list, not the drawer left open before.
    const viewKey = useFreshOnReturn();
    // ?mine=1 / ?type=Call / ?status=Planned (the nav's My Activities, Calls, Meetings …).
    const mine = searchParams?.get('mine') === '1';
    const type = searchParams?.get('type') ?? '';
    const status = searchParams?.get('status') ?? '';

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading activities..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100dvh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />
            {/* A nav link to another view of the list (Calls → Meetings) starts that view fresh. */}
            <ActivitiesMasterView key={`${viewKey}:${mine}:${type}:${status}`} mine={mine} type={type} status={status} />
        </Box>
    );
}

export default function ActivitiesPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading activities..." />}>
            <ActivitiesContent />
        </Suspense>
    );
}
