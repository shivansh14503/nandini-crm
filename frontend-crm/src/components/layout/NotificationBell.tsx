'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Box, Button, ButtonBase, ClickAwayListener, Grow, Paper, Popper, Skeleton, Typography } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import SyncProblemOutlinedIcon from '@mui/icons-material/SyncProblemOutlined';
import ForwardToInboxOutlinedIcon from '@mui/icons-material/ForwardToInboxOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import {
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
    useNotifications,
    useUnreadNotificationCount,
} from '@/hooks/queries/useNotifications';
import { getModuleColor } from '@/theme/moduleColors';
import type { CrmNotification } from '@/types/notification.types';
import { addDays, instantToZonedWallClock, zonedDayOf } from '@/utils/zonedTime';
import { formatBusinessInstant, formatDayLabel, formatWallTime, timeZoneAbbr, useBusinessClock } from '@/components/activities/activityTime';
import { useDisplayFormats } from '@/utils/formats';
import { useDropdown } from './useDropdown';

/** Gap kept between the popover and the screen edges on phones (16px each side). */
const EDGE_GAP = 16;

/** Which notifications the popover lists. The last choice is remembered per browser; Unread is the default. */
type NotificationView = 'unread' | 'all';
const VIEW_STORAGE_KEY = 'crm.notifications.view';

function readSavedView(): NotificationView {
    try {
        return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'all' ? 'all' : 'unread';
    } catch {
        return 'unread';
    }
}

function saveView(view: NotificationView) {
    try {
        window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
        // Private windows / blocked storage: the choice just isn't remembered.
    }
}

const KIND_ICONS: Record<string, SvgIconComponent> = {
    activity_reminder: AlarmOutlinedIcon,
    activity_assigned: AssignmentIndOutlinedIcon,
    activity_invited: GroupAddOutlinedIcon,
    contract_renewal: AutorenewOutlinedIcon,
    calendar_sync_issue: EventBusyOutlinedIcon,
    calendar_sync_error: SyncProblemOutlinedIcon,
    calendar_invites_held: ForwardToInboxOutlinedIcon,
    integration_secret_expiring: KeyOutlinedIcon,
    booking_created: EventAvailableOutlinedIcon,
};

/** The icon tile takes the tint of the record's module (activities olive, contracts rose); others stay neutral. */
function tileColors(entityModule: string) {
    if (entityModule === 'activities' || entityModule === 'contracts') {
        const color = getModuleColor(entityModule);
        return { background: color.soft, border: color.border, icon: color.text };
    }
    return { background: 'var(--mui-palette-background-subtle)', border: 'var(--mui-palette-border-main)', icon: 'var(--mui-palette-text-secondary)' };
}

/**
 * When a notification arrived, in the business timezone: `Just now`, `5 min ago`, `3 h ago`, `Today, 9:15 AM`,
 * `Yesterday, 4:30 PM`, `Wed 18 Nov, 4:30 PM`, or `18 Nov 2025` from another year. `full` is the exact time.
 */
export function formatNotificationTime(iso: string, now: Date, timeZone: string): { label: string; full: string } {
    const at = new Date(iso);
    if (!iso || Number.isNaN(at.getTime())) return { label: '', full: '' };
    const full = `${formatBusinessInstant(iso, timeZone)} ${timeZoneAbbr(timeZone, at)}`;
    const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
    if (minutes < 1) return { label: 'Just now', full };
    if (minutes < 60) return { label: `${minutes} min ago`, full };
    if (minutes < 6 * 60) return { label: `${Math.floor(minutes / 60)} h ago`, full };
    const wall = instantToZonedWallClock(at, timeZone);
    const day = wall.slice(0, 10);
    const today = zonedDayOf(now, timeZone);
    const time = formatWallTime(wall);
    if (day === today) return { label: `Today, ${time}`, full };
    if (day === addDays(today, -1)) return { label: `Yesterday, ${time}`, full };
    if (day.slice(0, 4) !== today.slice(0, 4)) return { label: formatDayLabel(day, { weekday: false, withYear: true }), full };
    return { label: `${formatDayLabel(day)}, ${time}`, full };
}

/** Text button of the popover's header and footer: brand text, soft brand fill on hover (40px tap target). */
const textButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.78rem',
    minHeight: 40,
    px: 1.25,
    borderRadius: '8px',
    color: 'var(--crm-text-blue-700)',
    whiteSpace: 'nowrap',
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
    '&.Mui-disabled': { color: 'var(--mui-palette-text-muted)' },
} as const;

function NotificationRow({ row, now, timeZone, onOpen }: { row: CrmNotification; now: Date; timeZone: string; onOpen: (row: CrmNotification) => void }) {
    const unread = !row.readAt;
    const tint = tileColors(row.entityModule);
    const Icon = KIND_ICONS[row.kind] ?? NotificationsNoneOutlinedIcon;
    const time = formatNotificationTime(row.createdAt, now, timeZone);
    return (
        <Box component="li" sx={{ borderBottom: '1px solid var(--mui-palette-border-light)', '&:last-of-type': { borderBottom: 'none' } }}>
            <ButtonBase
                onClick={() => onOpen(row)}
                sx={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    gap: 1.5,
                    px: 2,
                    py: 1.25,
                    minHeight: 56,
                    textAlign: 'left',
                    cursor: row.href ? 'pointer' : 'default',
                    backgroundColor: unread ? 'var(--mui-palette-primary-soft)' : 'transparent',
                    transition: 'background-color 0.12s ease',
                    '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
                    '&.Mui-focusVisible': { outline: '2px solid rgb(var(--crm-accent-rgb) / 0.55)', outlineOffset: -2 },
                }}
            >
                <Box
                    component="span"
                    sx={{
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: tint.background,
                        border: `1px solid ${tint.border}`,
                        color: tint.icon,
                    }}
                >
                    <Icon sx={{ fontSize: 19 }} />
                </Box>
                <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
                    <Typography
                        component="span"
                        sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            overflowWrap: 'anywhere',
                            fontSize: '0.82rem',
                            fontWeight: unread ? 700 : 600,
                            lineHeight: 1.3,
                            color: 'var(--crm-slate-900)',
                        }}
                    >
                        {row.title}
                    </Typography>
                    {row.body && (
                        <Typography
                            component="span"
                            sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                overflowWrap: 'anywhere',
                                mt: 0.3,
                                fontSize: '0.76rem',
                                lineHeight: 1.4,
                                color: 'var(--mui-palette-text-secondary)',
                            }}
                        >
                            {row.body}
                        </Typography>
                    )}
                    <Typography component="span" title={time.full} sx={{ display: 'block', mt: 0.4, fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)' }}>
                        {time.label}
                    </Typography>
                </Box>
                <Box
                    component="span"
                    role={unread ? 'img' : undefined}
                    aria-label={unread ? 'Unread' : undefined}
                    sx={{
                        width: 8,
                        height: 8,
                        mt: 0.75,
                        flexShrink: 0,
                        borderRadius: '50%',
                        backgroundColor: unread ? 'var(--crm-text-blue-600)' : 'transparent',
                    }}
                />
            </ButtonBase>
        </Box>
    );
}

/** Unread | All switch: pill tabs on the header band (active = paper + strong border, inactive hover = soft brand). */
function ViewSwitch({ view, unreadCount, onChange }: { view: NotificationView; unreadCount: number; onChange: (view: NotificationView) => void }) {
    const options: { value: NotificationView; label: string }[] = [
        { value: 'unread', label: unreadCount > 0 ? `Unread (${unreadCount > 99 ? '99+' : unreadCount})` : 'Unread' },
        { value: 'all', label: 'All' },
    ];
    return (
        <Box
            role="tablist"
            aria-label="Show notifications"
            sx={{
                display: 'inline-flex',
                gap: 0.5,
                p: 0.4,
                borderRadius: '10px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-hover)',
                maxWidth: '100%',
            }}
        >
            {options.map((option) => {
                const active = option.value === view;
                return (
                    <ButtonBase
                        key={option.value}
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.value)}
                        sx={{
                            minHeight: 32,
                            minWidth: 64,
                            px: 1.5,
                            borderRadius: '8px',
                            fontSize: '0.76rem',
                            fontWeight: active ? 700 : 600,
                            whiteSpace: 'nowrap',
                            border: active ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                            backgroundColor: active ? 'var(--mui-palette-background-paper)' : 'transparent',
                            color: active ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                            transition: 'all 0.15s ease',
                            '&:hover': active
                                ? {}
                                : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                            '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                        }}
                    >
                        {option.label}
                    </ButtonBase>
                );
            })}
        </Box>
    );
}

interface NotificationPanelProps {
    unreadCount: number;
    onOpen: (row: CrmNotification) => void;
    onSettings: () => void;
}

/** The popover's content: mounted only while it is open, so the list (and the business clock) load on opening. */
function NotificationPanel({ unreadCount, onOpen, onSettings }: NotificationPanelProps) {
    const [view, setView] = useState<NotificationView>(readSavedView);
    const unreadOnly = view === 'unread';
    const list = useNotifications({ unreadOnly });
    const markAll = useMarkAllNotificationsRead();
    const clock = useBusinessClock();
    // Row times follow the company formats (activityTime helpers): re-render when they change.
    useDisplayFormats();
    const now = clock.now();
    const loaded = list.data?.pages.flatMap((page) => page.data) ?? [];
    // In Unread, rows read here (a click, Mark all as read) leave the list at once.
    const rows = unreadOnly ? loaded.filter((row) => !row.readAt) : loaded;
    const showOlder = list.hasNextPage && !(unreadOnly && unreadCount === 0);

    const changeView = (next: NotificationView) => {
        setView(next);
        saveView(next);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Header */}
            <Box
                sx={{
                    pl: 2,
                    pr: 1,
                    py: 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderBottom: '1px solid var(--mui-palette-border-main)',
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                }}
            >
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--crm-slate-900)' }} noWrap>
                    Notifications
                    {unreadCount > 0 && (
                        <Box component="span" sx={{ ml: 0.75, fontSize: '0.74rem', fontWeight: 600, color: 'var(--crm-text-blue-700)' }}>
                            {unreadCount > 99 ? '99+' : unreadCount} new
                        </Box>
                    )}
                </Typography>
                <Button
                    onClick={() => markAll.mutate()}
                    disabled={unreadCount === 0 || markAll.isPending}
                    startIcon={<DoneAllIcon sx={{ fontSize: '17px !important' }} />}
                    sx={textButtonSx}
                >
                    Mark all as read
                </Button>
            </Box>
            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                <ViewSwitch view={view} unreadCount={unreadCount} onChange={changeView} />
            </Box>

            {/* List */}
            <Box sx={{ maxHeight: 'min(70vh, 520px)', overflowY: 'auto', overscrollBehavior: 'contain' }}>
                {list.isPending ? (
                    <Box aria-busy="true" sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {[0, 1, 2].map((i) => (
                            <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
                                <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: '10px', flexShrink: 0 }} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Skeleton variant="text" width="70%" />
                                    <Skeleton variant="text" width="90%" />
                                </Box>
                            </Box>
                        ))}
                    </Box>
                ) : list.isError && rows.length === 0 ? (
                    <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mb: 1 }}>
                            {list.error instanceof Error && list.error.message ? list.error.message : 'Notifications could not be loaded.'}
                        </Typography>
                        <Button onClick={() => list.refetch()} sx={textButtonSx}>
                            Try again
                        </Button>
                    </Box>
                ) : rows.length === 0 ? (
                    <Box sx={{ px: 3, py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1 }}>
                        <Box
                            sx={{
                                width: 44,
                                height: 44,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                color: 'var(--crm-text-blue-600)',
                            }}
                        >
                            <NotificationsNoneOutlinedIcon sx={{ fontSize: 22 }} />
                        </Box>
                        <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                            {unreadOnly ? <>You&apos;re all caught up</> : 'No notifications yet'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', maxWidth: 260 }}>
                            {unreadOnly
                                ? 'You have no unread notifications.'
                                : 'Activity reminders, invitations, assignments and contract renewals show up here.'}
                        </Typography>
                        {unreadOnly && (
                            <Button onClick={() => changeView('all')} sx={{ ...textButtonSx, mt: 0.5 }}>
                                Show all notifications
                            </Button>
                        )}
                    </Box>
                ) : (
                    <Box component="ul" aria-label="Notifications" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {rows.map((row) => (
                            <NotificationRow key={row.id} row={row} now={now} timeZone={clock.timeZone} onOpen={onOpen} />
                        ))}
                    </Box>
                )}
                {showOlder && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5, borderTop: '1px solid var(--mui-palette-border-light)' }}>
                        <Button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} sx={textButtonSx}>
                            {list.isFetchingNextPage ? 'Loading…' : 'Show older'}
                        </Button>
                    </Box>
                )}
            </Box>

            {/* Footer */}
            <Box
                sx={{
                    px: 1,
                    py: 0.5,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    borderTop: '1px solid var(--mui-palette-border-main)',
                }}
            >
                <Button onClick={onSettings} startIcon={<SettingsOutlinedIcon sx={{ fontSize: '17px !important' }} />} sx={textButtonSx}>
                    Notification settings
                </Button>
            </Box>
        </Box>
    );
}

/**
 * Navbar bell: the signed-in user's notifications (activity reminders, assignments, invitations, contract renewals).
 * The badge polls the unread count every minute while the tab is visible; the list loads when the popover opens.
 * A row marks itself read and opens its record (activities in the calendar's drawer, contracts on their page).
 * An Unread | All switch (remembered per browser, Unread by default) picks the list; the footer opens
 * My Profile › Notifications (which kinds to get, and the morning summary email preview).
 */
export function NotificationBell() {
    const router = useRouter();
    const { user } = useAuth();
    const { open, close, menuId, setAnchorEl, anchorEl, hoverProps, triggerProps, handleClickAway } = useDropdown();
    const unread = useUnreadNotificationCount({ enabled: Boolean(user) });
    const markRead = useMarkNotificationRead();
    const count = unread.data ?? 0;

    const openRow = (row: CrmNotification) => {
        if (!row.readAt) markRead.mutate(row.id);
        if (!row.href) return;
        close();
        router.push(row.href);
    };

    const openSettings = () => {
        close();
        router.push(ROUTES.PROFILE_NOTIFICATIONS);
    };

    return (
        <>
            <Box {...hoverProps} sx={{ position: 'relative' }}>
                <Box
                    component="button"
                    type="button"
                    ref={setAnchorEl}
                    id="notification-btn"
                    aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
                    {...triggerProps}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 36,
                        height: 36,
                        flexShrink: 0,
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
                        '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                    }}
                >
                    <Badge
                        badgeContent={count}
                        max={99}
                        invisible={count === 0}
                        sx={{
                            '& .MuiBadge-badge': {
                                backgroundColor: 'var(--crm-fill-blue-600)',
                                color: '#ffffff',
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                minWidth: 16,
                                height: 16,
                                padding: '0 4px',
                                boxShadow: '0 0 0 2px var(--mui-palette-background-paper)',
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
                    modifiers={[
                        { name: 'offset', options: { offset: [0, 4] } },
                        { name: 'preventOverflow', options: { padding: EDGE_GAP } },
                    ]}
                >
                    {({ TransitionProps }) => (
                        <Grow {...TransitionProps} timeout={150}>
                            <Paper
                                id={menuId}
                                role="dialog"
                                aria-label="Notifications"
                                elevation={8}
                                {...hoverProps}
                                sx={{
                                    width: { xs: `calc(100vw - ${EDGE_GAP * 2}px)`, sm: 380 },
                                    maxWidth: `calc(100vw - ${EDGE_GAP * 2}px)`,
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    backgroundColor: 'var(--mui-palette-background-paper)',
                                    backgroundImage: 'none',
                                    border: '1px solid var(--mui-palette-border-main)',
                                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                }}
                            >
                                <ClickAwayListener onClickAway={handleClickAway}>
                                    <Box>
                                        <NotificationPanel unreadCount={count} onOpen={openRow} onSettings={openSettings} />
                                    </Box>
                                </ClickAwayListener>
                            </Paper>
                        </Grow>
                    )}
                </Popper>
            </Box>
        </>
    );
}
