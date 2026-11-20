'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Box } from '@mui/material';
import { FollowUpHistoryLayout } from '@/components/common/FollowUpHistory/FollowUpHistoryLayout';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import LeadForm from '@/components/leads/LeadForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useLead } from '@/hooks/queries';

function LeadDetailContent() {
    const router = useRouter();
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading, isAuthenticated } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record } = useLead(id);
    const recordTitle = record?.name ?? '';

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading lead details..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="lead" entity={record} title={recordTitle} listHref={ROUTES.LEADS}>
                <Navbar />

                <FollowUpHistoryLayout entityType="leads" recordId={id} recordLabel="Lead">
                    <LeadForm mode="view" leadId={id} />
                </FollowUpHistoryLayout>
            </RecordWorkspace>
        </Box>
    );
}

export default function LeadDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading lead..." />}>
            <LeadDetailContent />
        </Suspense>
    );
}
