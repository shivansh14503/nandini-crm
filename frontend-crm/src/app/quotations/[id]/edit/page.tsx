'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { CreateQuoteForm } from '@/components/quotations/CreateQuoteForm';

function QuotationEditContent() {
    const router = useRouter();
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading quotation editor..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Navbar />

            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 4 }}>
                <CreateQuoteForm mode="edit" quotationId={id} />
            </Container>
        </Box>
    );
}

export default function QuotationEditPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading quotation editor..." />}>
            <QuotationEditContent />
        </Suspense>
    );
}
