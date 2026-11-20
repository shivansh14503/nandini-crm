'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useFreshOnReturn } from '@/hooks/useFreshOnReturn';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { OpportunitiesMasterView } from '@/components/opportunities';

export default function OpportunitiesPage() {
    const router = useRouter();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();
    // Back from a record page (or any other page) shows the plain list, not the drawer left open before.
    const viewKey = useFreshOnReturn();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading opportunities pipeline..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100dvh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />
            <OpportunitiesMasterView key={viewKey} />
        </Box>
    );
}
