'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { SearchResultsView } from '@/components/search/SearchResultsView';

/** /search?q=…[&module=leads&page=2]: global search results across every module. */
export default function SearchPage() {
    const router = useRouter();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading search..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />
            {/* useSearchParams needs a Suspense boundary in the App Router. */}
            <Suspense fallback={null}>
                <SearchResultsView />
            </Suspense>
        </Box>
    );
}
