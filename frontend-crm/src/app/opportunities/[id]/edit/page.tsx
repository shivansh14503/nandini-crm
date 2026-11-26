'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box } from '@mui/material';
import { FollowUpHistoryLayout } from '@/components/common/FollowUpHistory/FollowUpHistoryLayout';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import OpportunityForm from '@/components/opportunities/OpportunityForm';

function OpportunityEditContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading opportunity editor..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />

            <FollowUpHistoryLayout entityType="opportunities" recordId={id} recordLabel="Opportunity">
                <OpportunityForm mode="edit" opportunityId={id} />
            </FollowUpHistoryLayout>
        </Box>
    );
}

export default function OpportunityEditPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading opportunity editor..." />}>
            <OpportunityEditContent />
        </Suspense>
    );
}
