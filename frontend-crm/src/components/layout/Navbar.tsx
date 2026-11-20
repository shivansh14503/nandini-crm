"use client";

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
    AppBar,
    Toolbar,
    Box,
    Button,
    Paper,
    Popper,
    Grow,
    ClickAwayListener,
    MenuList,
    MenuItem,
    Divider,
    Typography,
    Avatar,
} from '@mui/material';
import { glassSurfaceSx, GLASS_SHADOW, GLASS_RADIUS, FLOAT_INSET, NAVBAR_HEIGHT } from '@/theme/glass';
import { useRightPanelWidth } from './rightPanelStore';
import HomeIcon from '@mui/icons-material/Home';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import AddIcon from '@mui/icons-material/Add';
import NotificationsIcon from '@mui/icons-material/Notifications';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import { getModuleColor, moduleForPath } from '@/theme/moduleColors';
import Badge from '@mui/material/Badge';
import { useAuth } from '../../context/AuthContext';
import { GlobalSearch } from './GlobalSearch';
import { ThemeModeToggle } from './ThemeModeToggle';
import { APP_CONFIG, ROUTES } from '@/config/constants';

/* ─── Nav pill definitions ─────────────────────────────── */
const NAV_ITEMS = [
    {
        label: 'Home',
        icon: <HomeIcon fontSize="small" />,
        items: [
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'My Activities', href: '/dashboard' },
            { label: 'Calendar', href: '/dashboard' },
        ],
    },
    {
        label: 'Sales',
        items: [
            { label: 'Leads', href: '/leads' },
            { label: 'Opportunities', href: '/opportunities' },
            { label: 'Quotations', href: '/quotations' },
            { label: 'Organizations', href: '/organizations' },
            { label: 'Contacts', href: '/contacts' },
        ],
    },
    {
        label: 'Support',
        items: [
            { label: 'Tickets', href: ROUTES.TICKETS },
            { label: 'SLA Policies', href: '/dashboard' },
            { label: 'Helpdesk Teams', href: '/dashboard' },
        ],
    },
    {
        label: 'Activities',
        items: [
            { label: 'All Activities', href: '/dashboard' },
            { label: 'Calls', href: '/dashboard' },
            { label: 'Meetings', href: '/dashboard' },
            { label: 'Emails', href: '/dashboard' },
        ],
    },
    {
        label: 'Inventory',
        items: [
            { label: 'Product Catalog', href: '/products' },
            { label: 'Categories', href: '/dashboard' },
            { label: 'Stock Movements', href: '/dashboard' },
        ],
    },
    {
        label: 'All',
        items: [
            { label: 'Partner Company', href: ROUTES.PARTNER_COMPANIES },
            { label: 'Reports', href: '/dashboard' },
            { label: 'Integrations', href: '/dashboard' },
        ],
    },
] as const;

/* ─── Shared hover + click/tap dropdown behaviour ───────── */
const CLOSE_DELAY_MS = 150;

function useDropdown() {
    const menuId = useId();
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearCloseTimer = useCallback(() => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);

    // Clear any pending close timeout on unmount
    useEffect(() => clearCloseTimer, [clearCloseTimer]);

    const close = useCallback(() => {
        clearCloseTimer();
        setOpen(false);
    }, [clearCloseTimer]);

    // Close on Escape while open
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, close]);

    // Hover is mouse-only: touch/pen taps also emit pointerenter, which would
    // open the menu and then have the click handler toggle it straight shut.
    const hoverProps = {
        onPointerEnter: (e: React.PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            clearCloseTimer();
            setOpen(true);
        },
        onPointerLeave: (e: React.PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            clearCloseTimer();
            closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
        },
    };

    const triggerProps = {
        'aria-haspopup': 'true' as const,
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => {
            clearCloseTimer();
            setOpen((prev) => !prev);
        },
    };

    // The popper is portaled outside the trigger, so a click on the trigger
    // reaches ClickAwayListener too; ignore it and let onClick toggle.
    const handleClickAway = (event: MouseEvent | TouchEvent) => {
        if (anchorEl && anchorEl.contains(event.target as Node)) return;
        close();
    };

    return { open, close, menuId, setAnchorEl, anchorEl, hoverProps, triggerProps, handleClickAway };
}

/* ─── Hover/click-dropdown pill ─────────────────────────── */
function NavPill({ item }: { item: { label: string; icon?: React.ReactNode; items: readonly { label: string; href: string }[] } }) {
    const { open, close, menuId, setAnchorEl, anchorEl, hoverProps, triggerProps, handleClickAway } = useDropdown();
    const hasModuleItems = item.items.some((sub) => moduleForPath(sub.href));

    return (
        <Box {...hoverProps} sx={{ position: 'relative' }}>
            <Button
                ref={setAnchorEl}
                {...triggerProps}
                size="small"
                startIcon={item.icon}
                endIcon={
                    <KeyboardArrowDownIcon
                        sx={{
                            fontSize: '16px !important',
                            transition: 'transform 0.2s',
                            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                    />
                }
                sx={{
                    color: open ? 'var(--crm-text-blue-600)' : 'var(--crm-gray-700)',
                    fontWeight: 500,
                    fontSize: '0.8rem',
                    textTransform: 'none',
                    borderRadius: '8px',
                    px: 1.5,
                    py: 0.6,
                    backgroundColor: open ? 'var(--mui-palette-primary-soft)' : 'transparent',
                    border: open ? '1px solid var(--mui-palette-primary-softBorder)' : '1px solid transparent',
                    whiteSpace: 'nowrap',
                    minWidth: 'unset',
                    '&:hover': {
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        color: 'var(--mui-palette-primary-main)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                    },
                    transition: 'all 0.15s ease',
                }}
            >
                {item.label}
            </Button>

            <Popper
                open={open}
                anchorEl={anchorEl}
                placement="bottom-start"
                transition
                style={{ zIndex: 1400 }}
                modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
            >
                {({ TransitionProps }) => (
                    <Grow {...TransitionProps} timeout={150}>
                        <Paper
                            id={menuId}
                            elevation={8}
                            {...hoverProps}
                            sx={{
                                minWidth: 180,
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1px solid var(--crm-gray-200)',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
                            }}
                        >
                            <ClickAwayListener onClickAway={handleClickAway}>
                                <MenuList dense sx={{ py: 0.5 }}>
                                    {item.items.map((sub, i) => (
                                        <MenuItem
                                            key={i}
                                            component={Link}
                                            href={sub.href}
                                            onClick={close}
                                            sx={{
                                                textDecoration: 'none',
                                                fontSize: '0.82rem',
                                                color: 'var(--crm-gray-700)',
                                                px: 2,
                                                py: 0.9,
                                                gap: 1.25,
                                                '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--mui-palette-primary-main)' },
                                            }}
                                        >
                                            {hasModuleItems && <ModuleDot href={sub.href} />}
                                            {sub.label}
                                        </MenuItem>
                                    ))}
                                </MenuList>
                            </ClickAwayListener>
                        </Paper>
                    </Grow>
                )}
            </Popper>
        </Box>
    );
}

/** Small dot in the module's identity color; non-module items get an empty slot so labels stay aligned. */
function ModuleDot({ href }: { href: string }) {
    const moduleKey = moduleForPath(href);
    return (
        <Box
            component="span"
            aria-hidden
            sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor: moduleKey ? getModuleColor(moduleKey).main : 'transparent',
            }}
        />
    );
}

const createIconColor = (href: string) => {
    const moduleKey = moduleForPath(href);
    return moduleKey ? getModuleColor(moduleKey).main : 'var(--crm-gray-400)';
};

/* ─── User avatar dropdown ──────────────────────────────── */
function UserMenu({
    user,
    onLogout,
    compact = false,
}: {
    user: { username: string; role: string };
    onLogout: () => void;
    compact?: boolean;
}) {
    const { open, close, menuId, setAnchorEl, anchorEl, hoverProps, triggerProps, handleClickAway } = useDropdown();

    const initials = user.username.slice(0, 2).toUpperCase();

    return (
        <Box {...hoverProps} sx={{ position: 'relative', cursor: 'pointer' }}>
            <Box
                component="button"
                type="button"
                ref={setAnchorEl}
                id="user-menu-btn"
                {...triggerProps}
                aria-label={compact ? `Account: ${user.username}` : undefined}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: compact ? 0.25 : 1.2,
                    py: compact ? 0.25 : 0.5,
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    border: open ? '1px solid var(--mui-palette-primary-softBorder)' : '1px solid transparent',
                    backgroundColor: open ? 'var(--mui-palette-primary-soft)' : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        borderColor: 'var(--mui-palette-primary-softBorder)',
                    },
                }}
            >
                <Avatar
                    sx={{
                        width: 32,
                        height: 32,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, var(--crm-fill-blue-500), var(--crm-fill-blue-600))',
                    }}
                >
                    {initials}
                </Avatar>
                {!compact && (
                    <>
                        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-gray-900)', lineHeight: 1.2 }}>
                                {user.username}
                            </Typography>
                            <Typography sx={{ fontSize: '0.7rem', color: 'var(--crm-gray-500)', lineHeight: 1.2 }}>
                                {user.role}
                            </Typography>
                        </Box>
                        <KeyboardArrowDownIcon
                            sx={{
                                fontSize: 16,
                                color: 'var(--crm-gray-400)',
                                transition: 'transform 0.2s',
                                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                        />
                    </>
                )}
            </Box>

            <Popper
                open={open}
                anchorEl={anchorEl}
                placement="bottom-end"
                transition
                style={{ zIndex: 1400 }}
                modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
            >
                {({ TransitionProps }) => (
                    <Grow {...TransitionProps} timeout={150}>
                        <Paper
                            id={menuId}
                            elevation={8}
                            {...hoverProps}
                            sx={{
                                minWidth: 200,
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1px solid var(--crm-gray-200)',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
                            }}
                        >
                            <ClickAwayListener onClickAway={handleClickAway}>
                                <Box>
                                    <Box sx={{ px: 2, py: 1.5, backgroundColor: 'var(--crm-gray-50)' }}>
                                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-gray-900)' }}>
                                            {user.username}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--crm-gray-500)' }}>
                                            {user.role}
                                        </Typography>
                                    </Box>
                                    <Divider />
                                    <MenuList dense sx={{ py: 0.5 }}>
                                        <MenuItem
                                            onClick={close}
                                            sx={{
                                                fontSize: '0.82rem',
                                                color: 'var(--crm-gray-700)',
                                                px: 2,
                                                py: 0.9,
                                                gap: 1.5,
                                                '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--mui-palette-primary-main)' },
                                            }}
                                        >
                                            <PersonIcon fontSize="small" />
                                            My Profile
                                        </MenuItem>
                                        <MenuItem
                                            id="admin-panel-btn"
                                            component={Link}
                                            href={ROUTES.ADMIN}
                                            onClick={close}
                                            sx={{
                                                textDecoration: 'none',
                                                fontSize: '0.82rem',
                                                color: 'var(--crm-gray-700)',
                                                px: 2,
                                                py: 0.9,
                                                gap: 1.5,
                                                '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--mui-palette-primary-main)' },
                                            }}
                                        >
                                            <AdminPanelSettingsOutlinedIcon fontSize="small" />
                                            Admin Panel
                                        </MenuItem>
                                        <Divider sx={{ my: 0.5 }} />
                                        <MenuItem
                                            id="signout-btn"
                                            onClick={() => {
                                                close();
                                                onLogout();
                                            }}
                                            sx={{
                                                fontSize: '0.82rem',
                                                color: 'var(--crm-red-500)',
                                                px: 2,
                                                py: 0.9,
                                                gap: 1.5,
                                                '&:hover': { backgroundColor: 'var(--mui-palette-error-soft)', color: 'var(--mui-palette-error-main)' },
                                            }}
                                        >
                                            <LogoutIcon fontSize="small" />
                                            Sign Out
                                        </MenuItem>
                                    </MenuList>
                                </Box>
                            </ClickAwayListener>
                        </Paper>
                    </Grow>
                )}
            </Popper>
        </Box>
    );
}

/* ─── Notification bell ────────────────────────────────── */
const SAMPLE_NOTIFICATIONS = [
    { id: 1, title: 'New lead assigned', desc: 'Bhanu assigned a new lead to you', time: 'Just now', unread: true },
    { id: 2, title: 'Contract expiring soon', desc: 'GMR Enterprises contract expires in 7 days', time: '2h ago', unread: true },
    { id: 3, title: 'Opportunity won', desc: 'Alsorg Interiors moved to Closed Won', time: '5h ago', unread: false },
];

function NotificationBell() {
    const { open, menuId, setAnchorEl, anchorEl, hoverProps, triggerProps, handleClickAway } = useDropdown();
    const unreadCount = SAMPLE_NOTIFICATIONS.filter((n) => n.unread).length;

    return (
        <Box {...hoverProps} sx={{ position: 'relative' }}>
            <Box
                component="button"
                type="button"
                ref={setAnchorEl}
                id="notification-btn"
                aria-label="Notifications"
                {...triggerProps}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    border: open ? '1px solid var(--mui-palette-primary-softBorder)' : '1px solid transparent',
                    backgroundColor: open ? 'var(--mui-palette-primary-soft)' : 'transparent',
                    color: open ? 'var(--mui-palette-primary-main)' : 'var(--crm-gray-500)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        borderColor: 'var(--mui-palette-primary-softBorder)',
                        color: 'var(--mui-palette-primary-main)',
                    },
                }}
            >
                <Badge
                    badgeContent={unreadCount}
                    sx={{
                        '& .MuiBadge-badge': {
                            backgroundColor: '#EF4444',
                            color: '#fff',
                            fontSize: '0.6rem',
                            minWidth: 16,
                            height: 16,
                            padding: '0 4px',
                        },
                    }}
                >
                    <NotificationsIcon sx={{ fontSize: 20, color: 'inherit' }} />
                </Badge>
            </Box>

            <Popper
                open={open}
                anchorEl={anchorEl}
                placement="bottom-end"
                transition
                style={{ zIndex: 1400 }}
                modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
            >
                {({ TransitionProps }) => (
                    <Grow {...TransitionProps} timeout={150}>
                        <Paper
                            id={menuId}
                            elevation={8}
                            {...hoverProps}
                            sx={{
                                width: 320,
                                borderRadius: '12px',
                                overflow: 'hidden',
                                border: '1px solid var(--crm-gray-200)',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                            }}
                        >
                            <ClickAwayListener onClickAway={handleClickAway}>
                                <Box>
                                    {/* Header */}
                                    <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--crm-gray-200)', backgroundColor: 'var(--crm-gray-50)' }}>
                                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-gray-900)' }}>
                                            Notifications
                                        </Typography>
                                        <Badge badgeContent={unreadCount} sx={{ '& .MuiBadge-badge': { backgroundColor: 'var(--mui-palette-primary-main)', color: '#fff', fontSize: '0.6rem' } }}>
                                            <Box />
                                        </Badge>
                                    </Box>
                                    {/* Notification items */}
                                    {SAMPLE_NOTIFICATIONS.map((notif, i) => (
                                        <Box key={notif.id}>
                                            <Box
                                                sx={{
                                                    px: 2,
                                                    py: 1.5,
                                                    display: 'flex',
                                                    gap: 1.5,
                                                    alignItems: 'flex-start',
                                                    backgroundColor: notif.unread ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)',
                                                    cursor: 'pointer',
                                                    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)' },
                                                    transition: 'background 0.12s',
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: '50%',
                                                        backgroundColor: notif.unread ? 'var(--mui-palette-primary-main)' : 'transparent',
                                                        flexShrink: 0,
                                                        mt: 0.8,
                                                    }}
                                                />
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: notif.unread ? 700 : 500, color: 'var(--crm-gray-900)', lineHeight: 1.3 }}>
                                                        {notif.title}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--crm-gray-500)', mt: 0.3, lineHeight: 1.4 }}>
                                                        {notif.desc}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: '0.7rem', color: 'var(--crm-gray-400)', mt: 0.4 }}>
                                                        {notif.time}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            {i < SAMPLE_NOTIFICATIONS.length - 1 && <Divider />}
                                        </Box>
                                    ))}
                                    {/* Footer */}
                                    <Box sx={{ px: 2, py: 1, borderTop: '1px solid var(--crm-gray-200)', textAlign: 'center' }}>
                                        <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-primary-main)', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                                            See all notifications
                                        </Typography>
                                    </Box>
                                </Box>
                            </ClickAwayListener>
                        </Paper>
                    </Grow>
                )}
            </Popper>
        </Box>
    );
}

/* ─── Create button with dropdown ──────────────────────── */
const CREATE_ITEMS = [
    { label: 'Lead', href: '/leads/new' },
    { label: 'Organization', href: '/organizations/new' },
    { label: 'Contact', href: '/contacts/new' },
    { label: 'Opportunity', href: '/opportunities/new' },
    { label: 'Ticket', href: ROUTES.TICKET_NEW },
    { label: 'Partner Company', href: ROUTES.PARTNER_COMPANY_NEW },
    { label: 'Activity', href: '/dashboard' },
];

function CreateButton({ compact = false }: { compact?: boolean }) {
    const { open, close, menuId, setAnchorEl, anchorEl, hoverProps, triggerProps, handleClickAway } = useDropdown();

    return (
        <Box {...hoverProps} sx={{ position: 'relative' }}>
            <Button
                ref={setAnchorEl}
                id="create-btn"
                {...triggerProps}
                size="small"
                aria-label={compact ? 'Create' : undefined}
                startIcon={compact ? undefined : <AddIcon sx={{ fontSize: '16px !important' }} />}
                endIcon={
                    compact ? undefined : (
                        <KeyboardArrowDownIcon
                            sx={{
                                fontSize: '16px !important',
                                transition: 'transform 0.2s',
                                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                        />
                    )
                }
                sx={{
                    ...(compact && { minWidth: 0, width: 36, height: 36, p: 0 }),
                    background: open
                        ? 'linear-gradient(135deg, var(--crm-fill-blue-700), var(--crm-fill-blue-600))'
                        : 'linear-gradient(135deg, var(--crm-fill-blue-600), var(--crm-fill-blue-500))',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    textTransform: 'none',
                    borderRadius: compact ? '10px' : '8px',
                    ...(!compact && { px: 1.8, py: 0.6 }),
                    boxShadow: '0 2px 8px rgb(var(--crm-accent-rgb) / 0.35)',
                    whiteSpace: 'nowrap',
                    '&:hover': {
                        background: 'linear-gradient(135deg, var(--crm-fill-blue-700), var(--crm-fill-blue-600))',
                        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.45)',
                    },
                    transition: 'all 0.15s ease',
                }}
            >
                {compact ? <AddIcon sx={{ fontSize: 20 }} /> : 'Create'}
            </Button>

            <Popper
                open={open}
                anchorEl={anchorEl}
                placement="bottom-start"
                transition
                style={{ zIndex: 1400 }}
                modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
            >
                {({ TransitionProps }) => (
                    <Grow {...TransitionProps} timeout={150}>
                        <Paper
                            id={menuId}
                            elevation={8}
                            {...hoverProps}
                            sx={{
                                minWidth: 180,
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1px solid var(--crm-gray-200)',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
                            }}
                        >
                            <ClickAwayListener onClickAway={handleClickAway}>
                                <Box>
                                    <Box sx={{ px: 2, py: 1, backgroundColor: 'var(--crm-gray-50)', borderBottom: '1px solid var(--crm-gray-200)' }}>
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--crm-gray-500)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            Quick Create
                                        </Typography>
                                    </Box>
                                    <MenuList dense sx={{ py: 0.5 }}>
                                        {CREATE_ITEMS.map((item, i) => (
                                            <MenuItem
                                                key={i}
                                                component={Link}
                                                href={item.href}
                                                onClick={close}
                                                sx={{
                                                    textDecoration: 'none',
                                                    fontSize: '0.82rem',
                                                    color: 'var(--crm-gray-700)',
                                                    px: 2,
                                                    py: 0.9,
                                                    gap: 1.5,
                                                    '&:hover': {
                                                        backgroundColor: 'var(--mui-palette-primary-soft)',
                                                        color: 'var(--mui-palette-primary-main)',
                                                        '& .MuiSvgIcon-root': { color: 'var(--mui-palette-primary-main)' },
                                                    },
                                                }}
                                            >
                                                <AddIcon sx={{ fontSize: 14, color: createIconColor(item.href), transition: 'color 0.15s ease' }} />
                                                {item.label}
                                            </MenuItem>
                                        ))}
                                    </MenuList>
                                </Box>
                            </ClickAwayListener>
                        </Paper>
                    </Grow>
                )}
            </Popper>
        </Box>
    );
}

/* ─── Main Navbar ───────────────────────────────────────── */
// Inset gap + bar + a short fade tail below the bar.
const SCROLL_BACKDROP_HEIGHT = FLOAT_INSET + NAVBAR_HEIGHT + 20;

export function Navbar() {
    const router = useRouter();
    const { user, logout } = useAuth();
    // A docked detail drawer: end the bar 12px short of it and switch the right-side controls to icons.
    const panelWidth = useRightPanelWidth();
    const compact = panelWidth > 0;

    const handleLogout = async () => {
        try {
            await logout();
        } finally {
            router.push(ROUTES.LOGIN);
        }
    };

    return (
        <>
        {/* Scroll backdrop: page colour across the inset gap above the bar, fading out just below it,
            so scrolled content never peeks out above the floating bar. Takes no layout space. */}
        <Box
            aria-hidden
            sx={{
                position: 'sticky',
                top: 0,
                height: SCROLL_BACKDROP_HEIGHT,
                mb: `-${SCROLL_BACKDROP_HEIGHT}px`,
                zIndex: 1199,
                pointerEvents: 'none',
                background: `linear-gradient(to bottom,
                    var(--crm-page-bg, var(--mui-palette-background-subtle)) 0px,
                    var(--crm-page-bg, var(--mui-palette-background-subtle)) ${FLOAT_INSET + NAVBAR_HEIGHT / 2}px,
                    color-mix(in srgb, var(--crm-page-bg, var(--mui-palette-background-subtle)) 0%, transparent) 100%)`,
            }}
        />
        <AppBar
            // Floating glass bar: sticky with an inset, so page content scrolls beneath the frosted surface.
            position="sticky"
            elevation={0}
            sx={{
                ...glassSurfaceSx,
                top: FLOAT_INSET,
                mt: `${FLOAT_INSET}px`,
                ml: `${FLOAT_INSET}px`,
                mr: `${compact ? panelWidth + FLOAT_INSET * 2 : FLOAT_INSET}px`,
                width: 'auto',
                color: 'inherit',
                borderRadius: GLASS_RADIUS,
                boxShadow: GLASS_SHADOW,
                zIndex: 1200,
                transition: 'margin-right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
        >
            <Toolbar
                sx={{
                    justifyContent: 'space-between',
                    minHeight: `${NAVBAR_HEIGHT}px !important`,
                    pl: { xs: 1.5, md: 1.75 },
                    pr: { xs: 1.5, md: 2 },
                }}
            >

                {/* ── LEFT: Logo + Nav pills ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: compact ? 1 : { xs: 1, md: 2 }, minWidth: 0 }}>
                    {/* Logo — clicks → dashboard */}
                    <Box
                        component={Link}
                        href={ROUTES.DASHBOARD}
                        sx={{
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.2,
                            cursor: 'pointer',
                            flexShrink: 0,
                            mr: compact ? 0.5 : { xs: 1, md: 2 },
                            transition: 'opacity 0.15s',
                            '&:hover': { opacity: 0.82 },
                        }}
                    >
                        <Image
                            src="/images/NIPL-Updated-Logo-Large.png"
                            alt={APP_CONFIG.logoAlt}
                            width={32}
                            height={32}
                            style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '6px' }}
                        />
                        {/* Compact bar: the name only stays on extra-wide screens, where there is room for it. */}
                        <Box sx={{ display: compact ? { xs: 'none', xl: 'block' } : 'block' }}>
                            <Typography
                                sx={{
                                    fontSize: '0.85rem',
                                    fontWeight: 800,
                                    color: 'var(--crm-gray-900)',
                                    lineHeight: 1.15,
                                    letterSpacing: '-0.01em',
                                }}
                            >
                                {APP_CONFIG.companyName}
                            </Typography>
                            <Typography
                                sx={{
                                    fontSize: '0.62rem',
                                    color: 'var(--crm-gray-500)',
                                    lineHeight: 1.2,
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Enterprise CRM
                            </Typography>
                        </Box>
                    </Box>

                    {/* Nav pills */}
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5 }}>
                        {NAV_ITEMS.map((item) => (
                            <NavPill key={item.label} item={item} />
                        ))}
                    </Box>
                </Box>

                {/* ── RIGHT: Search + Create + User menu (icon-only while a drawer is docked) ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: compact ? 0.75 : 1.5, flexShrink: 0 }}>

                    {/* Global search (every module; Enter opens /search) */}
                    <GlobalSearch compact={compact} />

                    {/* Create button */}
                    <CreateButton compact={compact} />

                    {/* Light / dark / system */}
                    <ThemeModeToggle />

                    {/* Notification bell */}
                    <NotificationBell />

                    {/* Vertical divider */}
                    <Box
                        sx={{
                            width: '1px',
                            height: 24,
                            backgroundColor: 'var(--crm-gray-200)',
                            flexShrink: 0,
                        }}
                    />

                    {/* User menu */}
                    {user && <UserMenu user={user} onLogout={handleLogout} compact={compact} />}
                </Box>
            </Toolbar>
        </AppBar>
        </>
    );
}
