'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/src/context/AuthContext';
import { ROUTES } from '@/src/config/constants';
import { Navbar } from '@/src/components/layout/Navbar';
import { LoadingScreen } from '@/src/components/common/LoadingScreen';
import ProductForm from '@/src/components/products/ProductForm';

export default function NewProductPage() {
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
            <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                <ProductForm mode="create" />
            </Container>
        </Box>
    );
}
