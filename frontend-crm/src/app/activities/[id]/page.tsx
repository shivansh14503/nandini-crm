'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import ActivityForm from '@/components/activities/ActivityForm';

/** An activity's own page (no related-modules workspace: its related record is a link on the page). */
function ActivityDetailContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading activity..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />
            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                <ActivityForm key={id} mode="view" activityId={id} />
            </Container>
        </Box>
    );
}

export default function ActivityDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading activity..." />}>
            <ActivityDetailContent />
        </Suspense>
    );
}
