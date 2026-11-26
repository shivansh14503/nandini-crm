'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box } from '@mui/material';
import { FollowUpHistoryLayout } from '@/components/common/FollowUpHistory/FollowUpHistoryLayout';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import OpportunityForm from '@/components/opportunities/OpportunityForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useOpportunity } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

function OpportunityDetailContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record } = useOpportunity(id);
    const showNumber = useShowRecordNumber();
    const recordTitle = (showNumber('opportunity') ? record?.opportunityCode : '') || record?.organizationName || '';

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading opportunity details..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="opportunity" entity={record} title={recordTitle} listHref={ROUTES.OPPORTUNITIES}>
                <Navbar />

                <FollowUpHistoryLayout entityType="opportunities" recordId={id} recordLabel="Opportunity">
                    <OpportunityForm mode="view" opportunityId={id} />
                </FollowUpHistoryLayout>
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
