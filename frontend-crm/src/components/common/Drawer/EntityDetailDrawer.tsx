'use client';

import React, { useState } from 'react';
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
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';

import { type EntityDetailDrawerProps, type DrawerTabItem, buildDrawerTabs } from './types';
import { AuditTrailTimeline } from './AuditTrailTimeline';

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
}: EntityDetailDrawerProps) {
    const [currentTab, setCurrentTab] = useState<number>(defaultTabIndex);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

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

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            slotProps={{
                backdrop: {
                    sx: {
                        backgroundColor: 'rgba(15, 23, 42, 0.25)',
                        backdropFilter: 'blur(3px)',
                        WebkitBackdropFilter: 'blur(3px)',
                    },
                },
                paper: {
                    sx: {
                        width,
                        backgroundColor: '#ffffff',
                        borderLeft: '1px solid #e2e8f0',
                        boxShadow: '-8px 0 32px rgba(15, 23, 42, 0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
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
                                width: 44,
                                height: 44,
                                borderRadius: '8px',
                                background: avatarBg,
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '1.05rem',
                                letterSpacing: '0.02em',
                                flexShrink: 0,
                                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.28)',
                            }}
                        >
                            {avatarIcon || displayAvatar}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                <Typography
                                    noWrap
                                    sx={{
                                        fontSize: '1.08rem',
                                        fontWeight: 800,
                                        color: '#0f172a',
                                        lineHeight: 1.25,
                                    }}
                                >
                                    {title}
                                </Typography>
                                {verified && <VerifiedIcon sx={{ fontSize: 18, color: '#2563eb', flexShrink: 0 }} />}
                            </Box>
                            {subtitle && (
                                <Typography noWrap sx={{ fontSize: '0.78rem', color: '#64748b', mt: 0.3 }}>
                                    {subtitle}
                                </Typography>
                            )}
                        </Box>
                    </Box>

                    {/* Top Right Header Actions */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                        {headerActions?.onEdit && (
                            <Tooltip title="Edit Record">
                                <IconButton
                                    size="small"
                                    onClick={headerActions.onEdit}
                                    sx={{
                                        color: '#475569',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        p: 0.6,
                                        '&:hover': { color: '#1d4ed8', backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
                                    }}
                                >
                                    <EditOutlinedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        {headerActions?.onSync && (
                            <Tooltip title="Synchronize Data">
                                <IconButton
                                    size="small"
                                    onClick={headerActions.onSync}
                                    sx={{
                                        color: '#475569',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        p: 0.6,
                                        '&:hover': { color: '#0284c7', backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
                                    }}
                                >
                                    <SyncOutlinedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        {headerActions?.onPhone && (
                            <Tooltip title="Direct Call">
                                <IconButton
                                    size="small"
                                    onClick={headerActions.onPhone}
                                    sx={{
                                        color: '#475569',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        p: 0.6,
                                        '&:hover': { color: '#15803d', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
                                    }}
                                >
                                    <PhoneOutlinedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        {headerActions?.custom}

                        <Tooltip title="Close Drawer">
                            <IconButton
                                size="small"
                                onClick={onClose}
                                sx={{
                                    color: '#64748b',
                                    borderRadius: '6px',
                                    p: 0.6,
                                    ml: 0.5,
                                    '&:hover': { color: '#0f172a', backgroundColor: '#f1f5f9' },
                                }}
                            >
                                <CloseIcon sx={{ fontSize: 18 }} />
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
                                    px: 0.9,
                                    py: 0.25,
                                    borderRadius: '6px',
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
            <Box sx={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa', px: 0.5 }}>
                <Tabs
                    value={activeTabIndex}
                    onChange={(_, val) => setCurrentTab(val)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        minHeight: 44,
                        '& .MuiTabs-indicator': {
                            backgroundColor: '#1d4ed8',
                            height: 2.5,
                            borderRadius: '2px',
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
                                fontSize: '0.78rem',
                                fontWeight: activeTabIndex === idx ? 700 : 500,
                                color: activeTabIndex === idx ? '#1d4ed8 !important' : '#64748b',
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
                    borderTop: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                {/* Status Indicator */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: '#10b981',
                            boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.2)',
                        }}
                    />
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>
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
                                        sx={{
                                            fontSize: '0.78rem',
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            color: '#334155',
                                            borderColor: '#cbd5e1',
                                            height: 36,
                                            px: 1.5,
                                            borderRadius: '6px',
                                            '&:hover': { borderColor: '#94a3b8', backgroundColor: '#f8fafc' },
                                            ...secondaryAction.sx,
                                        }}
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
                                sx={{
                                    fontSize: '0.78rem',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    color: '#334155',
                                    borderColor: '#cbd5e1',
                                    height: 36,
                                    px: 1.5,
                                    borderRadius: '6px',
                                    '&:hover': { borderColor: '#94a3b8', backgroundColor: '#f8fafc' },
                                    ...secondaryAction.sx,
                                }}
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
                                        sx={{
                                            fontSize: '0.78rem',
                                            textTransform: 'none',
                                            fontWeight: 700,
                                            backgroundColor: '#1d4ed8',
                                            height: 36,
                                            px: 2,
                                            borderRadius: '6px',
                                            boxShadow: 'none',
                                            '&:hover': { backgroundColor: '#1e40af' },
                                            ...primaryAction?.sx,
                                        }}
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
                                sx={{
                                    fontSize: '0.78rem',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    backgroundColor: '#1d4ed8',
                                    height: 36,
                                    px: 2,
                                    borderRadius: '6px',
                                    boxShadow: 'none',
                                    '&:hover': { backgroundColor: '#1e40af' },
                                    ...primaryAction?.sx,
                                }}
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
    );
}
