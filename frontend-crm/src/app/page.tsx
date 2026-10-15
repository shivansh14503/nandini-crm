"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { ROUTES } from '@/src/config/constants';
import { LoadingScreen } from '@/src/components/common/LoadingScreen';

export default function HomePage() {
    const router = useRouter();
    const { isAuthenticated, loading } = useAuth();

    useEffect(() => {
        if (!loading) {
            router.replace(isAuthenticated ? ROUTES.DASHBOARD : ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    return <LoadingScreen message="Redirecting to CRM portal..." />;
}
