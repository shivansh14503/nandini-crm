"use client";

import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import Image from 'next/image';
import NIPLLogo from '@/public/images/NIPL-Updated-Logo-Large.png';
import { APP_CONFIG } from '@/config/constants';

interface AuthCardProps {
    children: React.ReactNode;
}

export function AuthCard({ children }: AuthCardProps) {
    const currentYear = 2026;

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'background.default',
                p: 2,
            }}
        >
            <Card
                elevation={0}
                sx={{
                    width: '100%',
                    maxWidth: 480,
                    borderRadius: '16px',
                    boxShadow: '0 4px 32px rgba(0, 0, 0, 0.08)',
                    border: '1px solid #E8ECF0',
                    backgroundColor: 'background.paper',
                }}
            >
                <CardContent sx={{ p: { xs: 4, sm: 5 } }}>
                    {/* Brand Logo */}
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            mb: 4,
                        }}
                    >
                        <Image
                            src={NIPLLogo}
                            alt={APP_CONFIG.logoAlt}
                            priority
                            style={{
                                width: 'auto',
                                height: '56px',
                                maxWidth: '240px',
                                objectFit: 'contain',
                            }}
                        />
                    </Box>

                    {/* Main Content (Form) */}
                    {children}

                    {/* Footer */}
                    <Typography
                        sx={{
                            textAlign: 'center',
                            fontSize: '12px',
                            color: 'text.secondary',
                            mt: 3,
                        }}
                    >
                        &copy; {currentYear} {APP_CONFIG.companyName}. All rights reserved.
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
}
