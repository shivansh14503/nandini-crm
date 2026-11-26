"use client";

import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { AppBreadcrumbs } from '@/components/common/AppBreadcrumbs';
import { AccountDetailsCard } from '@/components/dashboard/AccountDetailsCard';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';

export default function DashboardPage() {
    const { user, loading, error, clearError } = useAuth();

    useRequireAuth();

    if (loading) {
        return <LoadingScreen message="Loading dashboard..." />;
    }

    if (!user) {
        return null;
    }

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default', '--crm-page-bg': 'var(--mui-palette-background-default)' }}>
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
