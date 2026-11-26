'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
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
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { UserAvatar, displayName } from '@/components/common/UserAvatar';
import type { User } from '@/types/auth.types';
import { glassSurfaceSx, GLASS_RADIUS, GLASS_SHADOW, FLOAT_INSET } from '@/theme/glass';
import { moduleForPath } from '@/theme/moduleColors';
import { APP_CONFIG, ROUTES } from '@/config/constants';
import { ModuleDot, type NavGroup, type NavLinkItem } from './navItems';
import { ThemeModeToggle } from './ThemeModeToggle';
import { useShowBookingLinks } from './useShowBookingLinks';

const isOnRoute = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The item for the current page: the first one whose route the page is on (several placeholders share /dashboard). */
function activeHrefKey(groups: readonly NavGroup[], path: string): string | null {
    for (const group of groups) {
        for (const item of group.items) {
            if (isOnRoute(path, item.href)) return `${group.label}:${item.label}`;
            for (const child of item.children ?? []) {
                if (isOnRoute(path, child.href)) return `${group.label}:${item.label}:${child.label}`;
            }
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

/** One link row in the menu; the current page's row is highlighted. */
function NavLinkRow({
    item,
    active,
    showDot,
    onClose,
    nested = false,
}: {
    item: NavLinkItem;
    active: boolean;
    showDot: boolean;
    onClose: () => void;
    nested?: boolean;
}) {
    return (
        <ListItemButton
            component={Link}
            href={item.href}
            onClick={onClose}
            selected={active}
            aria-current={active ? 'page' : undefined}
            sx={{
                ...rowSx,
                minHeight: nested ? 36 : 38,
                ...(nested && { fontSize: '0.83rem' }),
                ...(active && {
                    color: 'var(--crm-text-blue-900)',
                    fontWeight: 700,
                    backgroundColor: 'var(--mui-palette-primary-soft) !important',
                    boxShadow: 'inset 0 0 0 1px var(--mui-palette-primary-softBorder)',
                }),
            }}
        >
            {showDot && <ModuleDot href={item.href} />}
            {item.label}
        </ListItemButton>
    );
}

export interface MobileNavDrawerProps {
    open: boolean;
    onClose: () => void;
    groups: readonly NavGroup[];
    /** Path of the page the menu was opened on; its item is highlighted and its group starts expanded. */
    currentPath: string;
    user: Pick<User, 'username' | 'role' | 'fullName' | 'photoUrl'> | null;
    onLogout: () => void;
}

/**
 * Phone / tablet navigation: the navbar pills don't fit below `lg`, so the menu button opens this panel with the
 * same groups (collapsible), My Profile, the admin link, the light/dark switch (hidden from the bar on phones) and
 * Sign Out.
 */
export function MobileNavDrawer({ open, onClose, groups, currentPath, user, onLogout }: MobileNavDrawerProps) {
    const activeKey = activeHrefKey(groups, currentPath);
    const showBookingLinks = useShowBookingLinks();
    const activeGroup = activeKey?.split(':')[0] ?? 'Sales';
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set([activeGroup]));

    // Each time the menu opens on another page, start with that page's group expanded (reset during render).
    const [lastPath, setLastPath] = useState(currentPath);
    if (currentPath !== lastPath) {
        setLastPath(currentPath);
        setExpanded(new Set([activeGroup]));
    }

    // Items with nested routes (All Activities › Calls …) open inline under their row; collapsed by default.
    const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());
    const toggleItem = (key: string) =>
        setExpandedItems((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

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

            {/* Signed-in user (opens My Profile) */}
            {user && (
                <Box sx={{ mx: 1.5, mb: 1 }}>
                    <ListItemButton
                        component={Link}
                        href={ROUTES.PROFILE}
                        onClick={onClose}
                        aria-label={`My Profile: ${displayName(user)}`}
                        sx={{
                            px: 1.5,
                            py: 1.25,
                            gap: 1.25,
                            borderRadius: '12px',
                            backgroundColor: 'var(--mui-palette-background-subtle)',
                            border: '1px solid var(--mui-palette-border-light)',
                            transition: 'background-color 0.15s ease, border-color 0.15s ease',
                            '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', borderColor: 'var(--mui-palette-primary-softBorder)' },
                            '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                        }}
                    >
                        <UserAvatar name={displayName(user)} photoUrl={user.photoUrl} size={34} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography noWrap sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)', lineHeight: 1.2 }}>
                                {displayName(user)}
                            </Typography>
                            <Typography noWrap sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.3 }}>
                                {user.role}
                            </Typography>
                        </Box>
                        <ChevronRightRoundedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)', flexShrink: 0 }} />
                    </ListItemButton>
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
                                            const key = `${group.label}:${item.label}`;
                                            const link = (
                                                <NavLinkRow
                                                    item={item}
                                                    active={activeKey === key}
                                                    showDot={hasModuleItems}
                                                    onClose={onClose}
                                                />
                                            );
                                            if (!item.children?.length) {
                                                return (
                                                    <NavLinkRow
                                                        key={item.label}
                                                        item={item}
                                                        active={activeKey === key}
                                                        showDot={hasModuleItems}
                                                        onClose={onClose}
                                                    />
                                                );
                                            }

                                            const itemOpen = expandedItems.has(key);
                                            const childDots = item.children.some((c) => moduleForPath(c.href));
                                            const submenuId = `nav-sub-${key.replace(/[^a-z0-9]+/gi, '-')}`;
                                            return (
                                                <Box key={item.label}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                        <Box sx={{ flex: 1, minWidth: 0 }}>{link}</Box>
                                                        <IconButton
                                                            onClick={() => toggleItem(key)}
                                                            aria-expanded={itemOpen}
                                                            aria-controls={submenuId}
                                                            aria-label={`${itemOpen ? 'Hide' : 'Show'} ${item.label} types`}
                                                            sx={{
                                                                width: 38,
                                                                height: 38,
                                                                flexShrink: 0,
                                                                borderRadius: '10px',
                                                                color: itemOpen ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-muted)',
                                                                transition: 'all 0.15s ease',
                                                                '&:hover': {
                                                                    backgroundColor: 'var(--mui-palette-primary-soft)',
                                                                    color: 'var(--crm-text-blue-700)',
                                                                },
                                                                '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                                            }}
                                                        >
                                                            <ExpandMoreIcon
                                                                sx={{
                                                                    fontSize: 18,
                                                                    transition: 'transform 0.2s',
                                                                    transform: itemOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                                                }}
                                                            />
                                                        </IconButton>
                                                    </Box>
                                                    <Collapse in={itemOpen} timeout={180} unmountOnExit>
                                                        <List
                                                            id={submenuId}
                                                            disablePadding
                                                            aria-label={item.label}
                                                            sx={{ ml: 2, pl: 1, py: 0.25, borderLeft: '1px solid var(--mui-palette-border-main)' }}
                                                        >
                                                            {item.children.map((child) => (
                                                                <NavLinkRow
                                                                    key={child.href}
                                                                    item={child}
                                                                    active={activeKey === `${key}:${child.label}`}
                                                                    showDot={childDots}
                                                                    onClose={onClose}
                                                                    nested
                                                                />
                                                            ))}
                                                        </List>
                                                    </Collapse>
                                                </Box>
                                            );
                                        })}
                                    </List>
                                </Collapse>
                            </Box>
                        );
                    })}
                </List>

                <Divider sx={{ my: 1, borderColor: 'var(--mui-palette-border-light)' }} />

                <ListItemButton component={Link} href={ROUTES.PROFILE} onClick={onClose} sx={rowSx}>
                    <PersonOutlineRoundedIcon sx={{ fontSize: 19 }} />
                    My Profile
                </ListItemButton>
                {showBookingLinks && (
                    <ListItemButton component={Link} href={ROUTES.BOOKING_LINKS} onClick={onClose} sx={rowSx}>
                        <EventAvailableOutlinedIcon sx={{ fontSize: 19 }} />
                        Booking links
                    </ListItemButton>
                )}
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
