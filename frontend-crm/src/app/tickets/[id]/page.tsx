'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import TicketForm from '@/components/tickets/TicketForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useTicket } from '@/hooks/queries';

function TicketDetailContent() {
    const router = useRouter();
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading, isAuthenticated } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record } = useTicket(id);
    const recordTitle = record?.ticketSubject ?? '';

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading ticket..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="ticket" entity={record} title={recordTitle} listHref={ROUTES.TICKETS}>
                <Navbar />
                <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                    <TicketForm mode="view" ticketId={id} />
                </Container>
            </RecordWorkspace>
        </Box>
    );
}

export default function TicketDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading ticket..." />}>
            <TicketDetailContent />
        </Suspense>
    );
}
