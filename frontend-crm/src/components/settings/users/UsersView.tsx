'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    IconButton,
    InputAdornment,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PersonAddAltRoundedIcon from '@mui/icons-material/PersonAddAltRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { AppToast } from '@/components/common/AppToast';
import { TableSkeleton } from '@/components/common/skeletons';
import { UserAvatar } from '@/components/common/UserAvatar';
import { EmptyState, errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { formatDateTime } from '@/utils/date';
import { useAuth } from '@/context/AuthContext';
import { useAdminUsers, useAdminUsersMeta, useDeactivateAdminUser } from '@/hooks/queries/useUserAdmin';
import type { AdminUserDto, AdminUserListParams, UserStatusFilter } from '@/types/userAdmin.types';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { TemporaryPasswordDialog, type TemporaryPasswordInfo } from './TemporaryPasswordDialog';
import { UserFormDrawer } from './UserFormDrawer';
import { UserStatusDialog } from './UserStatusDialog';
import { RoleAccessBadges, UserStatusChips, lastSignInText, userLabel } from './userAdminUi';

const ALL = '';

const STATUS_PILLS: { key: UserStatusFilter; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'all', label: 'All' },
];

const headCellSx = {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--crm-slate-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    backgroundColor: 'var(--mui-palette-background-subtle)',
    whiteSpace: 'nowrap',
    py: 1.1,
} as const;

const cellSx = { py: 1, fontSize: '0.82rem', color: 'var(--crm-slate-700)', verticalAlign: 'middle' } as const;
const mutedSx = { color: 'var(--mui-palette-text-muted)' } as const;

const pillSx = (active: boolean) =>
    ({
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 36,
        px: 1.5,
        borderRadius: '999px',
        fontSize: '0.8rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        border: active ? '1px solid var(--mui-palette-border-strong)' : '1px solid var(--mui-palette-border-main)',
        backgroundColor: active ? 'var(--mui-palette-background-paper)' : 'transparent',
        color: active ? 'var(--crm-text-blue-900)' : 'var(--crm-slate-700)',
        transition: 'all 0.15s ease',
        '&:hover': active ? {} : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', borderColor: 'var(--crm-blue-300)' },
        '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
    }) as const;

const iconButtonSx = {
    width: 36,
    height: 36,
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    transition: 'all 0.15s ease',
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

const nameButtonSx = {
    p: 0,
    border: 0,
    background: 'none',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    fontWeight: 600,
    color: 'var(--crm-text-blue-700)',
    overflowWrap: 'anywhere',
    '&:hover': { color: 'var(--crm-text-blue-600)', textDecoration: 'underline' },
    '&:focus-visible': { outline: 'none', borderRadius: '4px', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
} as const;

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' };

const sessionsText = (n: number | null | undefined) =>
    n === null || n === undefined ? '' : n === 0 ? ' No open sessions.' : ` ${n} session${n === 1 ? ' was' : 's were'} signed out.`;

/** The user's name (opens Edit), with avatar and username. */
function UserIdentity({ user, onOpen }: { user: AdminUserDto; onOpen: () => void }) {
    const name = userLabel(user);
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <UserAvatar name={name} photoUrl={user.photoUrl} size={34} sx={user.isActive ? undefined : { filter: 'grayscale(1)', opacity: 0.7 }} />
            <Box sx={{ minWidth: 0 }}>
                <Box component="button" type="button" onClick={onOpen} sx={nameButtonSx}>
                    {name}
                </Box>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>{user.username}</Typography>
            </Box>
        </Box>
    );
}

/** "Asha Kulkarni" (the manager), marked when they are no longer active. */
function ReportsTo({ user }: { user: AdminUserDto }) {
    if (!user.reportsTo) return <Box component="span" sx={mutedSx}>—</Box>;
    const inactive = !user.reportsTo.isActive;
    return (
        <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
            {user.reportsTo.name}
            {inactive && (
                <Box component="span" sx={{ ml: 0.5, fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                    (inactive)
                </Box>
            )}
        </Box>
    );
}

/**
 * Admin › Users: the people who can sign in to the CRM. Search and filter them, add or edit a user (right drawer),
 * reset a password (shown once), and deactivate / activate. Phones get cards instead of the table.
 */
export function UsersView() {
    const theme = useTheme();
    const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
    const { user: me } = useAuth();

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<UserStatusFilter>('active');
    const [role, setRole] = useState(ALL);
    const [department, setDepartment] = useState(ALL);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);

    const [editing, setEditing] = useState<{ open: boolean; user: AdminUserDto | null; key: number }>({ open: false, user: null, key: 0 });
    const [menu, setMenu] = useState<{ anchor: HTMLElement; user: AdminUserDto } | null>(null);
    const [statusTarget, setStatusTarget] = useState<AdminUserDto | null>(null);
    const [resetTarget, setResetTarget] = useState<AdminUserDto | null>(null);
    const [tempPassword, setTempPassword] = useState<TemporaryPasswordInfo | null>(null);
    const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });
    const showToast = (message: string, severity: Toast['severity'] = 'success') => setToast({ open: true, message, severity });

    // Search waits for a pause in typing.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(0);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const params: AdminUserListParams = {
        search: search || undefined,
        status,
        role: role || undefined,
        department: department || undefined,
        page: page + 1,
        pageSize,
    };
    const list = useAdminUsers(params);
    const meta = useAdminUsersMeta();
    const rows = useMemo(() => list.data?.data ?? [], [list.data]);
    const total = list.data?.meta.total ?? 0;
    const filtered = Boolean(search) || status !== 'active' || Boolean(role) || Boolean(department);

    // A page left past the end (users deactivated or edited out of the filter elsewhere, another tab, a refetch) steps
    // back to the last page that has rows, instead of showing an empty list with no pagination. Adjusted while
    // rendering; always to a lower page, so it settles.
    if (list.data && !list.isPlaceholderData && rows.length === 0 && page > 0) setPage(Math.max(0, Math.min(page - 1, Math.ceil(total / pageSize) - 1)));

    // Signs an inactive user out of every session again: when Redis was down at deactivation their sessions could not be
    // ended then. Deactivate does it for a user who is already inactive, with no other change.
    const signOutSessions = useDeactivateAdminUser();
    const signOutInactive = async (user: AdminUserDto) => {
        const name = userLabel(user);
        try {
            const result = await signOutSessions.mutateAsync(user.id);
            if (result.signedOutSessions === null) showToast(`${name}'s sessions could not be signed out right now. Try again in a moment.`, 'warning');
            else showToast(result.signedOutSessions === 0 ? `${name} has no open sessions.` : `${name} signed out.${sessionsText(result.signedOutSessions)}`);
        } catch (err) {
            showToast(errorMessage(err, `Could not sign ${name} out.`), 'error');
        }
    };

    const openEditor = (user: AdminUserDto | null) => setEditing((e) => ({ open: true, user, key: e.key + 1 }));
    const closeEditor = () => setEditing((e) => ({ ...e, open: false }));

    const resetFilters = () => {
        setSearchInput('');
        setSearch('');
        setStatus('active');
        setRole(ALL);
        setDepartment(ALL);
        setPage(0);
    };

    const statusLabel = status === 'active' ? 'active' : status === 'inactive' ? 'inactive' : '';
    const countText = list.data ? `${total} ${statusLabel ? `${statusLabel} ` : ''}${total === 1 ? 'user' : 'users'}${filtered && (search || role || department) ? ' match' : ''}` : '';

    const rowActions = (user: AdminUserDto) => (
        <Tooltip title="Actions">
            <IconButton
                aria-label={`Actions for ${userLabel(user)}`}
                aria-haspopup="menu"
                onClick={(e) => setMenu({ anchor: e.currentTarget, user })}
                sx={iconButtonSx}
            >
                <MoreVertRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
        </Tooltip>
    );

    const menuUser = menu?.user ?? null;
    const menuIsSelf = Boolean(menuUser && me && menuUser.id === me.id);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Header */}
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                    <Box
                        aria-hidden
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '10px',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            border: '1px solid var(--mui-palette-primary-softBorder)',
                            color: 'var(--crm-text-blue-600)',
                        }}
                    >
                        <ManageAccountsOutlinedIcon />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                            <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                                Users
                            </Typography>
                            {countText && (
                                <Typography component="span" aria-live="polite" sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)' }}>
                                    {countText}
                                </Typography>
                            )}
                        </Box>
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, lineHeight: 1.55 }}>
                            Everyone who can sign in to the CRM. A role decides what they can do: <strong>Admin</strong> roles open this admin panel, and{' '}
                            <strong>Sees all</strong> roles see every record instead of only their own.
                        </Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'stretch', md: 'flex-end' } }}>
                    <Button
                        variant="contained"
                        startIcon={<PersonAddAltRoundedIcon />}
                        onClick={() => openEditor(null)}
                        sx={{ ...primaryButtonSx, color: '#ffffff', flex: { xs: 1, md: 'none' }, minHeight: 40, whiteSpace: 'nowrap' }}
                    >
                        Add user
                    </Button>
                </Box>
            </Box>

            <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                {/* Filters */}
                <Box sx={{ ...panelHeaderSx, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <TextField
                        size="small"
                        placeholder="Search name, username, email"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        sx={{ ...inputSx, width: { xs: '100%', sm: 260 } }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchRoundedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                                    </InputAdornment>
                                ),
                            },
                            htmlInput: { 'aria-label': 'Search users' },
                        }}
                    />
                    <Box role="group" aria-label="Status" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                        {STATUS_PILLS.map((p) => (
                            <Box
                                key={p.key}
                                component="button"
                                type="button"
                                aria-pressed={status === p.key}
                                onClick={() => {
                                    setStatus(p.key);
                                    setPage(0);
                                }}
                                sx={pillSx(status === p.key)}
                            >
                                {p.label}
                            </Box>
                        ))}
                    </Box>
                    <TextField
                        select
                        size="small"
                        value={role}
                        onChange={(e) => {
                            setRole(e.target.value);
                            setPage(0);
                        }}
                        sx={{ ...inputSx, width: { xs: 'calc(50% - 4px)', sm: 190 } }}
                        slotProps={{ htmlInput: { 'aria-label': 'Role' }, select: { displayEmpty: true } }}
                    >
                        <MenuItem value={ALL} sx={{ fontSize: '0.85rem' }}>
                            All roles
                        </MenuItem>
                        {(meta.data?.roles ?? [])
                            // Roles someone in the chosen status holds (not the access roles nobody holds yet).
                            .filter((r) => (status !== 'inactive' && r.userCount > 0) || (status !== 'active' && r.inactiveUserCount > 0) || r.name === role)
                            .map((r) => (
                                <MenuItem key={r.name} value={r.name} sx={{ fontSize: '0.85rem' }}>
                                    {r.name}
                                </MenuItem>
                            ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        value={department}
                        onChange={(e) => {
                            setDepartment(e.target.value);
                            setPage(0);
                        }}
                        sx={{ ...inputSx, width: { xs: 'calc(50% - 4px)', sm: 190 } }}
                        slotProps={{ htmlInput: { 'aria-label': 'Department' }, select: { displayEmpty: true } }}
                    >
                        <MenuItem value={ALL} sx={{ fontSize: '0.85rem' }}>
                            All departments
                        </MenuItem>
                        {(meta.data?.departments ?? []).map((d) => (
                            <MenuItem key={d.name} value={d.name} sx={{ fontSize: '0.85rem' }}>
                                {d.name}
                            </MenuItem>
                        ))}
                    </TextField>
                    {filtered && (
                        <Button size="small" onClick={resetFilters} sx={{ ...secondaryButtonSx, minHeight: 36, ml: { sm: 'auto' } }}>
                            Clear filters
                        </Button>
                    )}
                </Box>

                {/* Also while a page past the end steps back (above), rather than a false empty state. */}
                {list.isLoading || (rows.length === 0 && page > 0 && Boolean(list.data)) ? (
                    <Box sx={{ p: 2 }}>
                        <TableSkeleton rows={6} columns={6} toolbar={false} />
                    </Box>
                ) : list.isError && !list.data ? (
                    <Alert
                        severity="error"
                        sx={{ m: 2, borderRadius: '10px' }}
                        action={
                            <Button size="small" variant="outlined" onClick={() => void list.refetch()} sx={{ ...secondaryButtonSx, minHeight: 32 }}>
                                Try again
                            </Button>
                        }
                    >
                        {errorMessage(list.error, 'Could not load the users.')}
                    </Alert>
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={<ManageAccountsOutlinedIcon />}
                        title={filtered ? 'No users match these filters' : 'No users yet'}
                        description={filtered ? 'Try another search, status, role or department.' : 'Add the people who will use the CRM.'}
                        action={
                            filtered ? (
                                <Button variant="outlined" onClick={resetFilters} sx={secondaryButtonSx}>
                                    Clear filters
                                </Button>
                            ) : (
                                <Button variant="contained" startIcon={<PersonAddAltRoundedIcon />} onClick={() => openEditor(null)} sx={{ ...primaryButtonSx, color: '#ffffff' }}>
                                    Add user
                                </Button>
                            )
                        }
                    />
                ) : (
                    <Box sx={{ opacity: list.isFetching && list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 0.15s ease' }}>
                        {isPhone ? (
                            <Box component="ul" aria-label="Users" sx={{ listStyle: 'none', m: 0, p: 1.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                                {rows.map((user) => (
                                    <Box
                                        component="li"
                                        key={user.id}
                                        sx={{
                                            p: 1.5,
                                            borderRadius: '10px',
                                            border: '1px solid var(--mui-palette-border-main)',
                                            backgroundColor: user.isActive ? 'var(--mui-palette-background-paper)' : 'var(--mui-palette-background-subtle)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 1,
                                            minWidth: 0,
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <UserIdentity user={user} onOpen={() => openEditor(user)} />
                                            </Box>
                                            {rowActions(user)}
                                        </Box>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>
                                            <Box component="span" sx={{ fontWeight: 600 }}>
                                                {user.role}
                                            </Box>
                                            <RoleAccessBadges role={user.role} />
                                        </Box>
                                        {(user.jobTitle || user.department) && (
                                            <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                                                {[user.jobTitle, user.department].filter(Boolean).join(' · ')}
                                            </Typography>
                                        )}
                                        {user.reportsTo && (
                                            <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                                                Reports to <ReportsTo user={user} />
                                            </Typography>
                                        )}
                                        <UserStatusChips user={user} />
                                        <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)' }} title={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : undefined}>
                                            Last sign-in: {lastSignInText(user.lastLoginAt)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        ) : (
                            <TableContainer sx={{ overflowX: 'auto' }}>
                                <Table size="small" sx={{ minWidth: 980 }}>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={headCellSx}>User</TableCell>
                                            <TableCell sx={headCellSx}>Job title</TableCell>
                                            <TableCell sx={headCellSx}>Role</TableCell>
                                            <TableCell sx={headCellSx}>Department</TableCell>
                                            <TableCell sx={headCellSx}>Reports to</TableCell>
                                            <TableCell sx={headCellSx}>Status</TableCell>
                                            <TableCell sx={headCellSx}>Last sign-in</TableCell>
                                            <TableCell sx={{ ...headCellSx, textAlign: 'right' }}>
                                                <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                                                    Actions
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {rows.map((user) => (
                                            <TableRow
                                                key={user.id}
                                                hover
                                                sx={{ ...(user.isActive ? {} : { backgroundColor: 'var(--mui-palette-background-subtle)' }), '&:last-child td': { borderBottom: 0 } }}
                                            >
                                                <TableCell sx={{ ...cellSx, maxWidth: 260 }}>
                                                    <UserIdentity user={user} onOpen={() => openEditor(user)} />
                                                </TableCell>
                                                <TableCell sx={{ ...cellSx, maxWidth: 180, overflowWrap: 'anywhere' }}>
                                                    {user.jobTitle || <Box component="span" sx={mutedSx}>—</Box>}
                                                </TableCell>
                                                <TableCell sx={{ ...cellSx, maxWidth: 200 }}>
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, alignItems: 'flex-start' }}>
                                                        <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
                                                            {user.role}
                                                        </Box>
                                                        <RoleAccessBadges role={user.role} />
                                                    </Box>
                                                </TableCell>
                                                <TableCell sx={{ ...cellSx, maxWidth: 160, overflowWrap: 'anywhere' }}>
                                                    {user.department || <Box component="span" sx={mutedSx}>—</Box>}
                                                </TableCell>
                                                <TableCell sx={{ ...cellSx, maxWidth: 180 }}>
                                                    <ReportsTo user={user} />
                                                </TableCell>
                                                <TableCell sx={{ ...cellSx, maxWidth: 220 }}>
                                                    <UserStatusChips user={user} />
                                                </TableCell>
                                                <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
                                                    <Box component="span" title={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : undefined} sx={user.lastLoginAt ? undefined : mutedSx}>
                                                        {lastSignInText(user.lastLoginAt)}
                                                    </Box>
                                                </TableCell>
                                                <TableCell sx={{ ...cellSx, textAlign: 'right', width: 56 }}>{rowActions(user)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                        <TablePagination
                            component="div"
                            count={total}
                            page={page}
                            onPageChange={(_, p) => setPage(p)}
                            rowsPerPage={pageSize}
                            onRowsPerPageChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(0);
                            }}
                            rowsPerPageOptions={[25, 50, 100]}
                            labelRowsPerPage={isPhone ? 'Per page' : 'Rows per page'}
                            sx={{
                                borderTop: '1px solid var(--mui-palette-border-light)',
                                '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', px: { xs: 1, sm: 2 } },
                            }}
                        />
                    </Box>
                )}
            </Box>

            {/* Row actions */}
            <Menu
                anchorEl={menu?.anchor ?? null}
                open={Boolean(menu)}
                onClose={() => setMenu(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: { borderRadius: '10px', minWidth: 220, border: '1px solid var(--mui-palette-border-main)' } } }}
            >
                <MenuItem
                    onClick={() => {
                        const u = menuUser;
                        setMenu(null);
                        if (u) openEditor(u);
                    }}
                    sx={menuItemSx}
                >
                    <ListItemIcon>
                        <EditOutlinedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Edit" />
                </MenuItem>
                <MenuItem
                    disabled={menuIsSelf || !menuUser?.isActive}
                    onClick={() => {
                        const u = menuUser;
                        setMenu(null);
                        setResetTarget(u);
                    }}
                    sx={menuItemSx}
                >
                    <ListItemIcon>
                        <LockResetRoundedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                        primary="Reset password"
                        secondary={menuIsSelf ? 'Use My Profile for your own' : !menuUser?.isActive ? 'Activate them first' : undefined}
                    />
                </MenuItem>
                {menuUser?.isActive ? (
                    <MenuItem
                        disabled={menuIsSelf}
                        onClick={() => {
                            const u = menuUser;
                            setMenu(null);
                            setStatusTarget(u);
                        }}
                        sx={dangerMenuItemSx}
                    >
                        <ListItemIcon>
                            <PersonOffOutlinedIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary="Deactivate" secondary={menuIsSelf ? 'You can’t deactivate yourself' : undefined} />
                    </MenuItem>
                ) : (
                    [
                        <MenuItem
                            key="activate"
                            onClick={() => {
                                const u = menuUser;
                                setMenu(null);
                                setStatusTarget(u);
                            }}
                            sx={menuItemSx}
                        >
                            <ListItemIcon>
                                <HowToRegOutlinedIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Activate" />
                        </MenuItem>,
                        <MenuItem
                            key="sign-out"
                            disabled={signOutSessions.isPending}
                            onClick={() => {
                                const u = menuUser;
                                setMenu(null);
                                if (u) void signOutInactive(u);
                            }}
                            sx={menuItemSx}
                        >
                            <ListItemIcon>
                                <LogoutRoundedIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Sign out all sessions" secondary="If any were left open at deactivation" />
                        </MenuItem>,
                    ]
                )}
            </Menu>

            {editing.open || editing.key > 0 ? (
                <UserFormDrawer
                    key={editing.key}
                    open={editing.open}
                    user={editing.user}
                    meta={meta.data}
                    onClose={closeEditor}
                    onCreated={(result) => {
                        closeEditor();
                        const name = userLabel(result.user);
                        if (result.temporaryPassword) {
                            setTempPassword({ name, username: result.user.username, password: result.temporaryPassword, reason: 'created' });
                        } else {
                            showToast(`${name} added. They must change the password at first sign-in.`);
                        }
                    }}
                    onSaved={(saved) => {
                        closeEditor();
                        const n = saved.signedOutSessions;
                        if (n === undefined) showToast(`${userLabel(saved)} saved.`);
                        else if (n === null) showToast(`${userLabel(saved)} saved. Their sessions could not be signed out right now, so the new role applies at their next sign-in.`, 'warning');
                        else showToast(`${userLabel(saved)} saved.${n > 0 ? ` ${n} session${n === 1 ? ' was' : 's were'} signed out so the new role applies.` : ''}`);
                    }}
                />
            ) : null}

            <UserStatusDialog
                key={`status-${statusTarget?.id ?? 'none'}`}
                user={statusTarget}
                onClose={() => setStatusTarget(null)}
                onDone={(result, action) => {
                    setStatusTarget(null);
                    // The user leaves an Active / Inactive list: a page they were alone on steps back.
                    if (status !== 'all' && rows.length === 1 && page > 0) setPage((p) => p - 1);
                    const name = userLabel(result);
                    if (action === 'deactivate') {
                        showToast(
                            result.signedOutSessions === null
                                ? `${name} deactivated, but their sessions could not be signed out right now. They can't start new ones. Use “Sign out all sessions” in their row menu to try again.`
                                : `${name} deactivated.${sessionsText(result.signedOutSessions)}`,
                            result.signedOutSessions === null ? 'warning' : 'success',
                        );
                    } else {
                        showToast(`${name} activated.`);
                    }
                }}
            />

            <ResetPasswordDialog
                key={`reset-${resetTarget?.id ?? 'none'}`}
                user={resetTarget}
                onClose={() => setResetTarget(null)}
                onDone={(result) => {
                    const target = resetTarget;
                    setResetTarget(null);
                    if (!target) return;
                    const name = userLabel(target);
                    if (result.temporaryPassword) {
                        setTempPassword({ name, username: target.username, password: result.temporaryPassword, reason: 'reset' });
                    }
                    if (result.signedOutSessions === null) {
                        showToast(`Password reset for ${name}, but their sessions could not be signed out right now.`, 'warning');
                    } else if (!result.temporaryPassword) {
                        showToast(`Password reset for ${name}.${sessionsText(result.signedOutSessions)} They must change it at their next sign-in.`);
                    }
                }}
            />

            <TemporaryPasswordDialog info={tempPassword} onClose={() => setTempPassword(null)} />

            <AppToast
                open={toast.open}
                message={toast.message}
                severity={toast.severity}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
                autoHideDuration={toast.severity === 'success' ? 4000 : 6000}
            />
        </Box>
    );
}

const menuItemSx = {
    minHeight: 44,
    fontSize: '0.85rem',
    color: 'var(--crm-slate-700)',
    '& .MuiListItemIcon-root': { color: 'var(--mui-palette-text-secondary)', minWidth: 34 },
    '& .MuiListItemText-primary': { fontSize: '0.85rem' },
    '& .MuiListItemText-secondary': { fontSize: '0.72rem' },
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
    '&:hover .MuiListItemIcon-root': { color: 'var(--crm-text-blue-700)' },
} as const;

const dangerMenuItemSx = {
    ...menuItemSx,
    '&:hover': { backgroundColor: 'var(--mui-palette-error-soft)', color: 'var(--mui-palette-error-main)' },
    '&:hover .MuiListItemIcon-root': { color: 'var(--mui-palette-error-main)' },
} as const;
