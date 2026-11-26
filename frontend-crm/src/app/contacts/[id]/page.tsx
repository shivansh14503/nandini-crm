'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import ContactForm from '@/components/contacts/ContactForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useContact } from '@/hooks/queries';

function ContactDetailContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record } = useContact(id);
    const recordTitle = record?.name ?? '';

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading contact..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="contact" entity={record} title={recordTitle} listHref={ROUTES.CONTACTS}>
                <Navbar />

                <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                    <ContactForm mode="view" contactId={id} />
                </Container>
            </RecordWorkspace>
        </Box>
    );
}

export default function ContactDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading contact..." />}>
            <ContactDetailContent />
        </Suspense>
    );
}
