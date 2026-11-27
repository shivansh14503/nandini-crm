'use client';

import React from 'react';
import { Alert, Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { AppBreadcrumbsBar } from '@/components/common/AppBreadcrumbsBar';
import type { BreadcrumbItem } from '@/components/common/AppBreadcrumbs';
import { isAdminUser } from '@/utils/adminRoles';

/** Auth + admin guard and the standard admin chrome (Navbar, breadcrumbs) for the PDF template pages. */
export function AdminPageShell({
    breadcrumbs,
    loadingMessage,
    children,
    maxWidth = 'xl',
    deniedMessage = 'Only administrators can manage PDF templates. Ask an Admin or Super Admin for access.',
}: {
    breadcrumbs: BreadcrumbItem[];
    loadingMessage: string;
    children: React.ReactNode;
    maxWidth?: 'lg' | 'xl' | false;
    /** Shown instead of the page to signed-in users who aren't administrators. */
    deniedMessage?: string;
}) {
    const { user, loading, error, clearError } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message={loadingMessage} />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />
            <Container maxWidth={maxWidth} sx={{ pt: 2, pb: 4, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <AppBreadcrumbsBar items={breadcrumbs} />
                {isAdminUser(user) ? (
                    children
                ) : (
                    <Alert severity="warning" sx={{ borderRadius: '10px', fontSize: '13px' }}>
                        {deniedMessage}
                    </Alert>
                )}
            </Container>
        </Box>
    );
}
