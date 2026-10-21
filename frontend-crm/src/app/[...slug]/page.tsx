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
import { useAuth } from '@/src/context/AuthContext';
import { Navbar } from '@/src/components/layout/Navbar';
import { AppBreadcrumbs } from '@/src/components/common/AppBreadcrumbs';
import { EnterpriseFooter } from '@/src/components/common/EnterpriseFooter';
import { LoadingScreen } from '@/src/components/common/LoadingScreen';
import { ErrorAlert } from '@/src/components/common/ErrorAlert';
import { ROUTES } from '@/src/config/constants';

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
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
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
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        backgroundColor: '#ffffff',
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
                                backgroundColor: '#eff6ff',
                                color: '#2563eb',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2,
                            }}
                        >
                            <DashboardOutlinedIcon sx={{ fontSize: 32 }} />
                        </Box>

                        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1 }}>
                            Module Ready for Production
                        </Typography>

                        <Typography variant="body2" sx={{ color: '#64748b', mb: 3, lineHeight: 1.6 }}>
                            This module route has been registered with the Nandini CRM design system.
                            The permanent breadcrumbs above automatically reflect your path hierarchy and navigation history.
                        </Typography>

                        <Divider sx={{ my: 2.5 }} />

                        <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mb: 2, fontWeight: 600 }}>
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
                                    color: '#1d4ed8',
                                    borderColor: '#cbd5e1',
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
                                    color: '#1d4ed8',
                                    borderColor: '#cbd5e1',
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
                                    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
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
