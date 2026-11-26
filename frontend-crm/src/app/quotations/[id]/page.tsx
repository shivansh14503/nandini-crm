'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { CreateQuoteForm } from '@/components/quotations/CreateQuoteForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useQuotation } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

function QuotationDetailContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record } = useQuotation(id);
    const showNumber = useShowRecordNumber();
    const recordTitle = (showNumber('quotation') ? record?.quotationCode : '') || record?.quotationSubject || '';

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading quotation..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="quotation" entity={record} title={recordTitle} listHref={ROUTES.QUOTATIONS}>
                <Navbar />

                <Container maxWidth="xl" sx={{ pt: 2.5, pb: 4 }}>
                    <CreateQuoteForm mode="view" quotationId={id} />
                </Container>
            </RecordWorkspace>
        </Box>
    );
}

export default function QuotationDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading quotation..." />}>
            <QuotationDetailContent />
        </Suspense>
    );
}
