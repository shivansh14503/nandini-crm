"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthCard } from '@/src/components/auth/AuthCard';
import { LoginForm } from '@/src/components/auth/LoginForm';
import { useAuth } from '@/src/context/AuthContext';
import { ROUTES } from '@/src/config/constants';

export default function LoginPage() {
    const router = useRouter();
    const { isAuthenticated, loading } = useAuth();

    useEffect(() => {
        if (!loading && isAuthenticated) {
            router.push(ROUTES.DASHBOARD);
        }
    }, [isAuthenticated, loading, router]);

    return (
        <AuthCard>
            <LoginForm />
        </AuthCard>
    );
}
