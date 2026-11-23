'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    Avatar,
    Box,
    Button,
    Collapse,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LogoutIcon from '@mui/icons-material/Logout';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import { glassSurfaceSx, GLASS_RADIUS, GLASS_SHADOW, FLOAT_INSET } from '@/theme/glass';
import { moduleForPath } from '@/theme/moduleColors';
import { APP_CONFIG, ROUTES } from '@/config/constants';
import { ModuleDot, type NavGroup } from './navItems';
import { ThemeModeToggle } from './ThemeModeToggle';

const isOnRoute = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The item for the current page: the first one whose route the page is on (several placeholders share /dashboard). */
function activeHrefKey(groups: readonly NavGroup[], path: string): string | null {
    for (const group of groups) {
        for (const item of group.items) {
            if (isOnRoute(path, item.href)) return `${group.label}:${item.label}`;
        }
    }
    return null;
}

const rowSx = {
    borderRadius: '10px',
    minHeight: 40,
    px: 1.5,
    gap: 1.25,
    fontSize: '0.86rem',
    fontWeight: 500,
    color: 'var(--crm-slate-700)',
    transition: 'background-color 0.15s ease, color 0.15s ease',
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
    '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
} as const;

export interface MobileNavDrawerProps {
    open: boolean;
    onClose: () => void;
    groups: readonly NavGroup[];
    /** Path of the page the menu was opened on; its item is highlighted and its group starts expanded. */
    currentPath: string;
    user: { username: string; role: string } | null;
    onLogout: () => void;
}

/**
 * Phone / tablet navigation: the navbar pills don't fit below `lg`, so the menu button opens this panel with the
 * same groups (collapsible), the admin link, the light/dark switch (hidden from the bar on phones) and Sign Out.
 */
export function MobileNavDrawer({ open, onClose, groups, currentPath, user, onLogout }: MobileNavDrawerProps) {
    const activeKey = activeHrefKey(groups, currentPath);
    const activeGroup = activeKey?.split(':')[0] ?? 'Sales';
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set([activeGroup]));

    // Each time the menu opens on another page, start with that page's group expanded (reset during render).
    const [lastPath, setLastPath] = useState(currentPath);
    if (currentPath !== lastPath) {
        setLastPath(currentPath);
        setExpanded(new Set([activeGroup]));
    }

    const toggleGroup = (label: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });

    return (
        <Drawer
            anchor="left"
            open={open}
            onClose={onClose}
            slotProps={{
                backdrop: {
                    sx: {
                        backgroundColor: 'rgba(15, 23, 42, 0.25)',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                    },
                },
                paper: {
                    'aria-label': 'Main menu',
                    sx: {
                        ...glassSurfaceSx,
                        backgroundColor: 'color-mix(in srgb, var(--mui-palette-background-paper) 94%, transparent)',
                        width: 300,
                        maxWidth: `calc(100% - ${FLOAT_INSET * 2}px)`,
                        top: FLOAT_INSET,
                        left: FLOAT_INSET,
                        height: `calc(100% - ${FLOAT_INSET * 2}px)`,
                        borderRadius: GLASS_RADIUS,
                        boxShadow: GLASS_SHADOW,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    },
                },
            }}
        >
            {/* Header: logo + close */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, py: 1.5 }}>
                <Box
                    component={Link}
                    href={ROUTES.DASHBOARD}
                    onClick={onClose}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.2, textDecoration: 'none', minWidth: 0 }}
                >
                    <Image
                        src="/images/NIPL-Updated-Logo-Large.png"
                        alt={APP_CONFIG.logoAlt}
                        width={32}
                        height={32}
                        style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '6px' }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--crm-slate-900)', lineHeight: 1.15 }}>
                            {APP_CONFIG.companyName}
                        </Typography>
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: 'var(--mui-palette-text-secondary)',
                                lineHeight: 1.2,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                            }}
                        >
                            Enterprise CRM
                        </Typography>
                    </Box>
                </Box>
                <IconButton
                    onClick={onClose}
                    aria-label="Close menu"
                    size="small"
                    sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '8px',
                        border: '1px solid var(--mui-palette-border-main)',
                        color: 'var(--mui-palette-text-secondary)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                            borderColor: 'var(--crm-blue-300)',
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            color: 'var(--crm-text-blue-700)',
                        },
                    }}
                >
                    <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Box>

            {/* Signed-in user */}
            {user && (
                <Box
                    sx={{
                        mx: 1.5,
                        mb: 1,
                        px: 1.5,
                        py: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        borderRadius: '12px',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                        border: '1px solid var(--mui-palette-border-light)',
                    }}
                >
                    <Avatar
                        sx={{
                            width: 34,
                            height: 34,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#ffffff',
                            background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                        }}
                    >
                        {user.username.slice(0, 2).toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)', lineHeight: 1.2 }}>
                            {user.username}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.3 }}>
                            {user.role}
                        </Typography>
                    </Box>
                </Box>
            )}

            {/* Navigation groups */}
            <Box component="nav" aria-label="Main" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, pb: 1 }}>
                <List disablePadding>
                    {groups.map((group) => {
                        const isOpen = expanded.has(group.label);
                        const hasModuleItems = group.items.some((item) => moduleForPath(item.href));
                        return (
                            <Box component="li" key={group.label} sx={{ listStyle: 'none' }}>
                                <ListItemButton
                                    onClick={() => toggleGroup(group.label)}
                                    aria-expanded={isOpen}
                                    sx={{
                                        ...rowSx,
                                        mt: 0.5,
                                        fontWeight: 700,
                                        color: isOpen ? 'var(--crm-slate-900)' : 'var(--crm-slate-700)',
                                    }}
                                >
                                    <Box component="span" sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {group.label}
                                    </Box>
                                    <ExpandMoreIcon
                                        sx={{
                                            fontSize: 18,
                                            color: 'var(--mui-palette-text-muted)',
                                            transition: 'transform 0.2s',
                                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                        }}
                                    />
                                </ListItemButton>
                                <Collapse in={isOpen} timeout={180} unmountOnExit>
                                    <List disablePadding sx={{ pl: 1, pb: 0.5 }}>
                                        {group.items.map((item) => {
                                            const active = activeKey === `${group.label}:${item.label}`;
                                            return (
                                                <ListItemButton
                                                    key={item.label}
                                                    component={Link}
                                                    href={item.href}
                                                    onClick={onClose}
                                                    selected={active}
                                                    aria-current={active ? 'page' : undefined}
                                                    sx={{
                                                        ...rowSx,
                                                        minHeight: 38,
                                                        ...(active && {
                                                            color: 'var(--crm-text-blue-900)',
                                                            fontWeight: 700,
                                                            backgroundColor: 'var(--mui-palette-primary-soft) !important',
                                                            boxShadow: 'inset 0 0 0 1px var(--mui-palette-primary-softBorder)',
                                                        }),
                                                    }}
                                                >
                                                    {hasModuleItems && <ModuleDot href={item.href} />}
                                                    {item.label}
                                                </ListItemButton>
                                            );
                                        })}
                                    </List>
                                </Collapse>
                            </Box>
                        );
                    })}
                </List>

                <Divider sx={{ my: 1, borderColor: 'var(--mui-palette-border-light)' }} />

                <ListItemButton component={Link} href={ROUTES.ADMIN} onClick={onClose} sx={rowSx}>
                    <AdminPanelSettingsOutlinedIcon sx={{ fontSize: 19 }} />
                    Admin Panel
                </ListItemButton>
            </Box>

            {/* Footer: appearance + sign out */}
            <Box
                sx={{
                    px: 2,
                    py: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    borderTop: '1px solid var(--mui-palette-border-light)',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ThemeModeToggle />
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Theme</Typography>
                </Box>
                <Button
                    onClick={() => {
                        onClose();
                        onLogout();
                    }}
                    startIcon={<LogoutIcon sx={{ fontSize: '16px !important' }} />}
                    variant="outlined"
                    size="small"
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        height: 34,
                        borderColor: 'var(--mui-palette-border-main)',
                        color: 'var(--mui-palette-error-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                            color: 'var(--mui-palette-error-main)',
                            backgroundColor: 'var(--mui-palette-error-soft)',
                            borderColor: 'var(--mui-palette-error-softBorder)',
                        },
                    }}
                >
                    Sign Out
                </Button>
            </Box>
        </Drawer>
    );
}
