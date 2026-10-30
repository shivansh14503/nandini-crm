"use client";

import { useState, useRef } from 'react';
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
import HomeIcon from '@mui/icons-material/Home';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import AddIcon from '@mui/icons-material/Add';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Badge from '@mui/material/Badge';
import { useAuth } from '../../context/AuthContext';
import { GlobalSearch } from './GlobalSearch';
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
            { label: 'Organizations', href: '/organizations' },
            { label: 'Contacts', href: '/contacts' },
            { label: 'Opportunities', href: '/opportunities' },
            { label: 'Leads', href: '/leads' },
            { label: 'Quotations', href: '/quotations' },
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
            { label: 'Reports', href: '/dashboard' },
            { label: 'Settings', href: '/dashboard' },
            { label: 'Integrations', href: '/dashboard' },
        ],
    },
] as const;

/* ─── Hover-dropdown pill ───────────────────────────────── */
function NavPill({ item }: { item: { label: string; icon?: React.ReactNode; items: readonly { label: string; href: string }[] } }) {
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setOpen(true);
    };
    const handleMouseLeave = () => {
        closeTimer.current = setTimeout(() => setOpen(false), 120);
    };

    return (
        <Box onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} sx={{ position: 'relative' }}>
            <Button
                ref={setAnchorEl}
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
                    color: open ? '#2563EB' : '#374151',
                    fontWeight: 500,
                    fontSize: '0.8rem',
                    textTransform: 'none',
                    borderRadius: '6px',
                    px: 1.5,
                    py: 0.6,
                    backgroundColor: open ? '#EFF6FF' : 'transparent',
                    border: open ? '1px solid #BFDBFE' : '1px solid transparent',
                    whiteSpace: 'nowrap',
                    minWidth: 'unset',
                    '&:hover': {
                        backgroundColor: '#EFF6FF',
                        color: '#2563EB',
                        border: '1px solid #BFDBFE',
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
                            elevation={8}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            sx={{
                                minWidth: 180,
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1px solid #E5E7EB',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
                            }}
                        >
                            <ClickAwayListener onClickAway={() => setOpen(false)}>
                                <MenuList dense sx={{ py: 0.5 }}>
                                    {item.items.map((sub, i) => (
                                        <MenuItem
                                            key={i}
                                            component={Link}
                                            href={sub.href}
                                            onClick={() => setOpen(false)}
                                            sx={{
                                                textDecoration: 'none',
                                                fontSize: '0.82rem',
                                                color: '#374151',
                                                px: 2,
                                                py: 0.9,
                                                '&:hover': { backgroundColor: '#EFF6FF', color: '#2563EB' },
                                            }}
                                        >
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

/* ─── User avatar dropdown ──────────────────────────────── */
function UserMenu({ user, onLogout }: { user: { username: string; role: string }; onLogout: () => void }) {
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const initials = user.username.slice(0, 2).toUpperCase();

    const handleMouseEnter = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setOpen(true);
    };
    const handleMouseLeave = () => {
        closeTimer.current = setTimeout(() => setOpen(false), 150);
    };

    return (
        <Box ref={setAnchorEl} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} sx={{ position: 'relative', cursor: 'pointer' }}>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.2,
                    py: 0.5,
                    borderRadius: '8px',
                    border: open ? '1px solid #BFDBFE' : '1px solid transparent',
                    backgroundColor: open ? '#EFF6FF' : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': { backgroundColor: '#F3F4F6' },
                }}
            >
                <Avatar
                    sx={{
                        width: 32,
                        height: 32,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                    }}
                >
                    {initials}
                </Avatar>
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>
                        {user.username}
                    </Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: '#6B7280', lineHeight: 1.2 }}>
                        {user.role}
                    </Typography>
                </Box>
                <KeyboardArrowDownIcon
                    sx={{
                        fontSize: 16,
                        color: '#9CA3AF',
                        transition: 'transform 0.2s',
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                />
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
                            elevation={8}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            sx={{
                                minWidth: 200,
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1px solid #E5E7EB',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
                            }}
                        >
                            <ClickAwayListener onClickAway={() => setOpen(false)}>
                                <Box>
                                    <Box sx={{ px: 2, py: 1.5, backgroundColor: '#F9FAFB' }}>
                                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>
                                            {user.username}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                            {user.role}
                                        </Typography>
                                    </Box>
                                    <Divider />
                                    <MenuList dense sx={{ py: 0.5 }}>
                                        <MenuItem
                                            sx={{
                                                fontSize: '0.82rem',
                                                color: '#374151',
                                                px: 2,
                                                py: 0.9,
                                                gap: 1.5,
                                                '&:hover': { backgroundColor: '#EFF6FF', color: '#2563EB' },
                                            }}
                                        >
                                            <PersonIcon fontSize="small" />
                                            My Profile
                                        </MenuItem>
                                        <Divider sx={{ my: 0.5 }} />
                                        <MenuItem
                                            id="signout-btn"
                                            onClick={onLogout}
                                            sx={{
                                                fontSize: '0.82rem',
                                                color: '#EF4444',
                                                px: 2,
                                                py: 0.9,
                                                gap: 1.5,
                                                '&:hover': { backgroundColor: '#FEF2F2', color: '#DC2626' },
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
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unreadCount = SAMPLE_NOTIFICATIONS.filter((n) => n.unread).length;

    const handleMouseEnter = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setOpen(true);
    };
    const handleMouseLeave = () => {
        closeTimer.current = setTimeout(() => setOpen(false), 150);
    };

    return (
        <Box onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} sx={{ position: 'relative' }}>
            <Box
                component="button"
                ref={setAnchorEl}
                id="notification-btn"
                aria-label="Notifications"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    border: open ? '1px solid #BFDBFE' : '1px solid transparent',
                    backgroundColor: open ? '#EFF6FF' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': { backgroundColor: '#F3F4F6' },
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
                    <NotificationsIcon sx={{ fontSize: 20, color: '#6B7280' }} />
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
                            elevation={8}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            sx={{
                                width: 320,
                                borderRadius: '12px',
                                overflow: 'hidden',
                                border: '1px solid #E5E7EB',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                            }}
                        >
                            <ClickAwayListener onClickAway={() => setOpen(false)}>
                                <Box>
                                    {/* Header */}
                                    <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>
                                            Notifications
                                        </Typography>
                                        <Badge badgeContent={unreadCount} sx={{ '& .MuiBadge-badge': { backgroundColor: '#2563EB', color: '#fff', fontSize: '0.6rem' } }}>
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
                                                    backgroundColor: notif.unread ? '#F0F7FF' : '#FFFFFF',
                                                    cursor: 'pointer',
                                                    '&:hover': { backgroundColor: '#EFF6FF' },
                                                    transition: 'background 0.12s',
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: '50%',
                                                        backgroundColor: notif.unread ? '#2563EB' : 'transparent',
                                                        flexShrink: 0,
                                                        mt: 0.8,
                                                    }}
                                                />
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: notif.unread ? 700 : 500, color: '#111827', lineHeight: 1.3 }}>
                                                        {notif.title}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mt: 0.3, lineHeight: 1.4 }}>
                                                        {notif.desc}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mt: 0.4 }}>
                                                        {notif.time}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            {i < SAMPLE_NOTIFICATIONS.length - 1 && <Divider />}
                                        </Box>
                                    ))}
                                    {/* Footer */}
                                    <Box sx={{ px: 2, py: 1, borderTop: '1px solid #E5E7EB', textAlign: 'center' }}>
                                        <Typography sx={{ fontSize: '0.78rem', color: '#2563EB', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
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
    { label: 'Activity', href: '/dashboard' },
];

function CreateButton() {
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setOpen(true);
    };
    const handleMouseLeave = () => {
        closeTimer.current = setTimeout(() => setOpen(false), 120);
    };

    return (
        <Box onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} sx={{ position: 'relative' }}>
            <Button
                ref={setAnchorEl}
                id="create-btn"
                size="small"
                startIcon={<AddIcon sx={{ fontSize: '16px !important' }} />}
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
                    background: open
                        ? 'linear-gradient(135deg, #1D4ED8, #2563EB)'
                        : 'linear-gradient(135deg, #2563EB, #3B82F6)',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    textTransform: 'none',
                    borderRadius: '8px',
                    px: 1.8,
                    py: 0.6,
                    boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
                    whiteSpace: 'nowrap',
                    '&:hover': {
                        background: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.45)',
                    },
                    transition: 'all 0.15s ease',
                }}
            >
                Create
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
                            elevation={8}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            sx={{
                                minWidth: 180,
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1px solid #E5E7EB',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
                            }}
                        >
                            <ClickAwayListener onClickAway={() => setOpen(false)}>
                                <Box>
                                    <Box sx={{ px: 2, py: 1, backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            Quick Create
                                        </Typography>
                                    </Box>
                                    <MenuList dense sx={{ py: 0.5 }}>
                                        {CREATE_ITEMS.map((item, i) => (
                                            <MenuItem
                                                key={i}
                                                component={Link}
                                                href={item.href}
                                                onClick={() => setOpen(false)}
                                                sx={{
                                                    textDecoration: 'none',
                                                    fontSize: '0.82rem',
                                                    color: '#374151',
                                                    px: 2,
                                                    py: 0.9,
                                                    gap: 1.5,
                                                    '&:hover': { backgroundColor: '#EFF6FF', color: '#2563EB' },
                                                }}
                                            >
                                                <AddIcon sx={{ fontSize: 14, color: '#9CA3AF' }} />
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
export function Navbar() {
    const router = useRouter();
    const { user, logout } = useAuth();

    const handleLogout = async () => {
        try {
            await logout();
        } finally {
            router.push(ROUTES.LOGIN);
        }
    };

    return (
        <AppBar
            position="static"
            elevation={0}
            sx={{
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E5E7EB',
                zIndex: 1200,
            }}
        >
            <Toolbar sx={{ justifyContent: 'space-between', minHeight: '56px !important', px: { xs: 2, md: 3 } }}>

                {/* ── LEFT: Logo + Nav pills ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 } }}>
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
                            mr: { xs: 1, md: 2 },
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
                        <Box>
                            <Typography
                                sx={{
                                    fontSize: '0.85rem',
                                    fontWeight: 800,
                                    color: '#111827',
                                    lineHeight: 1.15,
                                    letterSpacing: '-0.01em',
                                }}
                            >
                                {APP_CONFIG.companyName}
                            </Typography>
                            <Typography
                                sx={{
                                    fontSize: '0.62rem',
                                    color: '#6B7280',
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

                {/* ── RIGHT: Search + Create + User menu ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>

                    {/* Global search (Organizations, Contacts, Leads, Opportunities) */}
                    <GlobalSearch />

                    {/* Create button */}
                    <CreateButton />

                    {/* Notification bell */}
                    <NotificationBell />

                    {/* Vertical divider */}
                    <Box
                        sx={{
                            width: '1px',
                            height: 24,
                            backgroundColor: '#E5E7EB',
                            flexShrink: 0,
                        }}
                    />

                    {/* User menu */}
                    {user && <UserMenu user={user} onLogout={handleLogout} />}
                </Box>
            </Toolbar>
        </AppBar>
    );
}
