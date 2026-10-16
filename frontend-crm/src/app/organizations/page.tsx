'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Container, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useAuth } from '@/src/context/AuthContext';
import { ROUTES } from '@/src/config/constants';
import { Navbar } from '@/src/components/layout/Navbar';
import { LoadingScreen } from '@/src/components/common/LoadingScreen';
import { Breadcrumbs, Link } from '@mui/material';

export default function OrganizationsPage() {
    const router = useRouter();
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading organizations..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <Navbar />
            <Container maxWidth="xl" sx={{ pt: 3, pb: 6 }}>

                {/* Breadcrumb */}
                <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2, fontSize: '0.8rem' }}>
                    <Typography sx={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        Sales
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: '#374151', fontWeight: 600 }}>
                        Organizations
                    </Typography>
                </Breadcrumbs>

                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
                        Organizations
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => router.push(ROUTES.ORGANIZATION_NEW)}
                        sx={{
                            background: 'linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)',
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                            boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
                            '&:hover': { background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)' },
                        }}
                    >
                        New Organization
                    </Button>
                </Box>

                {/* Placeholder for OrganizationTable */}
                <Box sx={{
                    textAlign: 'center', py: 12, color: '#9ca3af',
                    border: '2px dashed #e5e7eb', borderRadius: '16px', backgroundColor: '#fff',
                }}>
                    <Typography variant="h6" sx={{ mb: 1, color: '#64748b', fontWeight: 600 }}>
                        No organizations yet
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 3, color: '#9ca3af' }}>
                        Create your first organization to get started.
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => router.push(ROUTES.ORGANIZATION_NEW)}
                        sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, borderColor: '#2563EB', color: '#2563EB' }}
                    >
                        Create Organization
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}
