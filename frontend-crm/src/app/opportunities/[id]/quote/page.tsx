'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { CreateQuoteForm } from '@/components/quotations/CreateQuoteForm';

function CreateQuoteContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading quotation generator..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />

            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 4 }}>
                <CreateQuoteForm opportunityId={id} />
            </Container>
        </Box>
    );
}

export default function CreateQuotePage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading quotation generator..." />}>
            <CreateQuoteContent />
        </Suspense>
    );
}
