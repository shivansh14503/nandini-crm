"use client";

import { Box, CircularProgress, Typography } from '@mui/material';

interface LoadingScreenProps {
    message?: string;
    minHeight?: string | number;
}

export function LoadingScreen({ message, minHeight = '100vh' }: LoadingScreenProps) {
    return (
        <Box
            sx={{
                minHeight,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'background.default',
                gap: 2,
            }}
        >
            <CircularProgress sx={{ color: 'primary.main' }} />
            {message && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {message}
                </Typography>
            )}
        </Box>
    );
}
