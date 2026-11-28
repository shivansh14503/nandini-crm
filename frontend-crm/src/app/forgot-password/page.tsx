"use client";

import { AuthCard } from '@/components/auth/AuthCard';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

/** Public page behind "Forgot password?" when no username was typed on sign-in: asks for it and emails a reset link. */
export default function ForgotPasswordPage() {
    return (
        <AuthCard>
            <ForgotPasswordForm />
        </AuthCard>
    );
}
