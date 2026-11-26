'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box } from '@mui/material';
import { FollowUpHistoryLayout } from '@/components/common/FollowUpHistory/FollowUpHistoryLayout';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import LeadForm from '@/components/leads/LeadForm';

function LeadEditContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading lead editor..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />

            <FollowUpHistoryLayout entityType="leads" recordId={id} recordLabel="Lead">
                <LeadForm mode="edit" leadId={id} />
            </FollowUpHistoryLayout>
        </Box>
    );
}

export default function LeadEditPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading lead editor..." />}>
            <LeadEditContent />
        </Suspense>
    );
}
