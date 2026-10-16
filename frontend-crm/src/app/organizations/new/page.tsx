'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Container, Breadcrumbs, Link, Typography } from '@mui/material';
import { useAuth } from '@/src/context/AuthContext';
import { ROUTES } from '@/src/config/constants';
import { Navbar } from '@/src/components/layout/Navbar';
import { LoadingScreen } from '@/src/components/common/LoadingScreen';
import OrganizationForm from '@/src/components/organizations/OrganizationForm';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export default function NewOrganizationPage() {
    const router = useRouter();
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Navbar />

            <Container maxWidth="xl" sx={{ pt: 3, pb: 10 }}>

                {/* ── Breadcrumb: Sales > Organizations > Create & Edit View ── */}
                <Breadcrumbs
                    separator={<NavigateNextIcon fontSize="small" sx={{ color: '#9ca3af' }} />}
                    aria-label="breadcrumb"
                    sx={{ mb: 2.5 }}
                >
                    <Typography
                        sx={{ fontSize: '0.8rem', color: '#6b7280', '&:hover': { color: '#2563EB' } }}
                    >
                        Sales
                    </Typography>
                    <Link
                        underline="hover"
                        href={ROUTES.ORGANIZATIONS}
                        sx={{ fontSize: '0.8rem', color: '#6b7280', '&:hover': { color: '#2563EB' } }}
                    >
                        Organizations
                    </Link>
                    <Typography sx={{ fontSize: '0.8rem', color: '#374151', fontWeight: 700 }}>
                        Create &amp; Edit View
                    </Typography>
                </Breadcrumbs>

                {/* ── Form ──────────────────────────────────────────────────── */}
                <OrganizationForm mode="create" />

            </Container>
        </Box>
    );
}
