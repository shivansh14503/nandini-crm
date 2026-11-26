'use client';

import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import ContactForm from '@/components/contacts/ContactForm';

export default function NewContactPage() {
    const { user, loading } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />

            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                {/* ── Form with top action bar & breadcrumbs in a single row ── */}
                <ContactForm mode="create" />
            </Container>
        </Box>
    );
}
