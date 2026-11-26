'use client';

import { Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { AppPageLayout } from '@/components/layout/AppPageLayout';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { ProfileView } from '@/components/profile/ProfileView';

/**
 * /profile[?tab=notifications|connected-accounts|security]: the signed-in user's own profile, photo, notification
 * preferences, out of office, calendar connections, password and sessions. Any signed-in user.
 */
export default function ProfilePage() {
    const { user, loading, error, clearError } = useAuth();

    useRequireAuth();

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
