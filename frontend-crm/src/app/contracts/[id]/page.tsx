'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import ContractForm from '@/components/contracts/ContractForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useContract } from '@/hooks/queries';

function ContractDetailContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record } = useContract(id);
    const recordTitle = record?.contractTitle ?? '';

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading contract..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="contract" entity={record} title={recordTitle} listHref={ROUTES.CONTRACTS}>
                <Navbar />
                <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                    <ContractForm mode="view" contractId={id} />
                </Container>
            </RecordWorkspace>
        </Box>
    );
}

export default function ContractDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading contract..." />}>
            <ContractDetailContent />
        </Suspense>
    );
}
