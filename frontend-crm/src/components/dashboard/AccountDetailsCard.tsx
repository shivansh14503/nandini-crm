"use client";

import { Card, CardContent, Typography, Box } from '@mui/material';
import type { User } from '@/types/auth.types';

interface AccountDetailsCardProps {
    user: User;
}

export function AccountDetailsCard({ user }: AccountDetailsCardProps) {
    return (
        <Card
            elevation={0}
            sx={{
                borderRadius: '16px',
                border: '1px solid #E8ECF0',
                backgroundColor: 'background.paper',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                p: 2,
            }}
        >
            <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                    Welcome back, {user.username}!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                    Your session is secured using HTTP-only cookies.
                </Typography>

                <Box
                    sx={{
                        p: 2.5,
                        backgroundColor: '#F8FAFC',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        display: 'inline-block',
                        minWidth: 280,
                    }}
                >
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5, fontWeight: 600 }}>
                        Account Details
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary', mb: 0.5 }}>
                        <strong>User ID:</strong> {user.id}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary', mb: 0.5 }}>
                        <strong>Username:</strong> {user.username}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                        <strong>Role:</strong> {user.role}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );
}
