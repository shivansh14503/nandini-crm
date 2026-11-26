'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Box, ButtonBase, InputAdornment, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { TableSkeleton } from '@/components/common/skeletons';
import { EmptyState, errorMessage, inputSx } from '@/components/settings/form-customization/builderUi';
import type { AuditUserActivity, AuditUsers } from '@/services/auditAdmin.service';
import { CategoryBar, UserAvatar, UserBadges, relativeTime } from './auditLogUi';
import { fmtCount } from '@/utils/formats';

type StatusFilter = 'all' | 'active' | 'inactive' | 'withActivity';
type SortKey = 'activity' | 'recent' | 'name' | 'signIn';

const STATUS_CHOICES: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All users' },
    { value: 'active', label: 'Active users' },
    { value: 'inactive', label: 'Inactive users' },
    { value: 'withActivity', label: 'With entries in period' },
];
const SORT_CHOICES: { value: SortKey; label: string }[] = [
    { value: 'activity', label: 'Most active' },
    { value: 'recent', label: 'Recently active' },
    { value: 'name', label: 'Name (A–Z)' },
    { value: 'signIn', label: 'Last sign-in' },
];

/** A count in the company number grouping (Indian until it is changed). */
const count = (value: number) => fmtCount(value);
const newestFirst = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');

/** Desktop: one line per user under a header row. Phones and tablets: name on top, the three facts below it. */
const rowGridSx = {
    display: 'grid',
    alignItems: { xs: 'start', md: 'center' },
    columnGap: 2,
    rowGap: 1,
    gridTemplateColumns: {
        xs: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 20px',
        md: 'minmax(0, 2.4fr) minmax(0, 1.3fr) minmax(0, 1.6fr) minmax(0, 1.3fr) 20px',
    },
    gridTemplateAreas: {
        xs: '"user user user go" "entries last signin ."',
        md: '"user entries last signin go"',
    },
} as const;

/** Label above a fact on phones and tablets; the desktop header row names the columns instead. */
function CellLabel({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            component="span"
            sx={{
                display: { xs: 'block', md: 'none' },
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                color: 'var(--mui-palette-text-muted)',
                mb: 0.25,
            }}
        >
            {children}
        </Typography>
    );
}

function TimeFact({ iso, exact, detail, empty }: { iso: string | null; exact: string | null; detail?: string | null; empty: string }) {
    if (!iso) return <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)' }}>{empty}</Typography>;
    return (
        <Box sx={{ minWidth: 0 }}>
            <Tooltip title={exact ?? ''}>
                <Typography component="span" sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-900)', whiteSpace: 'nowrap' }}>
                    {relativeTime(iso)}
                </Typography>
            </Tooltip>
            {detail && (
                <Typography sx={{ display: { xs: 'none', md: 'block' }, fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {detail}
                </Typography>
            )}
        </Box>
    );
}

function UserRow({ user, onOpen }: { user: AuditUserActivity; onOpen: () => void }) {
    const meta = [user.status === 'system' ? null : user.username, user.role].filter(Boolean).join(' · ');
    return (
        <ButtonBase
            onClick={onOpen}
            sx={{
                ...rowGridSx,
                width: '100%',
                textAlign: 'left',
                px: 2,
                py: { xs: 1.25, md: 1 },
                minHeight: 56,
                borderBottom: '1px solid var(--mui-palette-border-light)',
                transition: 'background-color 0.15s ease',
                '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)' },
                '&:hover .user-row-go': { color: 'var(--crm-text-blue-600)' },
                '&.Mui-focusVisible': { outline: '2px solid rgb(var(--crm-accent-rgb) / 0.4)', outlineOffset: -2 },
            }}
        >
            <Box sx={{ gridArea: 'user', display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                <UserAvatar user={user} />
                <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                            {user.name}
                        </Typography>
                        <UserBadges user={user} />
                    </Box>
                    {meta && (
                        <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</Typography>
                    )}
                </Box>
            </Box>
            <Box sx={{ gridArea: 'entries', minWidth: 0 }}>
                <CellLabel>Entries</CellLabel>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: user.total ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-muted)' }}>{count(user.total)}</Typography>
                    {user.failedSignIns > 0 && (
                        <Tooltip title={`${count(user.failedSignIns)} failed sign-in${user.failedSignIns === 1 ? '' : 's'} in this period`}>
                            <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--crm-amber-700)', whiteSpace: 'nowrap', cursor: 'help' }}>
                                {count(user.failedSignIns)} failed
                            </Typography>
                        </Tooltip>
                    )}
                </Box>
                <Tooltip title={`Data ${count(user.data)} · Configuration ${count(user.config)} · Security ${count(user.security)}`}>
                    <Box sx={{ mt: 0.5 }}>
                        <CategoryBar data={user.data} config={user.config} security={user.security} />
                    </Box>
                </Tooltip>
            </Box>
            <Box sx={{ gridArea: 'last', minWidth: 0 }}>
                <CellLabel>Last active</CellLabel>
                <TimeFact iso={user.lastActivityAt} exact={user.lastActivity} detail={user.lastActivityLabel} empty="No entries" />
            </Box>
            <Box sx={{ gridArea: 'signin', minWidth: 0 }}>
                <CellLabel>Last sign-in</CellLabel>
                <TimeFact iso={user.lastLoginAt} exact={user.lastLogin} empty={user.status === 'system' ? '—' : 'Never'} />
            </Box>
            <Box className="user-row-go" sx={{ gridArea: 'go', alignSelf: 'center', display: 'flex', color: 'var(--mui-palette-text-muted)', transition: 'color 0.15s ease' }}>
                <ChevronRightRoundedIcon fontSize="small" />
            </Box>
        </ButtonBase>
    );
}

const headSx = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--crm-slate-600)', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' } as const;

/**
 * Users tab: everyone who can appear in the log, with their entries in the period, when they were last active and
 * last signed in; a click opens that user's activity log. Returns the toolbar controls (search, status, sort) for the
 * panel header and the list for its body, like `useAuditExport`.
 */
export function useAuditUsersList({
    data,
    isLoading,
    error,
    periodLabel,
    onOpen,
}: {
    data: AuditUsers | undefined;
    isLoading: boolean;
    error: unknown;
    periodLabel: string;
    onOpen: (username: string) => void;
}) {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [sort, setSort] = useState<SortKey>('activity');

    const users = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const shown = (data?.users ?? []).filter((user) => {
            if (status === 'active' && user.status !== 'active') return false;
            if (status === 'inactive' && user.status !== 'inactive') return false;
            if (status === 'withActivity' && user.total === 0) return false;
            if (!needle) return true;
            return [user.name, user.username, user.role, user.department, user.email].some((value) => value?.toLowerCase().includes(needle));
        });
        const byName = (a: AuditUserActivity, b: AuditUserActivity) => a.name.localeCompare(b.name);
        // The background jobs go last unless they are what the sort asks for.
        const systemLast = (a: AuditUserActivity, b: AuditUserActivity) => Number(a.status === 'system') - Number(b.status === 'system');
        switch (sort) {
            case 'recent':
                return shown.sort((a, b) => newestFirst(a.lastActivityAt, b.lastActivityAt) || byName(a, b));
            case 'name':
                return shown.sort((a, b) => systemLast(a, b) || byName(a, b));
            case 'signIn':
                return shown.sort((a, b) => systemLast(a, b) || newestFirst(a.lastLoginAt, b.lastLoginAt) || byName(a, b));
            default:
                return shown.sort((a, b) => b.total - a.total || newestFirst(a.lastActivityAt, b.lastActivityAt) || byName(a, b));
        }
    }, [data, search, status, sort]);

    const toolbar = (
        <>
            <TextField
                size="small"
                placeholder="Search name, username, role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ ...inputSx, width: { xs: '100%', sm: 250 } }}
                slotProps={{
                    htmlInput: { 'aria-label': 'Search users' },
                    input: {
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchRoundedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                            </InputAdornment>
                        ),
                    },
                }}
            />
            <TextField
                select
                size="small"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                sx={{ ...inputSx, width: { xs: 'calc(50% - 4px)', sm: 190 } }}
                slotProps={{ htmlInput: { 'aria-label': 'Which users' } }}
            >
                {STATUS_CHOICES.map((c) => (
                    <MenuItem key={c.value} value={c.value} sx={{ fontSize: '0.85rem' }}>
                        {c.label}
                    </MenuItem>
                ))}
            </TextField>
            <TextField
                select
                size="small"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                sx={{ ...inputSx, width: { xs: 'calc(50% - 4px)', sm: 170 } }}
                slotProps={{ htmlInput: { 'aria-label': 'Sort users' } }}
            >
                {SORT_CHOICES.map((c) => (
                    <MenuItem key={c.value} value={c.value} sx={{ fontSize: '0.85rem' }}>
                        {c.label}
                    </MenuItem>
                ))}
            </TextField>
        </>
    );

    const body = isLoading ? (
        <Box sx={{ p: 2 }}>
            <TableSkeleton rows={8} columns={4} toolbar={false} />
        </Box>
    ) : error ? (
        <Alert severity="error" sx={{ m: 2 }}>
            {errorMessage(error, 'Could not load the users.')}
        </Alert>
    ) : users.length === 0 ? (
        <EmptyState
            icon={<GroupsOutlinedIcon />}
            title="No users"
            description={search.trim() || status !== 'all' ? 'No user matches this search.' : 'There are no users to show yet.'}
        />
    ) : (
        <Box>
            <Box sx={{ ...rowGridSx, display: { xs: 'none', md: 'grid' }, px: 2, py: 1.1, backgroundColor: 'var(--mui-palette-background-subtle)', borderBottom: '1px solid var(--mui-palette-border-main)' }}>
                <Typography sx={{ ...headSx, gridArea: 'user' }}>User</Typography>
                <Typography sx={{ ...headSx, gridArea: 'entries', whiteSpace: 'normal' }}>Entries · {periodLabel}</Typography>
                <Typography sx={{ ...headSx, gridArea: 'last' }}>Last active</Typography>
                <Typography sx={{ ...headSx, gridArea: 'signin' }}>Last sign-in</Typography>
            </Box>
            {users.map((user) => (
                <UserRow key={user.username} user={user} onOpen={() => onOpen(user.username)} />
            ))}
            <Box sx={{ px: 2, py: 1.25 }}>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                    {count(users.length)} user{users.length === 1 ? '' : 's'}
                    {users.length !== (data?.users.length ?? 0) ? ` of ${count(data?.users.length ?? 0)}` : ''} · Entries: {periodLabel} · Last active and last sign-in: any
                    time. Open a user to see everything they did and export it.
                </Typography>
            </Box>
        </Box>
    );

    return { toolbar, body };
}
