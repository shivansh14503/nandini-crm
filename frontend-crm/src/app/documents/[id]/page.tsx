'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ROUTES } from '@/config/constants';
import { useListOrigin } from '@/utils/listOrigin';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { DocumentDetailView } from '@/components/documents';

function DocumentDetailContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();
    const backHref = useListOrigin(ROUTES.DOCUMENTS);

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading document..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100dvh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />
            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 3, px: { xs: 1.5, sm: 2, md: 3 } }}>
                <DocumentDetailView documentId={id} backHref={backHref} />
            </Container>
        </Box>
    );
}

export default function DocumentDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading document..." />}>
            <DocumentDetailContent />
        </Suspense>
    );
}
