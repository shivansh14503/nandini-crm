"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/src/context/AuthContext';
import { ROUTES } from '@/src/config/constants';
import { Navbar } from '@/src/components/layout/Navbar';
import { AppBreadcrumbs } from '@/src/components/common/AppBreadcrumbs';
import { AccountDetailsCard } from '@/src/components/dashboard/AccountDetailsCard';
import { LoadingScreen } from '@/src/components/common/LoadingScreen';
import { ErrorAlert } from '@/src/components/common/ErrorAlert';

export default function DashboardPage() {
    const router = useRouter();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) {
        return <LoadingScreen message="Loading dashboard..." />;
    }

    if (!user) {
        return null;
    }

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
            <Navbar />
            <Container maxWidth="lg" sx={{ mt: 3, pb: 4 }}>
                <ErrorAlert error={error} onClose={clearError} />
                <Box sx={{ mb: 2.5 }}>
                    <AppBreadcrumbs />
                </Box>
                <AccountDetailsCard user={user} />
            </Container>
        </Box>
    );
}
