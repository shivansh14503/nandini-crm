'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { AppPageLayout } from '@/components/layout/AppPageLayout';
import { BookingLinksView } from '@/components/booking-links/BookingLinksView';

/** /booking-links: the signed-in user's public booking pages (Calendar Phase 4). Reached from the user menu. */
export default function BookingLinksPage() {
    const router = useRouter();
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) router.push(ROUTES.LOGIN);
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading booking links..." />;
    if (!user) return null;

    return (
        <AppPageLayout breadcrumbItems={[{ label: 'Booking links' }]}>
            <BookingLinksView />
        </AppPageLayout>
    );
}
