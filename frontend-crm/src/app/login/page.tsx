"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { nextPathFromLocation } from '@/utils/safeNextPath';

export default function LoginPage() {
    const router = useRouter();
    const { isAuthenticated, loading } = useAuth();

    useEffect(() => {
        if (!loading && isAuthenticated) {
            router.push(nextPathFromLocation(ROUTES.DASHBOARD));
        }
    }, [isAuthenticated, loading, router]);

    return (
        <AuthCard>
            <LoginForm />
        </AuthCard>
    );
}
