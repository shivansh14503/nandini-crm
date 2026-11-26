'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { AppPageLayout } from '@/components/layout/AppPageLayout';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { ProfileView } from '@/components/profile/ProfileView';

/** /profile[?tab=security]: the signed-in user's own profile, photo, password and sessions. Any signed-in user. */
export default function ProfilePage() {
    const router = useRouter();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) router.push(ROUTES.LOGIN);
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading your profile..." />;
    if (!user) return null;

    return (
        <AppPageLayout breadcrumbItems={[{ label: 'My Profile' }]} maxWidth="lg">
            <ErrorAlert error={error} onClose={clearError} />
            {/* useSearchParams (the ?tab= value) needs a Suspense boundary in the App Router. */}
            <Suspense fallback={null}>
                <ProfileView />
            </Suspense>
        </AppPageLayout>
    );
}
