'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { EnterpriseFooter } from '@/components/common/EnterpriseFooter';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { AppBreadcrumbsBar } from '@/components/common/AppBreadcrumbsBar';
import type { BreadcrumbItem } from '@/components/common/AppBreadcrumbs';
import { isAdminRole } from '@/utils/adminRoles';

/** Auth + admin guard and the standard admin chrome (Navbar, breadcrumbs, footer) for the PDF template pages. */
export function AdminPageShell({
    breadcrumbs,
    loadingMessage,
    children,
    maxWidth = 'xl',
    footer = true,
    deniedMessage = 'Only administrators can manage PDF templates. Ask an Admin or Super Admin for access.',
}: {
    breadcrumbs: BreadcrumbItem[];
    loadingMessage: string;
    children: React.ReactNode;
    maxWidth?: 'lg' | 'xl' | false;
    footer?: boolean;
    /** Shown instead of the page to signed-in users who aren't administrators. */
    deniedMessage?: string;
}) {
    const router = useRouter();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) router.push(ROUTES.LOGIN);
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message={loadingMessage} />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />
            <Container maxWidth={maxWidth} sx={{ pt: 2, pb: 4, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <AppBreadcrumbsBar items={breadcrumbs} />
                {isAdminRole(user.role) ? (
                    children
                ) : (
                    <Alert severity="warning" sx={{ borderRadius: '10px', fontSize: '13px' }}>
                        {deniedMessage}
                    </Alert>
                )}
            </Container>
            {footer && <EnterpriseFooter />}
        </Box>
    );
}
