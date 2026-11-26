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
    const { user, isAuthenticated, loading } = useAuth();
    const mustChangePassword = Boolean(user?.mustChangePassword);

    useEffect(() => {
        if (!loading && isAuthenticated) {
            // A temporary password must be changed first; otherwise back to `?next=` (CRM paths only) or the dashboard.
            router.push(mustChangePassword ? ROUTES.PROFILE_SECURITY : nextPathFromLocation(ROUTES.DASHBOARD));
        }
    }, [isAuthenticated, mustChangePassword, loading, router]);

    return (
        <AuthCard>
            <LoginForm />
        </AuthCard>
    );
}
