'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ConvertLeadForm } from '@/components/leads/ConvertLeadForm';

function ConvertLeadContent() {
    const router = useRouter();
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading lead conversion..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Navbar />

            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 4 }}>
                <ConvertLeadForm leadId={id} />
            </Container>
        </Box>
    );
}

export default function ConvertLeadPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading lead conversion..." />}>
            <ConvertLeadContent />
        </Suspense>
    );
}
