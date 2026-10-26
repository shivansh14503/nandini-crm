'use client';

import React, { useState, useEffect } from 'react';
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    Button,
    Tooltip,
    Tabs,
    Tab,
    Snackbar,
    Alert,
    CircularProgress,
} from '@mui/material';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { type EntityDetailDrawerProps, type DrawerTabItem, buildDrawerTabs } from './types';
import { AuditTrailTimeline } from './AuditTrailTimeline';
import { useDrawerStack } from './DrawerStackContext';

export function EntityDetailDrawer({
    open,
    onClose,
    title,
    subtitle,
    avatarText,
    avatarIcon,
    avatarBg = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    verified = true,
    loading = false,
    badges = [],
    headerActions,
    tabs = [],
    formTabs,
    tabContents,
    children,
    auditRevisions,
    includeChangesTab = true,
    changesTabLabel = 'Changes',
    defaultTabIndex = 0,
    statusText = 'Ready for Order Processing',
    primaryAction,
    secondaryAction,
    footerActions,
    width = { xs: '100%', sm: 540, md: 580 },
    hideBackdrop = false,
    onCollapseChange,
    isCollapsed: isCollapsedProp,
    onToggleCollapse: onToggleCollapseProp,
    showBookmark: showBookmarkProp,
}: EntityDetailDrawerProps) {
    const [currentTab, setCurrentTab] = useState<number>(defaultTabIndex);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [internalCollapsed, setInternalCollapsed] = useState<boolean>(false);
    const stack = useDrawerStack();

    // Precedence: explicit props > shared stack context > internal standalone state
    const isCollapsed = isCollapsedProp ?? stack?.isCollapsed ?? internalCollapsed;
    const showBookmark = showBookmarkProp ?? stack?.showBookmark ?? true;
    const onCollapseReset = stack?.onCollapseReset;

    useEffect(() => {
        if (open) {
            setInternalCollapsed(false);
            onCollapseReset?.();
            onCollapseChange?.(false);
        }
    }, [open, title, onCollapseChange, onCollapseReset]);

    const handleToggleCollapse = () => {
        if (onToggleCollapseProp) {
            onToggleCollapseProp();
            return;
        }
        if (stack) {
            stack.onToggleCollapse();
            return;
        }
        setInternalCollapsed((prev) => {
            const next = !prev;
            onCollapseChange?.(next);
            return next;
        });
    };

    const headerIconButtonSx = {
        width: 30,
        height: 30,
        color: '#475569',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        p: 0,
        transition: 'all 0.15s ease',
    } as const;

    const secondaryButtonSx = {
        fontSize: '0.82rem',
        textTransform: 'none',
        fontWeight: 600,
        color: '#334155',
        borderColor: '#cbd5e1',
        height: 36,
        px: 1.8,
        borderRadius: '8px',
        transition: 'all 0.15s ease',
        '&:hover': { borderColor: '#94a3b8', backgroundColor: '#f8fafc' },
        ...secondaryAction?.sx,
    } as const;

    const primaryButtonSx = {
        fontSize: '0.82rem',
        textTransform: 'none',
        fontWeight: 700,
        background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
        height: 36,
        px: 2.2,
        borderRadius: '8px',
        boxShadow: 'none',
        transition: 'all 0.15s ease',
        '&:hover': {
            background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
        },
        ...primaryAction?.sx,
    } as const;

    // Compute initials fallback if avatarText not given
    const getInitials = (str: string) => {
        if (!str) return 'REC';
        const parts = str.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return str.slice(0, 2).toUpperCase();
    };

    const displayAvatar = avatarText || getInitials(title);

    // Compile active tabs: caller tabs (or formTabs + tabContents) + standard Changes tab
    const resolvedBaseTabs: DrawerTabItem[] =
        formTabs && tabContents ? buildDrawerTabs(formTabs, tabContents) : tabs;

    const allTabs: DrawerTabItem[] = [...resolvedBaseTabs];
    if (includeChangesTab) {
        allTabs.push({
            id: 'changes-tab',
            label: changesTabLabel,
            icon: <HistoryOutlinedIcon sx={{ fontSize: 16 }} />,
            content: <AuditTrailTimeline revisions={auditRevisions} entityTitle={title} />,
        });
    }

    // Ensure valid currentTab index
    const activeTabIndex = Math.min(currentTab, Math.max(0, allTabs.length - 1));

    const effectiveHideBackdrop = hideBackdrop || isCollapsed;

    // Resolve responsive width objects to a concrete value for the bookmark's `right` offset
    const resolvedDrawerWidth =
        typeof width === 'number' || typeof width === 'string'
            ? width
            : (width?.md ?? width?.sm ?? 580);

    return (
        <>
            {open && showBookmark && (
                <Tooltip title={isCollapsed ? 'Expand Details' : 'Collapse Details'} placement="left" arrow>
                    <Box
                        onClick={handleToggleCollapse}
                        role="button"
                        aria-label={isCollapsed ? 'Expand Details' : 'Collapse Details'}
                        sx={{
                            position: 'fixed',
                            top: '45%',
                            right: isCollapsed ? 0 : resolvedDrawerWidth,
                            transform: 'translateY(-50%)',
                            zIndex: 1410,
                            width: 24,
                            height: 56,
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            borderRadius: '8px 0 0 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '-3px 0 10px rgba(0,0,0,0.15)',
                            transition: 'right 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s ease',
                            pointerEvents: 'auto',
                            '&:hover': {
                                backgroundColor: '#1e293b',
                            },
                        }}
                    >
                        {isCollapsed ? (
                            <ChevronLeftIcon sx={{ fontSize: 18 }} />
                        ) : (
                            <ChevronRightIcon sx={{ fontSize: 18 }} />
                        )}
                    </Box>
                </Tooltip>
            )}
            <Drawer
                anchor="right"
                open={open}
                onClose={onClose}
                hideBackdrop={effectiveHideBackdrop}
                slotProps={{
                    backdrop: {
                        sx: {
                            backgroundColor: effectiveHideBackdrop ? 'transparent' : 'rgba(15, 23, 42, 0.25)',
                            backdropFilter: effectiveHideBackdrop ? 'none' : 'blur(4px)',
                            WebkitBackdropFilter: effectiveHideBackdrop ? 'none' : 'blur(4px)',
                            ...(effectiveHideBackdrop && { pointerEvents: 'none' }),
                        },
                    },
                    paper: {
                        sx: {
                            width,
                            backgroundColor: '#ffffff',
                            borderLeft: '1px solid #e2e8f0',
                            boxShadow: isCollapsed ? 'none' : '-12px 0 40px rgba(15, 23, 42, 0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            transform: isCollapsed ? 'translateX(100%) !important' : 'translateX(0) !important',
                            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important',
                            visibility: 'visible !important',
                        },
                    },
                }}
            >
            {/* ── Top Header Section ────────────────────────────────────────────── */}
            <Box sx={{ p: 2.5, pb: 2, borderBottom: '1px solid #f1f5f9', backgroundColor: '#ffffff' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                    {/* Identity Banner */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                        <Box
                            sx={{
                                width: 48,
                                height: 48,
                                borderRadius: '10px',
                                background: avatarBg,
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '1.05rem',
                                letterSpacing: '0.02em',
                                flexShrink: 0,
                                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
                            }}
                        >
                            {avatarIcon || displayAvatar}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                <Typography
                                    noWrap
                                    sx={{
                                        fontSize: '1.15rem',
                                        fontWeight: 800,
                                        color: '#0f172a',
                                        letterSpacing: '-0.01em',
                                        lineHeight: 1.25,
                                    }}
                                >
                                    {title}
                                </Typography>
                                {verified && <VerifiedIcon sx={{ fontSize: 18, color: '#2563eb', flexShrink: 0 }} />}
                            </Box>
                            {subtitle && (
                                <Typography noWrap sx={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, mt: 0.3 }}>
                                    {subtitle}
                                </Typography>
                            )}
                        </Box>
                    </Box>

                    {/* Top Right Header Actions */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                        {headerActions?.onSync && (
                            <Tooltip title="Synchronize Data">
                                <IconButton
                                    size="small"
                                    onClick={headerActions.onSync}
                                    sx={{ ...headerIconButtonSx, '&:hover': { color: '#0284c7', backgroundColor: '#f0f9ff', borderColor: '#bae6fd' } }}
                                >
                                    <SyncOutlinedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        {headerActions?.onView && (
                            <Tooltip title="View Full Record">
                                <IconButton
                                    size="small"
                                    onClick={headerActions.onView}
                                    sx={{ ...headerIconButtonSx, '&:hover': { color: '#059669', backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' } }}
                                >
                                    <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        {headerActions?.custom}

                        <Tooltip title="Close Drawer">
                            <IconButton
                                size="small"
                                onClick={onClose}
                                sx={{ ...headerIconButtonSx, ml: 0.5, '&:hover': { color: '#dc2626', backgroundColor: '#fef2f2', borderColor: '#fecaca' } }}
                            >
                                <CloseIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Status Badges Row */}
                {badges.length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.8, mt: 1.8 }}>
                        {badges.map((b, idx) => (
                            <Box
                                key={idx}
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    backgroundColor: b.backgroundColor || '#f1f5f9',
                                    color: b.color || '#475569',
                                    border: `1px solid ${b.borderColor || '#e2e8f0'}`,
                                    px: 1.2,
                                    py: 0.35,
                                    borderRadius: '9999px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    fontFamily: b.isMonospace ? 'monospace' : 'inherit',
                                }}
                            >
                                {b.icon}
                                <span>{b.label}</span>
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            {/* ── Tabs Navigation Bar ───────────────────────────────────────── */}
            <Box sx={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', px: 0.5 }}>
                <Tabs
                    value={activeTabIndex}
                    onChange={(_, val) => setCurrentTab(val)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        minHeight: 44,
                        '& .MuiTabs-indicator': {
                            backgroundColor: '#2563eb',
                            height: 3,
                            borderRadius: '3px 3px 0 0',
                        },
                    }}
                >
                    {allTabs.map((tab, idx) => (
                        <Tab
                            key={tab.id || idx}
                            icon={tab.icon as React.ReactElement | string | undefined}
                            iconPosition="start"
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                                    <span>{tab.label}</span>
                                    {tab.badge && (
                                        typeof tab.badge === 'number' || typeof tab.badge === 'string' ? (
                                            <Box
                                                component="span"
                                                sx={{
                                                    fontSize: '0.64rem',
                                                    fontWeight: 700,
                                                    px: 0.6,
                                                    py: 0.1,
                                                    borderRadius: '10px',
                                                    backgroundColor: activeTabIndex === idx ? '#dbeafe' : '#e2e8f0',
                                                    color: activeTabIndex === idx ? '#1d4ed8' : '#64748b',
                                                }}
                                            >
                                                {tab.badge}
                                            </Box>
                                        ) : (
                                            tab.badge
                                        )
                                    )}
                                </Box>
                            }
                            sx={{
                                minHeight: 44,
                                fontSize: '0.8rem',
                                fontWeight: 600, // constant weight so switching tabs never shifts the layout
                                color: activeTabIndex === idx ? '#2563eb !important' : '#64748b',
                                transition: 'color 0.15s ease',
                                textTransform: 'none',
                                px: 1.5,
                                gap: 0.6,
                            }}
                        />
                    ))}
                </Tabs>
            </Box>

            {/* ── Scrollable Tab Content ───────────────────────────────────────── */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5, backgroundColor: '#ffffff' }}>
                {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
                        <CircularProgress size={28} sx={{ color: '#2563eb' }} />
                    </Box>
                ) : (
                    allTabs[activeTabIndex]?.content ?? children
                )}
            </Box>

            {/* ── Sticky Drawer Footer ────────────────────────────────────────── */}
            <Box
                sx={{
                    p: 2,
                    px: 2.5,
                    borderTop: '1px solid #f1f5f9',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                {/* Status Indicator */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: '#10b981',
                            boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.2)',
                        }}
                    />
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                        {statusText}
                    </Typography>
                </Box>

                {/* Right Action Buttons */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {footerActions}

                    {secondaryAction && (
                        secondaryAction.tooltip ? (
                            <Tooltip title={secondaryAction.tooltip}>
                                <span>
                                    <Button
                                        variant={secondaryAction.variant || 'outlined'}
                                        size="small"
                                        startIcon={secondaryAction.icon}
                                        onClick={secondaryAction.onClick}
                                        disabled={secondaryAction.disabled}
                                        sx={secondaryButtonSx}
                                    >
                                        {secondaryAction.label}
                                    </Button>
                                </span>
                            </Tooltip>
                        ) : (
                            <Button
                                variant={secondaryAction.variant || 'outlined'}
                                size="small"
                                startIcon={secondaryAction.icon}
                                onClick={secondaryAction.onClick}
                                disabled={secondaryAction.disabled}
                                sx={secondaryButtonSx}
                            >
                                {secondaryAction.label}
                            </Button>
                        )
                    )}

                    {(primaryAction || headerActions?.onEdit) && (
                        primaryAction?.tooltip ? (
                            <Tooltip title={primaryAction.tooltip}>
                                <span>
                                    <Button
                                        variant={primaryAction?.variant || 'contained'}
                                        size="small"
                                        startIcon={primaryAction?.icon || <EditOutlinedIcon sx={{ fontSize: 16 }} />}
                                        onClick={primaryAction?.onClick || headerActions?.onEdit}
                                        disabled={primaryAction?.disabled}
                                        sx={primaryButtonSx}
                                    >
                                        {primaryAction?.label || 'Edit Details'}
                                    </Button>
                                </span>
                            </Tooltip>
                        ) : (
                            <Button
                                variant={primaryAction?.variant || 'contained'}
                                size="small"
                                startIcon={primaryAction?.icon || <EditOutlinedIcon sx={{ fontSize: 16 }} />}
                                onClick={primaryAction?.onClick || headerActions?.onEdit}
                                disabled={primaryAction?.disabled}
                                sx={primaryButtonSx}
                            >
                                {primaryAction?.label || 'Edit Details'}
                            </Button>
                        )
                    )}
                </Box>
            </Box>

            {/* Notification Toast */}
            <Snackbar
                open={Boolean(toastMessage)}
                autoHideDuration={2500}
                onClose={() => setToastMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity="info" sx={{ fontSize: '0.78rem', py: 0.5 }}>
                    {toastMessage}
                </Alert>
            </Snackbar>
        </Drawer>
        </>
    );
}
