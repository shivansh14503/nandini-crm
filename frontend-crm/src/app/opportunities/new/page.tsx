'use client';

import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import OpportunityForm from '@/components/opportunities/OpportunityForm';

export default function NewOpportunityPage() {
    const { user, loading } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading opportunity creator..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />

            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                <OpportunityForm mode="create" />
            </Container>
        </Box>
    );
}
