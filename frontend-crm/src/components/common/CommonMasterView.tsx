'use client';

import React from 'react';
import { Box, Paper, SxProps, Theme } from '@mui/material';
import { AppBreadcrumbs, type BreadcrumbItem } from './AppBreadcrumbs';
import { EnterpriseFooter } from './EnterpriseFooter';

export interface CommonMasterViewProps {
    /**
     * Optional custom breadcrumb elements. If omitted, AppBreadcrumbs is used with optional `breadcrumbItems`.
     */
    breadcrumbs?: React.ReactNode;
    /**
     * Optional breadcrumb items passed to AppBreadcrumbs if custom breadcrumbs element is omitted.
     */
    breadcrumbItems?: BreadcrumbItem[];
    /**
     * Filter controls (e.g. FilterPills, category chips) rendered on the line directly below breadcrumbs.
     */
    filters?: React.ReactNode;
    /**
     * Optional action controls rendered on the right side of the filter row (e.g. Export, Filter/Views).
     */
    headerActions?: React.ReactNode;
    /**
     * Toolbar component containing search input, New Record button, refresh, and bulk actions.
     */
    toolbar?: React.ReactNode;
    /**
     * The main table component. Can also be passed as children.
     */
    table?: React.ReactNode;
    /**
     * Table pagination controls displayed at the bottom of the table paper.
     */
    pagination?: React.ReactNode;
    /**
     * Side detail drawer component (rendered outside the paper card).
     */
    drawer?: React.ReactNode;
    /**
     * Whether a side detail drawer is currently open, used to apply subtle blur to the background table.
     */
    isDrawerOpen?: boolean;
    /**
     * Toast notification component (e.g. AppToast).
     */
    toast?: React.ReactNode;
    /**
     * Optional custom footer. If omitted and `hideFooter` is false, EnterpriseFooter is rendered.
     */
    footer?: React.ReactNode;
    /**
     * Set to true to hide the EnterpriseFooter.
     */
    hideFooter?: boolean;
    /**
     * Children rendered inside the table paper card (useful if not passing `table` prop directly).
     */
    children?: React.ReactNode;
    /**
     * Custom sx styling for outer page container.
     */
    sx?: SxProps<Theme>;
    /**
     * Custom sx styling for the inner content container.
     */
    contentSx?: SxProps<Theme>;
    /**
     * Custom sx styling for the Paper table container.
     */
    paperSx?: SxProps<Theme>;
}

/**
 * CommonMasterView provides a unified, consistent page template for all master CRM views:
 * 1. Line 1: Route-aware Breadcrumbs.
 * 2. Line 2: Filter pills and optional right-aligned header actions.
 * 3. Line 3: Standard Paper table card housing Toolbar, Table, and Pagination.
 * 4. Outside: Detail drawer, standard Enterprise CRM Footer, and Toast notifications.
 */
export function CommonMasterView({
    breadcrumbs,
    breadcrumbItems,
    filters,
    headerActions,
    toolbar,
    table,
    pagination,
    drawer,
    isDrawerOpen = false,
    toast,
    footer,
    hideFooter = false,
    children,
    sx,
    contentSx,
    paperSx,
}: CommonMasterViewProps) {
    return (
        <Box
            sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 'calc(100vh - 64px)',
                backgroundColor: '#f8fafc',
                width: '100%',
                ...sx,
            }}
        >
            {/* ── Main Page Content ────────────────────────────────────────── */}
            <Box
                sx={{
                    px: { xs: 2, md: 3 },
                    pt: 2,
                    pb: 2,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    ...contentSx,
                }}
            >
                {/* ── Line 1: Route-Aware Breadcrumbs ── */}
                <Box sx={{ mb: 1.5 }}>
                    {breadcrumbs || <AppBreadcrumbs items={breadcrumbItems} />}
                </Box>

                {/* ── Line 2: All Filters & Optional Header Actions ── */}
                {(filters || headerActions) && (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1.5,
                            mb: 2,
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
                            {filters}
                        </Box>
                        {headerActions && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                {headerActions}
                            </Box>
                        )}
                    </Box>
                )}

                {/* ── Line 3: Main Table Card ── */}
                <Paper
                    elevation={0}
                    sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        filter: isDrawerOpen ? 'blur(1.5px)' : 'none',
                        transition: 'filter 0.2s ease-in-out',
                        ...paperSx,
                    }}
                >
                    {/* Search & Action Toolbar */}
                    {toolbar}

                    {/* Table View */}
                    {table}
                    {children}

                    {/* Pagination Bar */}
                    {pagination}
                </Paper>
            </Box>

            {/* ── Modular Detail Drawer ────────────────────────────────────── */}
            {drawer}

            {/* ── Enterprise CRM Global Footer ─────────────────────────────── */}
            {!hideFooter && (footer || <EnterpriseFooter />)}

            {/* ── Toast Notifications ──────────────────────────────────────── */}
            {toast}
        </Box>
    );
}

export { CommonMasterView as MasterViewLayout };
