'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
    Drawer,
    Box,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Badge,
    Chip,
    Tooltip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';

export interface RelatedModuleItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    count: number;
    onClick?: () => void;
}

export interface RelatedModulesSidebarProps {
    open: boolean;
    logoSrc?: string; // Path to the company logo image
    title?: string;
    subtitle?: string;
    modules: RelatedModuleItem[];
    activeModuleId?: string;
    onModuleSelect?: (moduleId: string) => void;
    collapsed?: boolean;
    onToggleCollapse?: (collapsed: boolean) => void;
}

export function RelatedModulesSidebar({
    open,
    logoSrc = '/images/NIPL-Updated-Logo-Large.png',
    modules,
    activeModuleId,
    onModuleSelect,
    collapsed,
    onToggleCollapse,
}: RelatedModulesSidebarProps) {
    const [internalCollapsed, setInternalCollapsed] = useState(false);
    const isCollapsed = collapsed ?? internalCollapsed;

    const handleToggleCollapse = () => {
        const next = !isCollapsed;
        setInternalCollapsed(next);
        onToggleCollapse?.(next);
    };

    return (
        <Drawer
            anchor="left"
            open={open}
            variant="persistent"
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                height: '100vh',
                zIndex: 1300,
                width: isCollapsed ? 72 : 260,
                transition: 'width 0.2s ease',
                flexShrink: 0,
                pointerEvents: open ? 'auto' : 'none',
                '& .MuiDrawer-paper': {
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    height: '100vh',
                    zIndex: 1300,
                    width: isCollapsed ? 72 : 260,
                    transition: 'width 0.2s ease, transform 225ms cubic-bezier(0, 0, 0.2, 1) 0ms',
                    borderRight: '1px solid var(--mui-palette-border-main)',
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    overflowX: 'hidden',
                    boxShadow: '8px 0 32px rgba(15, 23, 42, 0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    boxSizing: 'border-box',
                },
            }}
        >
            {/* ── Header Section (Height ~64px, flexbox) ─────────────────────── */}
            <Box
                sx={{
                    height: 64,
                    minHeight: 64,
                    px: isCollapsed ? 1 : 2,
                    borderBottom: '1px solid var(--mui-palette-border-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    gap: 1,
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    flexShrink: 0,
                }}
            >
                {!isCollapsed && (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            minWidth: 0,
                            userSelect: 'none',
                        }}
                    >
                        <Image
                            src={logoSrc}
                            alt="Nandini CRM Logo"
                            width={120}
                            height={32}
                            style={{ objectFit: 'contain' }}
                        />
                    </Box>
                )}

                <IconButton
                    size="small"
                    onClick={handleToggleCollapse}
                    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    sx={{
                        color: 'var(--crm-slate-600)',
                        borderRadius: '8px',
                        p: 0.75,
                        '&:hover': {
                            backgroundColor: 'var(--mui-palette-background-hover)',
                            color: 'var(--crm-slate-900)',
                        },
                    }}
                >
                    <MenuIcon sx={{ fontSize: 20 }} />
                </IconButton>
            </Box>

            {/* ── List Section ───────────────────────────────────────────────── */}
            <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1.25, px: 1 }}>
                <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                    {modules.map((item) => {
                        const isActive = item.id === activeModuleId;
                        const hasCount = item.count > 0;

                        const buttonContent = (
                            <ListItemButton
                                onClick={() => {
                                    item.onClick?.();
                                    onModuleSelect?.(item.id);
                                }}
                                selected={isActive}
                                sx={{
                                    borderRadius: '8px',
                                    minHeight: 40,
                                    px: isCollapsed ? 0 : 1.25,
                                    py: 0.85,
                                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                                    backgroundColor: isActive ? 'var(--mui-palette-primary-soft) !important' : 'transparent',
                                    color: isActive ? 'var(--crm-text-blue-700)' : 'var(--crm-slate-700)',
                                    transition: 'background-color 0.15s ease, color 0.15s ease',
                                    '&:hover': {
                                        backgroundColor: isActive ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-subtle)',
                                        color: isActive ? 'var(--crm-blue-700)' : 'var(--crm-slate-900)',
                                    },
                                }}
                            >
                                <ListItemIcon
                                    sx={{
                                        minWidth: isCollapsed ? 'auto' : 32,
                                        mr: isCollapsed ? 0 : 0.5,
                                        color: isActive ? 'var(--crm-text-blue-700)' : 'var(--mui-palette-text-secondary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        '& svg': {
                                            fontSize: 19,
                                        },
                                    }}
                                >
                                    {isCollapsed && hasCount ? (
                                        <Badge
                                            badgeContent={item.count}
                                            color="primary"
                                            max={999}
                                            sx={{
                                                '& .MuiBadge-badge': {
                                                    fontSize: '0.6rem',
                                                    fontWeight: 700,
                                                    height: 16,
                                                    minWidth: 16,
                                                    px: 0.4,
                                                    backgroundColor: 'var(--mui-palette-primary-main)',
                                                },
                                            }}
                                        >
                                            {item.icon}
                                        </Badge>
                                    ) : (
                                        item.icon
                                    )}
                                </ListItemIcon>

                                {!isCollapsed && (
                                    <>
                                        <ListItemText
                                            primary={item.label}
                                            slotProps={{
                                                primary: {
                                                    noWrap: true,
                                                    sx: {
                                                        fontSize: '0.8rem',
                                                        fontWeight: isActive ? 700 : 600,
                                                        color: isActive ? 'var(--crm-text-blue-700)' : 'var(--crm-slate-700)',
                                                    },
                                                },
                                            }}
                                        />

                                        <Chip
                                            label={item.count}
                                            size="small"
                                            sx={{
                                                height: 20,
                                                minWidth: 26,
                                                fontSize: '0.68rem',
                                                fontWeight: 700,
                                                borderRadius: '6px',
                                                ml: 1,
                                                backgroundColor: isActive
                                                    ? 'var(--crm-blue-100)'
                                                    : hasCount
                                                      ? 'var(--mui-palette-primary-soft)'
                                                      : 'var(--mui-palette-background-hover)',
                                                color: isActive
                                                    ? 'var(--crm-text-blue-700)'
                                                    : hasCount
                                                      ? 'var(--crm-text-blue-600)'
                                                      : 'var(--mui-palette-text-secondary)',
                                                border: isActive
                                                    ? '1px solid var(--crm-blue-300)'
                                                    : hasCount
                                                      ? '1px solid var(--mui-palette-primary-softBorder)'
                                                      : '1px solid var(--mui-palette-border-main)',
                                                '& .MuiChip-label': {
                                                    px: 0.75,
                                                },
                                            }}
                                        />
                                    </>
                                )}
                            </ListItemButton>
                        );

                        return (
                            <ListItem key={item.id} disablePadding>
                                {isCollapsed ? (
                                    <Tooltip title={`${item.label} (${item.count})`} placement="right" arrow>
                                        {buttonContent}
                                    </Tooltip>
                                ) : (
                                    buttonContent
                                )}
                            </ListItem>
                        );
                    })}
                </List>
            </Box>
        </Drawer>
    );
}
