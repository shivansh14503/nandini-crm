import type { Metadata } from 'next';

/** /forgot-password ("Forgot password?" on the sign-in page): public, never indexed. */
export const metadata: Metadata = {
    title: 'Forgot password',
    robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
    return children;
}
