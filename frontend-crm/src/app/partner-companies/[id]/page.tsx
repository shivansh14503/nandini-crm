'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import PartnerCompanyForm from '@/components/partner-companies/PartnerCompanyForm';

function PartnerCompanyDetailContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading partner company..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />
            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                <PartnerCompanyForm mode="view" partnerCompanyId={id} />
            </Container>
        </Box>
    );
}

export default function PartnerCompanyDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading partner company..." />}>
            <PartnerCompanyDetailContent />
        </Suspense>
    );
}
