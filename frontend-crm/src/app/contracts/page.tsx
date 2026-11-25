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
import { ContractsMasterView } from '@/components/contracts';

function ContractsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();
    // Back from a record page (or any other page) shows the plain list, not the drawer left open before.
    const viewKey = useFreshOnReturn();
    // ?view=expiring_soon (the morning summary email's "and N more" contracts link) starts on that pill.
    const view = searchParams?.get('view') ?? '';

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading contracts..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100dvh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />
            <ContractsMasterView key={`${viewKey}:${view}`} view={view} />
        </Box>
    );
}

export default function ContractsPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading contracts..." />}>
            <ContractsContent />
        </Suspense>
    );
}
