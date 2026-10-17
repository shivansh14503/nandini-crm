'use client';

import React from 'react';
import { Box, Container, SxProps, Theme } from '@mui/material';
import { Navbar } from './Navbar';
import { AppBreadcrumbs, type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { EnterpriseFooter } from '../common/EnterpriseFooter';

export interface AppPageLayoutProps {
    children: React.ReactNode;
    breadcrumbItems?: BreadcrumbItem[];
    headerActions?: React.ReactNode;
    maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
    fullWidth?: boolean;
    showFooter?: boolean;
    sx?: SxProps<Theme>;
}

/**
 * Standard enterprise page shell for all CRM views.
 * Guarantees permanent Navbar, route-aware auto-breadcrumbs, and consistent footer.
 */
export function AppPageLayout({
    children,
    breadcrumbItems,
    headerActions,
    maxWidth = 'xl',
    fullWidth = false,
    showFooter = true,
    sx,
}: AppPageLayoutProps) {
    return (
        <Box
            sx={{
                minHeight: '100vh',
                backgroundColor: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                ...sx,
            }}
        >
            {/* Global Navbar */}
            <Navbar />

            {/* Main Content Area */}
            {fullWidth ? (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* Header Row with permanent breadcrumbs */}
                    <Box
                        sx={{
                            px: { xs: 2, md: 3 },
                            pt: 2,
                            pb: 1.5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1.5,
                        }}
                    >
                        <AppBreadcrumbs items={breadcrumbItems} />
                        {headerActions && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                {headerActions}
                            </Box>
                        )}
                    </Box>

                    {/* Children */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {children}
                    </Box>
                </Box>
            ) : (
                <Container
                    maxWidth={maxWidth}
                    sx={{
                        pt: 2.5,
                        pb: 4,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {/* Header Row with permanent breadcrumbs */}
                    <Box
                        sx={{
                            mb: 2.5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1.5,
                        }}
                    >
                        <AppBreadcrumbs items={breadcrumbItems} />
                        {headerActions && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                {headerActions}
                            </Box>
                        )}
                    </Box>

                    {/* Children */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {children}
                    </Box>
                </Container>
            )}

            {/* Enterprise Footer */}
            {showFooter && <EnterpriseFooter />}
        </Box>
    );
}
