"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { AppBreadcrumbs } from '@/components/common/AppBreadcrumbs';
import { AccountDetailsCard } from '@/components/dashboard/AccountDetailsCard';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';

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
