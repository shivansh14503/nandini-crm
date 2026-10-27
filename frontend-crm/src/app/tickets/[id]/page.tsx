'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/src/context/AuthContext';
import { ROUTES } from '@/src/config/constants';
import { Navbar } from '@/src/components/layout/Navbar';
import { LoadingScreen } from '@/src/components/common/LoadingScreen';
import TicketForm from '@/src/components/tickets/TicketForm';

function TicketDetailContent() {
    const router = useRouter();
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading ticket..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Navbar />
            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                <TicketForm mode="view" ticketId={id} />
            </Container>
        </Box>
    );
}

export default function TicketDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading ticket..." />}>
            <TicketDetailContent />
        </Suspense>
    );
}
