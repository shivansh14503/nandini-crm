"use client";

import { AuthCard } from '@/components/auth/AuthCard';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

/** Public page behind "Forgot password?": asks for a username or work email and emails a reset link. No sign-in needed. */
export default function ForgotPasswordPage() {
    return (
        <AuthCard>
            <ForgotPasswordForm />
        </AuthCard>
    );
}
