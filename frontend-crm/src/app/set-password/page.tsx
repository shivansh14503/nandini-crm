"use client";

import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { SetPasswordForm } from '@/components/auth/SetPasswordForm';
import { LoadingScreen } from '@/components/common/LoadingScreen';

/** Public page an emailed invite / password reset link opens (`/set-password?token=…`). No sign-in needed. */
export default function SetPasswordPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Checking your link..." />}>
            <AuthCard>
                <SetPasswordForm />
            </AuthCard>
        </Suspense>
    );
}
