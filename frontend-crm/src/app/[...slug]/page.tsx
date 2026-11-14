'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Button,
    Card,
    CardContent,
    Container,
    Typography,
    Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ApartmentIcon from '@mui/icons-material/Apartment';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import { useAuth } from '@/context/AuthContext';
import { Navbar } from '@/components/layout/Navbar';
import { AppBreadcrumbs } from '@/components/common/AppBreadcrumbs';
import { EnterpriseFooter } from '@/components/common/EnterpriseFooter';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { ROUTES } from '@/config/constants';

/**
 * Dynamic Catch-All Route for future localhost/{something} pages.
 * Guarantees that permanent breadcrumbs, Navbar, and layout persist
 * across any future arbitrary route created in the CRM.
 */
function DynamicCrmPageContent() {
    const router = useRouter();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading page..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            {/* Global Navbar */}
            <Navbar />

            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 4, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <ErrorAlert error={error} onClose={clearError} />

                {/* ── Permanent Automatic Route-Aware Breadcrumbs ── */}
                <Box sx={{ mb: 3 }}>
                    <React.Suspense fallback={null}>
                        <AppBreadcrumbs />
                    </React.Suspense>
                </Box>

                {/* ── Enterprise Module Scaffold Card ── */}
                <Card
                    elevation={0}
                    sx={{
                        border: '1px solid var(--mui-palette-border-main)',
                        borderRadius: '12px',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        p: { xs: 3, md: 5 },
                        textAlign: 'center',
                        my: 'auto',
                    }}
                >
                    <CardContent sx={{ maxWidth: 560, mx: 'auto', p: 0 }}>
                        <Box
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: '12px',
                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                color: 'var(--crm-text-blue-600)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2,
                            }}
                        >
                            <DashboardOutlinedIcon sx={{ fontSize: 32 }} />
                        </Box>

                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--mui-palette-text-primary)', mb: 1 }}>
                            Module Ready for Production
                        </Typography>

                        <Typography variant="body2" sx={{ color: 'var(--mui-palette-text-secondary)', mb: 3, lineHeight: 1.6 }}>
                            This module route has been registered with the Nandini CRM design system.
                            The permanent breadcrumbs above automatically reflect your path hierarchy and navigation history.
                        </Typography>

                        <Divider sx={{ my: 2.5 }} />

                        <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-muted)', display: 'block', mb: 2, fontWeight: 600 }}>
                            QUICK CRM SHORTCUTS
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<ApartmentIcon sx={{ fontSize: 16 }} />}
                                onClick={() => router.push(ROUTES.ORGANIZATIONS)}
                                sx={{
                                    borderRadius: '8px',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.82rem',
                                    color: 'var(--crm-text-blue-700)',
                                    borderColor: 'var(--mui-palette-border-strong)',
                                }}
                            >
                                Organizations
                            </Button>

                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<PersonOutlinedIcon sx={{ fontSize: 16 }} />}
                                onClick={() => router.push(ROUTES.CONTACTS)}
                                sx={{
                                    borderRadius: '8px',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.82rem',
                                    color: 'var(--crm-text-blue-700)',
                                    borderColor: 'var(--mui-palette-border-strong)',
                                }}
                            >
                                Contacts
                            </Button>

                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
                                onClick={() => router.push(ROUTES.DASHBOARD)}
                                sx={{
                                    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                                    borderRadius: '8px',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    px: 2,
                                }}
                            >
                                Return to Dashboard
                            </Button>
                        </Box>
                    </CardContent>
                </Card>
            </Container>

            {/* Global Enterprise Footer */}
            <EnterpriseFooter />
        </Box>
    );
}

export default function DynamicCrmPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading page..." />}>
            <DynamicCrmPageContent />
        </Suspense>
    );
}
