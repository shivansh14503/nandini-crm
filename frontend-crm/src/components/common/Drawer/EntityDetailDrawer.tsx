'use client';

import React, { useState, useEffect } from 'react';
import {
    Drawer,
    useMediaQuery,
    useTheme,
    Box,
    Typography,
    IconButton,
    Button,
    Tooltip,
    Tabs,
    Tab,
    Snackbar,
    Alert,
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
import { FormFieldsSkeleton } from '../skeletons';
import { useDrawerStack } from './DrawerStackContext';
import { RecordAuditFooter } from './RecordAuditFooter';
import { DoubleClickCopyText } from '../useDoubleClickCopy';
import { getModuleColor } from '@/theme/moduleColors';
import { glassSurfaceSx, GLASS_SHADOW, GLASS_RADIUS, FLOAT_INSET } from '@/theme/glass';
import { useRegisterRightPanel } from '@/components/layout/rightPanelStore';

const CHANGES_TAB_ID = 'changes-tab';

interface ExpandingActionButtonProps {
    label: React.ReactNode;
    icon?: React.ReactNode;
    tooltip?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant: 'text' | 'outlined' | 'contained';
    sx?: object;
}

/** Round icon button that grows to its full width (icon + label) on hover or keyboard focus. */
function ExpandingActionButton({ label, icon, tooltip, onClick, disabled, variant, sx }: ExpandingActionButtonProps) {
    const button = (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                '&:hover .expand-label, &:focus-within .expand-label': { maxWidth: 240, ml: 1, opacity: 1 },
                '&:hover .expand-btn, &:focus-within .expand-btn': { px: 2 },
            }}
        >
            <Button
                className="expand-btn"
                variant={variant}
                size="small"
                aria-label={typeof label === 'string' ? label : undefined}
                onClick={onClick}
                disabled={disabled}
                sx={{
                    ...sx,
                    minWidth: 44,
                    height: 44,
                    px: 0,
                    borderRadius: '22px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    boxShadow: '0 4px 14px rgb(0 0 0 / 0.16)',
                    ...(variant === 'outlined' ? { backgroundColor: 'var(--mui-palette-background-paper)' } : {}),
                    transition: 'all 0.2s ease',
                    '& .MuiButton-startIcon': { m: 0, display: 'inline-flex' },
                }}
            >
                {icon}
                <Box
                    component="span"
                    className="expand-label"
                    sx={{
                        display: 'inline-block',
                        maxWidth: 0,
                        opacity: 0,
                        overflow: 'hidden',
                        transition: 'max-width 0.2s ease, margin 0.2s ease, opacity 0.15s ease',
                    }}
                >
                    {label}
                </Box>
            </Button>
        </Box>
    );
    return tooltip ? <Tooltip title={tooltip}>{button}</Tooltip> : button;
}

export function EntityDetailDrawer({
    open,
    onClose,
    title,
    subtitle,
    avatarText,
    avatarIcon,
    avatarBg = 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    verified = true,
    loading = false,
    badges = [],
    headerActions,
    tabs = [],
    formTabs,
    tabContents,
    children,
    auditEntity,
    recordAudit,
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
    persistent: persistentProp,
    module,
}: EntityDetailDrawerProps) {
    const moduleColor = module ? getModuleColor(module) : undefined;
    const [currentTab, setCurrentTab] = useState<number>(defaultTabIndex);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [internalCollapsed, setInternalCollapsed] = useState<boolean>(false);
    const stack = useDrawerStack();

    // Precedence: explicit props > shared stack context > internal standalone state
    const isCollapsed = isCollapsedProp ?? stack?.isCollapsed ?? internalCollapsed;
    const showBookmark = showBookmarkProp ?? stack?.showBookmark ?? true;
    const onCollapseReset = stack?.onCollapseReset;
    const stackPersistent = Boolean(stack?.persistent);
    const persistent = persistentProp ?? stackPersistent;

    // Opening the drawer (or switching records) expands it: local state resets during render, shared state below.
    const openKey = open ? title : null;
    const [lastOpenKey, setLastOpenKey] = useState(openKey);
    if (openKey !== lastOpenKey) {
        setLastOpenKey(openKey);
        if (open) setInternalCollapsed(false);
    }

    useEffect(() => {
        if (open) {
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
        width: 34,
        height: 34,
        color: 'var(--crm-slate-600)',
        border: '1px solid var(--mui-palette-border-main)',
        borderRadius: '8px',
        p: 0,
        transition: 'all 0.15s ease',
    } as const;

    /** Header action tinted in its own color at rest (soft fill + border); hover deepens the tint. */
    const tintedHeaderIconButtonSx = (tone: 'info' | 'success' | 'error', color = `var(--mui-palette-${tone}-main)`) => ({
        ...headerIconButtonSx,
        color,
        backgroundColor: `var(--mui-palette-${tone}-soft)`,
        borderColor: `var(--mui-palette-${tone}-softBorder)`,
        '&:hover': {
            color,
            backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
            borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        },
    });

    const secondaryButtonSx = {
        fontSize: '0.82rem',
        textTransform: 'none',
        fontWeight: 600,
        color: 'var(--crm-slate-700)',
        borderColor: 'var(--mui-palette-border-strong)',
        height: 36,
        px: 1.8,
        borderRadius: '8px',
        transition: 'all 0.15s ease',
        '&:hover': {
            borderColor: 'var(--crm-blue-300)',
            backgroundColor: 'var(--mui-palette-primary-soft)',
            color: 'var(--crm-text-blue-700)',
        },
        ...secondaryAction?.sx,
    } as const;

    const primaryButtonSx = {
        fontSize: '0.82rem',
        textTransform: 'none',
        fontWeight: 700,
        background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
        height: 36,
        px: 2.2,
        borderRadius: '8px',
        boxShadow: 'none',
        transition: 'all 0.15s ease',
        '&:hover': {
            background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
            boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.35)',
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
    if (includeChangesTab && auditEntity) {
        allTabs.push({
            id: CHANGES_TAB_ID,
            label: changesTabLabel,
            icon: <HistoryOutlinedIcon sx={{ fontSize: 16 }} />,
            content: <AuditTrailTimeline entityType={auditEntity.type} entityId={auditEntity.id} />,
        });
    }

    // Ensure valid currentTab index
    const activeTabIndex = Math.min(currentTab, Math.max(0, allTabs.length - 1));
    // Created At / Last Modified stamps belong to the overview tab only (the first tab when none is named 'overview').
    const overviewTabIndex = Math.max(0, allTabs.findIndex((t) => t.id === 'overview'));

    const effectiveHideBackdrop = hideBackdrop || isCollapsed;

    // Resolve responsive width objects to a concrete value for the bookmark's `right` offset
    const resolvedDrawerWidth =
        typeof width === 'number' || typeof width === 'string'
            ? width
            : (width?.md ?? width?.sm ?? 580);
    const drawerWidthCss = typeof resolvedDrawerWidth === 'number' ? `${resolvedDrawerWidth}px` : resolvedDrawerWidth;

    // On wide screens the drawer docks beside the page: tell the floating navbar so it ends short of it.
    const theme = useTheme();
    const isWide = useMediaQuery(theme.breakpoints.up('lg'));
    useRegisterRightPanel(
        open && !isCollapsed && isWide,
        typeof resolvedDrawerWidth === 'number' ? resolvedDrawerWidth : 580
    );

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
                            right: isCollapsed ? 0 : `calc(${drawerWidthCss} + ${FLOAT_INSET}px)`,
                            transform: 'translateY(-50%)',
                            zIndex: 1410,
                            width: 24,
                            height: 56,
                            backgroundColor: 'var(--crm-fill-blue-600)',
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
                                backgroundColor: 'var(--crm-fill-blue-700)',
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
                variant={persistent ? 'persistent' : 'temporary'}
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
                            // Floating glass panel inset from the viewport edges, matching the navbar and dock.
                            ...glassSurfaceSx,
                            // Denser than the navbar's glass: this panel is mostly text read over a busy table.
                            backgroundColor: 'color-mix(in srgb, var(--mui-palette-background-paper) 88%, transparent)',
                            top: FLOAT_INSET,
                            right: FLOAT_INSET,
                            height: `calc(100% - ${FLOAT_INSET * 2}px)`,
                            maxWidth: `calc(100% - ${FLOAT_INSET * 2}px)`,
                            borderRadius: GLASS_RADIUS,
                            // Above the related modules sidebar (1300) and module table (1290), below the bookmark.
                            ...(stackPersistent && { zIndex: 1310 }),
                            boxShadow: isCollapsed ? 'none' : GLASS_SHADOW,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            transform: isCollapsed
                                ? `translateX(calc(100% + ${FLOAT_INSET * 2}px)) !important`
                                : 'translateX(0) !important',
                            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important',
                            visibility: 'visible !important',
                        },
                    },
                }}
            >
            {/* ── Top Header Section ────────────────────────────────────────────── */}
            <Box
                sx={{
                    p: 2.5,
                    pb: 2,
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                    backgroundColor: 'transparent',
                    // Module identity: a colored top edge fading into a faint tint (then the panel's glass).
                    ...(moduleColor && {
                        borderTop: `3px solid ${moduleColor.main}`,
                        background: `linear-gradient(180deg, ${moduleColor.soft} 0%, transparent 100%)`,
                    }),
                }}
            >
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
                                boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
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
                                        color: 'var(--crm-slate-900)',
                                        letterSpacing: '-0.01em',
                                        lineHeight: 1.25,
                                    }}
                                >
                                    <DoubleClickCopyText>{title}</DoubleClickCopyText>
                                </Typography>
                                {verified && <VerifiedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)', flexShrink: 0 }} />}
                            </Box>
                            {subtitle && (
                                <Typography noWrap sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 500, mt: 0.3 }}>
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
                                    sx={tintedHeaderIconButtonSx('info')}
                                >
                                    <SyncOutlinedIcon sx={{ fontSize: 20 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        {headerActions?.onView && (
                            <Tooltip title="View Full Record">
                                <IconButton
                                    size="small"
                                    onClick={headerActions.onView}
                                    sx={tintedHeaderIconButtonSx('success', 'var(--crm-emerald-600)')}
                                >
                                    <VisibilityOutlinedIcon sx={{ fontSize: 20 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        {headerActions?.custom}

                        <Tooltip title="Close Drawer">
                            <IconButton
                                size="small"
                                onClick={onClose}
                                sx={{ ...tintedHeaderIconButtonSx('error'), ml: 0.5 }}
                            >
                                <CloseIcon sx={{ fontSize: 20 }} />
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
                                    backgroundColor: b.backgroundColor || 'var(--mui-palette-background-hover)',
                                    color: b.color || 'var(--crm-slate-600)',
                                    border: `1px solid ${b.borderColor || 'var(--mui-palette-border-main)'}`,
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
            <Box sx={{ borderBottom: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)', px: 0.5 }}>
                <Tabs
                    value={activeTabIndex}
                    onChange={(_, val) => setCurrentTab(val)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        minHeight: 44,
                        '& .MuiTabs-indicator': {
                            backgroundColor: 'var(--mui-palette-primary-main)',
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
                                                    backgroundColor: activeTabIndex === idx ? 'var(--crm-blue-100)' : 'var(--crm-slate-200)',
                                                    color: activeTabIndex === idx ? 'var(--crm-text-blue-700)' : 'var(--mui-palette-text-secondary)',
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
                                color: activeTabIndex === idx ? 'var(--crm-text-blue-600) !important' : 'var(--mui-palette-text-secondary)',
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
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5, pb: 10, backgroundColor: 'transparent' }}>
                {loading ? (
                    <FormFieldsSkeleton fields={10} columns={2} sx={{ pt: 0.5 }} />
                ) : (
                    <>
                        {allTabs[activeTabIndex]?.content ?? children}
                        {recordAudit && activeTabIndex === overviewTabIndex && allTabs[activeTabIndex]?.id !== CHANGES_TAB_ID && (
                            <RecordAuditFooter audit={recordAudit} />
                        )}
                    </>
                )}
            </Box>

            {/* ── Floating action buttons (round; expand to show label on hover) ── */}
            {(footerActions || secondaryAction || primaryAction || headerActions?.onEdit) && (
                <Box
                    sx={{
                        position: 'absolute',
                        right: 20,
                        bottom: 20,
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        pointerEvents: 'none',
                        '& > *': { pointerEvents: 'auto' },
                    }}
                >
                    {footerActions}

                    {secondaryAction && (
                        <ExpandingActionButton
                            label={secondaryAction.label}
                            icon={secondaryAction.icon}
                            tooltip={secondaryAction.tooltip}
                            onClick={secondaryAction.onClick}
                            disabled={secondaryAction.disabled}
                            variant={secondaryAction.variant || 'outlined'}
                            sx={secondaryButtonSx}
                        />
                    )}

                    {(primaryAction || headerActions?.onEdit) && (
                        <ExpandingActionButton
                            label={primaryAction?.label || 'Edit Details'}
                            icon={primaryAction?.icon || <EditOutlinedIcon sx={{ fontSize: 18 }} />}
                            tooltip={primaryAction?.tooltip}
                            onClick={primaryAction?.onClick || headerActions?.onEdit}
                            disabled={primaryAction?.disabled}
                            variant={primaryAction?.variant || 'contained'}
                            sx={primaryButtonSx}
                        />
                    )}
                </Box>
            )}

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
