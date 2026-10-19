'use client';

import React from 'react';
import { Box, Paper, Typography, type SxProps, type Theme } from '@mui/material';
import { AppBreadcrumbs, type BreadcrumbItem } from './AppBreadcrumbs';
import { FormStickyFooter } from '../forms/FormStickyFooter';

export interface FormTabItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
    hasDot?: boolean;
    sublabel?: string;
}

export interface CommonFormLayoutProps {
    /**
     * Optional custom breadcrumb elements. If omitted, AppBreadcrumbs is rendered with optional `breadcrumbItems`.
     */
    breadcrumbs?: React.ReactNode;
    /**
     * Optional breadcrumb items passed to AppBreadcrumbs if custom breadcrumbs element is omitted.
     */
    breadcrumbItems?: BreadcrumbItem[];
    /**
     * Optional header extra elements rendered on the right side of the breadcrumbs row (if any).
     */
    headerExtra?: React.ReactNode;
    /**
     * Form tabs displayed at the top of the form card.
     */
    tabs?: FormTabItem[];
    /**
     * ID of the active tab.
     */
    activeTab?: string;
    /**
     * Callback when a tab is clicked.
     */
    onTabChange?: (tabId: string) => void;
    /**
     * Main form fields content (active panel).
     */
    children: React.ReactNode;
    /**
     * Callback when Cancel button is clicked in the sticky footer.
     */
    onCancel: () => void;
    /**
     * Callback when Save button is clicked in the sticky footer.
     */
    onSave: () => void;
    /**
     * Whether form is currently submitting.
     */
    submitting?: boolean;
    /**
     * Text for the primary save button (e.g. "Save Contact", "Save Lead").
     */
    saveLabel?: string;
    /**
     * Text for the cancel button. Defaults to "Cancel".
     */
    cancelLabel?: string;
    /**
     * Optional toast notification element.
     */
    toast?: React.ReactNode;
    /**
     * Set to true to hide the sticky bottom action bar.
     */
    hideFooter?: boolean;
    /**
     * Disable default padding on the content wrapper (useful when child tab components provide their own internal padding).
     */
    disableContentPadding?: boolean;
    /**
     * Custom sx styling for outer page container.
     */
    sx?: SxProps<Theme>;
    /**
     * Custom sx styling for the Paper form card.
     */
    paperSx?: SxProps<Theme>;
    /**
     * Custom sx styling for the form content box inside Paper.
     */
    contentSx?: SxProps<Theme>;
}

/**
 * CommonFormLayout provides a standard, consistent page layout for all Create/Edit forms across the CRM:
 * 1. Line 1: Route-aware Breadcrumbs (no redundant discard button).
 * 2. Form Card: Clean Paper container with unified horizontal tabs bar.
 * 3. Card Body: Active form sections and fields.
 * 4. Bottom: Enterprise sticky action bar with local buffer status indicator, Cancel, and Save buttons.
 * 5. Toast: Standard enterprise notifications.
 */
export function CommonFormLayout({
    breadcrumbs,
    breadcrumbItems,
    headerExtra,
    tabs,
    activeTab,
    onTabChange,
    children,
    onCancel,
    onSave,
    submitting = false,
    saveLabel = 'Save Record',
    cancelLabel = 'Cancel',
    toast,
    hideFooter = false,
    disableContentPadding = false,
    sx,
    paperSx,
    contentSx,
}: CommonFormLayoutProps) {
    return (
        <Box sx={{ width: '100%', pb: 10, ...sx }}>
            {/* ── Line 1: Route-Aware Breadcrumbs ── */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2.5,
                    flexWrap: 'wrap',
                    gap: 2,
                }}
            >
                {breadcrumbs || <AppBreadcrumbs items={breadcrumbItems} />}
                {headerExtra}
            </Box>

            {/* ── Main Form Card ── */}
            <Paper
                elevation={0}
                sx={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    ...paperSx,
                }}
            >
                {/* ── Horizontal Navigation Tabs Bar ── */}
                {tabs && tabs.length > 0 && (
                    <Box
                        sx={{
                            backgroundColor: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            px: { xs: 2, md: 2.5 },
                            py: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            overflowX: 'auto',
                        }}
                    >
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;

                            return (
                                <Box
                                    key={tab.id}
                                    onClick={() => onTabChange?.(tab.id)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        px: 2,
                                        py: 0.9,
                                        borderRadius: '8px',
                                        cursor: onTabChange ? 'pointer' : 'default',
                                        userSelect: 'none',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s ease-in-out',
                                        backgroundColor: isActive ? '#ffffff' : 'transparent',
                                        border: isActive ? '1px solid #cbd5e1' : '1px solid transparent',
                                        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                        color: isActive ? '#1e3a8a' : '#64748b',
                                        fontWeight: isActive ? 700 : 500,
                                        fontSize: '0.84rem',
                                        '&:hover': {
                                            backgroundColor: isActive ? '#ffffff' : '#f1f5f9',
                                            color: isActive ? '#1e3a8a' : '#1e293b',
                                        },
                                    }}
                                >
                                    {tab.icon && (
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                color: isActive ? '#2563eb' : '#64748b',
                                            }}
                                        >
                                            {tab.icon}
                                        </Box>
                                    )}
                                    <Typography
                                        sx={{
                                            fontSize: '0.84rem',
                                            fontWeight: 'inherit',
                                            color: 'inherit',
                                        }}
                                    >
                                        {tab.label}
                                    </Typography>

                                    {tab.badge && (
                                        <Box
                                            sx={{
                                                px: 1,
                                                py: 0.2,
                                                borderRadius: '9999px',
                                                border: '1px solid #93c5fd',
                                                backgroundColor: '#eff6ff',
                                                color: '#2563eb',
                                                fontSize: '0.72rem',
                                                fontWeight: 600,
                                                lineHeight: 1.2,
                                            }}
                                        >
                                            {tab.badge}
                                        </Box>
                                    )}

                                    {tab.sublabel && (
                                        <Typography
                                            component="span"
                                            sx={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 400 }}
                                        >
                                            {tab.sublabel}
                                        </Typography>
                                    )}

                                    {tab.hasDot && (
                                        <Box
                                            sx={{
                                                width: 7,
                                                height: 7,
                                                borderRadius: '50%',
                                                backgroundColor: '#f97316',
                                                ml: 0.5,
                                            }}
                                        />
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                )}

                {/* ── Form Content Panels ── */}
                <Box
                    sx={{
                        p: disableContentPadding ? 0 : { xs: 2.5, md: 3.5 },
                        ...contentSx,
                    }}
                >
                    {children}
                </Box>
            </Paper>

            {/* ── Bottom Sticky Action Bar ── */}
            {!hideFooter && (
                <FormStickyFooter
                    onCancel={onCancel}
                    onSave={onSave}
                    submitting={submitting}
                    saveLabel={saveLabel}
                    cancelLabel={cancelLabel}
                />
            )}

            {/* ── Notifications Toast ── */}
            {toast}
        </Box>
    );
}

export { CommonFormLayout as CommonFormView };
