"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/src/context/AuthContext';
import { ROUTES } from '@/src/config/constants';
import { Navbar } from '@/src/components/layout/Navbar';
import { AccountDetailsCard } from '@/src/components/dashboard/AccountDetailsCard';
import { LoadingScreen } from '@/src/components/common/LoadingScreen';

export default function DashboardPage() {
    const router = useRouter();
    const { user, loading, isAuthenticated } = useAuth();

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
            <Container maxWidth="lg" sx={{ mt: 5 }}>
                <AccountDetailsCard user={user} />
            </Container>
        </Box>
    );
}
