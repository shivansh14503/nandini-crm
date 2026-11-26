'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import OrganizationForm from '@/components/organizations/OrganizationForm';

function EditOrganizationContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading organization..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />

            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                <OrganizationForm mode="edit" organizationId={id} />
            </Container>
        </Box>
    );
}

export default function EditOrganizationPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading organization..." />}>
            <EditOrganizationContent />
        </Suspense>
    );
}
