'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import OpportunityForm from '@/components/opportunities/OpportunityForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useOpportunity } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

function OpportunityDetailContent() {
    const router = useRouter();
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading, isAuthenticated } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record } = useOpportunity(id);
    const showNumber = useShowRecordNumber();
    const recordTitle = (showNumber('opportunity') ? record?.opportunityCode : '') || record?.organizationName || '';

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading opportunity details..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="opportunity" entity={record} title={recordTitle} listHref={ROUTES.OPPORTUNITIES}>
                <Navbar />

                <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                    <OpportunityForm mode="view" opportunityId={id} />
                </Container>
            </RecordWorkspace>
        </Box>
    );
}

export default function OpportunityDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading opportunity..." />}>
            <OpportunityDetailContent />
        </Suspense>
    );
}
