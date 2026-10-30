'use client';

import { useEffect } from 'react';
import { Box, Button, Container, Typography } from '@mui/material';
import { Navbar } from '@/components/layout/Navbar';
import { ErrorAlert } from '@/components/common/ErrorAlert';

export default function GlobalRouteError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Route error boundary caught:', error);
    }, [error]);

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <Container maxWidth="md" sx={{ pt: 6, pb: 4 }}>
                <ErrorAlert
                    id="route-error-alert"
                    error={error?.message || 'An unexpected error occurred while rendering this page.'}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                        Please try refreshing the view or return to the dashboard.
                    </Typography>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={reset}
                        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
                    >
                        Try Again
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}
