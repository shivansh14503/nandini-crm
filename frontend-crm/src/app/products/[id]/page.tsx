'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Container } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import ProductForm from '@/components/products/ProductForm';
import { RecordWorkspace } from '@/components/common/RecordWorkspace';
import { useProduct } from '@/hooks/queries';
import { ProductUsageCard } from '@/components/products/ProductUsage';

function ProductDetailContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const { user, loading } = useAuth();
    // The record itself feeds the related modules sidebar.
    const { data: record, isPending: recordPending } = useProduct(id);
    const recordTitle = record?.productName ?? '';

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading product..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
            <RecordWorkspace entityType="product" entity={record} title={recordTitle} listHref={ROUTES.PRODUCTS}>
                <Navbar />
                <Container maxWidth="xl" sx={{ pt: 2.5, pb: 1 }}>
                    <ProductForm mode="view" productId={id} />
                    {/* Opportunities carrying this product, under the product details. */}
                    <ProductUsageCard productId={id} usage={record?.usage} loading={recordPending} />
                </Container>
            </RecordWorkspace>
        </Box>
    );
}

export default function ProductDetailPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading product..." />}>
            <ProductDetailContent />
        </Suspense>
    );
}
