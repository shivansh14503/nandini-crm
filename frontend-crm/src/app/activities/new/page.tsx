'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import ActivityForm from '@/components/activities/ActivityForm';
import { useRelatedRecord } from '@/components/activities/relatedRecord';
import { isActivityRelatedModule } from '@/types/activity.types';
import type { ActivityFormValues } from '@/validations/activity.schema';
import { isDay, isWallClock } from '@/utils/zonedTime';

/**
 * `/activities/new?type&relatedModule&relatedId&start&end&allDay`: a new activity prefilled from the query string
 * (start / end are business-timezone wall clocks, or days when allDay=1). The related record is loaded first so
 * its label, organization and contact come with it.
 */
function NewActivityContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading, isAuthenticated } = useAuth();

    const type = searchParams?.get('type') ?? '';
    const moduleParam = searchParams?.get('relatedModule') ?? '';
    const relatedModule = isActivityRelatedModule(moduleParam) ? moduleParam : '';
    const relatedId = relatedModule ? (searchParams?.get('relatedId') ?? '') : '';
    const allDay = ['1', 'true'].includes(searchParams?.get('allDay') ?? '');
    const start = searchParams?.get('start') ?? '';
    const end = searchParams?.get('end') ?? '';
    const related = useRelatedRecord(relatedModule, relatedId || undefined);

    const initialData = useMemo<Partial<ActivityFormValues>>(() => {
        const valid = (value: string) => (allDay ? isDay(value.slice(0, 10)) : isWallClock(value));
        const target = related.target;
        return {
            ...(type ? { followupType: type } : {}),
            ...(allDay ? { allDay: true } : {}),
            ...(valid(start) ? { startAt: allDay ? start.slice(0, 10) : start } : {}),
            ...(valid(end) ? { endAt: allDay ? end.slice(0, 10) : end } : {}),
            ...(relatedModule && relatedId
                ? {
                      relatedModule,
                      relatedId,
                      relatedTo: target?.label ?? '',
                      organizationName: target?.organizationName ?? '',
                      organizationId: target?.organizationId ?? '',
                      contact: target?.contact ?? '',
                      contactId: target?.contactId ?? '',
                  }
                : {}),
        };
    }, [type, allDay, start, end, relatedModule, relatedId, related.target]);

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading || related.loading) return <LoadingScreen message="Loading..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <Navbar />
            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                <ActivityForm mode="create" initialData={initialData} />
            </Container>
        </Box>
    );
}

export default function NewActivityPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading..." />}>
            <NewActivityContent />
        </Suspense>
    );
}
