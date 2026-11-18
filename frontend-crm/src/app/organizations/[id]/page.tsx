'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import OrganizationForm from '@/components/organizations/OrganizationForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useOrganization } from '@/hooks/queries';

function OrganizationDetailContent() {
    const router = useRouter();
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading, isAuthenticated } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record } = useOrganization(id);
    const recordTitle = record?.organizationName ?? '';

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading organization..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="organization" entity={record} title={recordTitle} listHref={ROUTES.ORGANIZATIONS}>
                <Navbar />

                <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                    <OrganizationForm mode="view" organizationId={id} />
                </Container>
            </RecordWorkspace>
        </Box>
    );
}

export default function OrganizationDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading organization..." />}>
            <OrganizationDetailContent />
        </Suspense>
    );
}
