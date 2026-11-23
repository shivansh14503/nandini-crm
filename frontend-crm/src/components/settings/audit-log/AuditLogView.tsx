'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Badge as MuiBadge,
    Box,
    Button,
    ButtonBase,
    CircularProgress,
    InputAdornment,
    MenuItem,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import LockPersonOutlinedIcon from '@mui/icons-material/LockPersonOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { ActiveFilterChips, TableFilterModal, useFilterController, type FilterCondition, type FilterCriteria } from '@/components/common/TableFilter';
import { TableSkeleton } from '@/components/common/skeletons';
import { EmptyState, errorMessage, inputSx, panelHeaderSx, PillTabs, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { auditAdminService, type AuditListItem } from '@/services/auditAdmin.service';
import { AuditEventsChart, shortDate } from './AuditEventsChart';
import { AuditEntryDrawer } from './AuditEntryDrawer';
import { useAuditExport } from './AuditExportButton';
import { AuditIntegrityPanel } from './AuditIntegrityPanel';
import { AUDIT_FILTER_SCOPE, CATEGORY_TABS, SOURCE_LABELS, aggregateRange, criteriaToQuery, useAuditFilterFields, type CategoryTab } from './auditLogFilter';
import { AUDIT_LOG_KEY, ActionPill, ModuleDot, RecordCell, displayUser } from './auditLogUi';

const PAGE_SIZE = 50;

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
const cellSx = { py: 0.9, fontSize: '0.8rem', color: 'var(--crm-slate-700)', verticalAlign: 'top' } as const;

/** Quick date choices on the filter bar; each is the `time` condition of the applied filter. */
const DATE_CHOICES: { value: string; label: string }[] = [
    { value: 'all', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7_days', label: 'Last 7 days' },
    { value: 'last_30_days', label: 'Last 30 days' },
    { value: 'this_month', label: 'This month' },
    { value: 'between', label: 'Custom range…' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const count = (value: number) => value.toLocaleString('en-IN');

/** The summary's period (instants from the API) as calendar days: `21 Nov`, or `1 Nov – 21 Nov`. */
function periodLabel(fromIso: string, toIso: string): string {
    const [from, to] = [localYmd(new Date(fromIso)), localYmd(new Date(toIso))];
    const multiYear = from.slice(0, 4) !== to.slice(0, 4);
    return from === to ? shortDate(from, multiYear) : `${shortDate(from, multiYear)} – ${shortDate(to, multiYear)}`;
}

function StatTile({ label, value, hint, icon, alert, onClick }: { label: string; value: number | undefined; hint: string; icon: React.ReactNode; alert?: boolean; onClick?: () => void }) {
    const tile = (
        <ButtonBase
            onClick={onClick}
            disabled={!onClick}
            sx={{
                ...surfaceSx,
                p: 1.75,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                gap: 1.25,
                textAlign: 'left',
                width: '100%',
                transition: 'border-color 0.15s ease, background-color 0.15s ease',
                '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                '&.Mui-disabled': { opacity: 1 },
            }}
        >
            <Box
                sx={{
                    width: 34,
                    height: 34,
                    borderRadius: '9px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '& svg': { fontSize: 19 },
                    ...(alert
                        ? { color: 'var(--crm-amber-700)', backgroundColor: 'var(--mui-palette-warning-soft)', border: '1px solid var(--mui-palette-warning-softBorder)' }
                        : { color: 'var(--crm-text-blue-600)', backgroundColor: 'var(--mui-palette-primary-soft)', border: '1px solid var(--mui-palette-primary-softBorder)' }),
                }}
            >
                {icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)' }}>{label}</Typography>
                {value === undefined ? (
                    <Skeleton width={48} height={30} />
                ) : (
                    <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--crm-slate-900)', lineHeight: 1.3 }}>{count(value)}</Typography>
                )}
                <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)' }}>{hint}</Typography>
            </Box>
        </ButtonBase>
    );
    return onClick ? <Tooltip title="Show these entries">{tile}</Tooltip> : tile;
}

/** Admin › Audit Log: every change in the CRM, sign-ins and refused access, with who / when / where and before / after. */
export function AuditLogView() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { users } = useMasterData();
    const [tab, setTab] = useState<CategoryTab>('all');
    const [searchInput, setSearchInput] = useState('');
    const [q, setQ] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Search applies after a short pause in typing.
    useEffect(() => {
        const timer = setTimeout(() => setQ(searchInput.trim()), 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // Filter options: whatever occurred in the last year (one cached request).
    const facets = useQuery({
        queryKey: [...AUDIT_LOG_KEY, 'facets'],
        queryFn: () => {
            const today = new Date();
            const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 365);
            return auditAdminService.facets({ from: localYmd(from), to: localYmd(today) });
        },
        staleTime: 5 * 60 * 1000,
    });
    const fields = useAuditFilterFields(facets.data);
    const controller = useFilterController({ module: AUDIT_FILTER_SCOPE, title: 'Audit Log', fields });
    const { criteria } = controller;

    const query = useMemo(() => criteriaToQuery(criteria, fields.byKey, tab, q), [criteria, fields.byKey, tab, q]);
    const range = useMemo(() => aggregateRange(query), [query]);

    const stats = useQuery({ queryKey: [...AUDIT_LOG_KEY, 'stats', range], queryFn: () => auditAdminService.stats(range) });
    const list = useInfiniteQuery({
        queryKey: [...AUDIT_LOG_KEY, 'list', query],
        queryFn: ({ pageParam }) => auditAdminService.list(query, pageParam, PAGE_SIZE),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
    const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

    const userNames = useMemo(() => {
        const names = new Map<string, string>();
        for (const u of users) names.set(u.username, u.name || u.username);
        for (const u of facets.data?.users ?? []) if (!names.has(u.value)) names.set(u.value, u.label);
        return names;
    }, [users, facets.data]);

    /** Replaces the applied filter (keeps nothing else) and shows the list from the top. */
    const showOnly = (conditions: Record<string, FilterCondition>) => {
        setTab('all');
        setSearchInput('');
        setQ('');
        setSelectedId(null);
        controller.apply({ conditions });
    };
    const setTime = (time: FilterCondition | null) => {
        const conditions = { ...(criteria?.conditions ?? {}) };
        if (time) conditions.time = time;
        else delete conditions.time;
        if (Object.keys(conditions).length) controller.apply({ ...(criteria ?? {}), conditions } as FilterCriteria);
        else controller.clear();
    };

    const time = criteria?.conditions.time;
    const dateChoice = !time ? 'all' : DATE_CHOICES.some((c) => c.value === time.op) ? time.op : 'between';
    const summaryLabel = !query.from && !query.to ? 'Last 30 days' : stats.data ? periodLabel(stats.data.from, stats.data.to) : '';

    const refresh = () => queryClient.invalidateQueries({ queryKey: AUDIT_LOG_KEY });
    const exporter = useAuditExport(query);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Header + integrity */}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 400px' } }}>
                <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <Box
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
                        <SecurityOutlinedIcon />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                            Audit Log
                        </Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, lineHeight: 1.55 }}>
                            Every change made in the CRM, with the values before and after, who made it, when, from which screen and IP address. Sign-ins, failed sign-ins
                            and refused access are recorded too. Entries can&apos;t be edited or deleted; they are kept forever. Open an entry to undo a change or restore a
                            deleted record.
                        </Typography>
                    </Box>
                </Box>
                <AuditIntegrityPanel />
            </Box>

            {/* Summary strip */}
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' } }}>
                <StatTile label="Events" value={stats.data?.total} hint={summaryLabel} icon={<EventNoteOutlinedIcon />} />
                <StatTile label="Today" value={stats.data?.today} hint="Since midnight" icon={<TodayOutlinedIcon />} onClick={() => showOnly({ time: { op: 'today' } })} />
                <StatTile
                    label="Failed sign-ins"
                    value={stats.data?.failedSignIns24h}
                    hint="Last 24 hours"
                    alert={(stats.data?.failedSignIns24h ?? 0) > 0}
                    icon={<LockPersonOutlinedIcon />}
                    onClick={() => showOnly({ action: { op: 'in', values: ['LOGIN_FAILED'] }, time: { op: 'last_7_days' } })}
                />
                <StatTile
                    label="Refused access"
                    value={stats.data?.accessDenied24h}
                    hint="Last 24 hours"
                    alert={(stats.data?.accessDenied24h ?? 0) > 0}
                    icon={<BlockOutlinedIcon />}
                    onClick={() => showOnly({ action: { op: 'in', values: ['ACCESS_DENIED'] }, time: { op: 'last_7_days' } })}
                />
                <StatTile
                    label="Deletes"
                    value={stats.data?.deletes7d}
                    hint="Last 7 days"
                    icon={<DeleteOutlineRoundedIcon />}
                    onClick={() => showOnly({ action: { op: 'in', values: ['DELETE'] }, time: { op: 'last_7_days' } })}
                />
            </Box>

            {/* Chart + most active users */}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 1fr)' } }}>
                <Box sx={{ ...surfaceSx, p: 2, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.25, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--crm-slate-900)' }}>Events per day</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>{summaryLabel}</Typography>
                    </Box>
                    {stats.isError ? (
                        <Alert severity="error">{errorMessage(stats.error, 'Could not load the summary.')}</Alert>
                    ) : stats.data ? (
                        <AuditEventsChart days={stats.data.eventsPerDay} onPickDay={(date) => setTime({ op: 'equals', value: date })} />
                    ) : (
                        <Skeleton variant="rounded" height={160} />
                    )}
                </Box>
                <Box sx={{ ...surfaceSx, p: 2, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.25, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--crm-slate-900)' }}>Most active users</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>{summaryLabel}</Typography>
                    </Box>
                    {!stats.data ? (
                        <Skeleton variant="rounded" height={140} />
                    ) : stats.data.mostActiveUsers.length === 0 ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>No user activity in this period.</Typography>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {stats.data.mostActiveUsers.map((u) => {
                                const share = u.count / Math.max(1, stats.data!.mostActiveUsers[0].count);
                                return (
                                    <ButtonBase
                                        key={u.username}
                                        onClick={() => showOnly({ user: { op: 'in', values: [u.username] }, ...(time ? { time } : {}) })}
                                        sx={{
                                            display: 'grid',
                                            gridTemplateColumns: 'minmax(0, 1fr) auto',
                                            gap: 0.5,
                                            px: 1,
                                            py: 0.75,
                                            borderRadius: '8px',
                                            textAlign: 'left',
                                            '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)' },
                                        }}
                                    >
                                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {u.label}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-700)' }}>{count(u.count)}</Typography>
                                        <Box sx={{ gridColumn: '1 / -1', height: 4, borderRadius: 2, backgroundColor: 'var(--mui-palette-background-hover)', overflow: 'hidden' }}>
                                            <Box sx={{ width: `${share * 100}%`, height: '100%', borderRadius: 2, backgroundColor: 'var(--crm-chart-audit-data)' }} />
                                        </Box>
                                    </ButtonBase>
                                );
                            })}
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Entries */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={{ ...panelHeaderSx, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    <PillTabs items={CATEGORY_TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={setTab} />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                        <TextField
                            size="small"
                            placeholder="Search record, user, IP, value…"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            sx={{ ...inputSx, width: { xs: '100%', sm: 280 } }}
                            slotProps={{
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
                            value={dateChoice}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value === 'all') setTime(null);
                                else if (value === 'between') setTime({ op: 'between', value: localYmd(new Date(Date.now() - 6 * 86_400_000)), value2: localYmd(new Date()) });
                                else setTime({ op: value as FilterCondition['op'] });
                            }}
                            sx={{ ...inputSx, width: { xs: '100%', sm: 170 } }}
                            slotProps={{ htmlInput: { 'aria-label': 'Date' } }}
                        >
                            {DATE_CHOICES.map((c) => (
                                <MenuItem key={c.value} value={c.value} sx={{ fontSize: '0.85rem' }}>
                                    {c.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        {dateChoice === 'between' && time && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                <TextField
                                    type="date"
                                    size="small"
                                    value={time.value ?? ''}
                                    onChange={(e) => setTime({ op: 'between', value: e.target.value, value2: time.op === 'between' ? time.value2 : time.value })}
                                    sx={{ ...inputSx, width: 160 }}
                                    slotProps={{ htmlInput: { 'aria-label': 'From date' } }}
                                />
                                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>to</Typography>
                                <TextField
                                    type="date"
                                    size="small"
                                    value={time.op === 'between' ? (time.value2 ?? '') : (time.value ?? '')}
                                    onChange={(e) => setTime({ op: 'between', value: time.value, value2: e.target.value })}
                                    sx={{ ...inputSx, width: 160 }}
                                    slotProps={{ htmlInput: { 'aria-label': 'To date' } }}
                                />
                            </Box>
                        )}
                        <MuiBadge
                            badgeContent={controller.activeCount}
                            invisible={controller.activeCount === 0}
                            sx={{ '& .MuiBadge-badge': { backgroundColor: 'var(--crm-fill-blue-600)', color: '#fff', fontWeight: 700 } }}
                        >
                            <Button variant="outlined" size="small" startIcon={<FilterListRoundedIcon />} sx={{ ...secondaryButtonSx, height: 36 }} onClick={controller.open}>
                                Filter
                            </Button>
                        </MuiBadge>
                        <Box sx={{ flex: 1 }} />
                        <Tooltip title="Load the newest entries">
                            <Button variant="outlined" size="small" startIcon={<RefreshRoundedIcon />} sx={{ ...secondaryButtonSx, height: 36 }} onClick={() => void refresh()}>
                                Refresh
                            </Button>
                        </Tooltip>
                        {exporter.button}
                    </Box>
                </Box>
                <ActiveFilterChips controller={controller} />
                {exporter.status}

                {list.isLoading ? (
                    <Box sx={{ p: 2 }}>
                        <TableSkeleton rows={8} columns={7} toolbar={false} />
                    </Box>
                ) : list.isError ? (
                    <Alert severity="error" sx={{ m: 2 }}>
                        {errorMessage(list.error, 'Could not load the audit log.')}
                    </Alert>
                ) : rows.length === 0 ? (
                    <EmptyState title="No entries" description="Nothing in the audit log matches these filters." />
                ) : (
                    <>
                        <TableContainer sx={{ overflowX: 'auto' }}>
                            <Table size="small" sx={{ minWidth: 1120 }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={headCellSx}>Time</TableCell>
                                        <TableCell sx={headCellSx}>User</TableCell>
                                        <TableCell sx={headCellSx}>Action</TableCell>
                                        <TableCell sx={headCellSx}>Module</TableCell>
                                        <TableCell sx={headCellSx}>Record</TableCell>
                                        <TableCell sx={headCellSx}>Summary</TableCell>
                                        <TableCell sx={headCellSx}>Source</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((row: AuditListItem) => (
                                        <TableRow
                                            key={row.id}
                                            hover
                                            selected={row.id === selectedId}
                                            onClick={() => setSelectedId(row.id)}
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') setSelectedId(row.id);
                                            }}
                                            sx={{
                                                cursor: 'pointer',
                                                '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: 'var(--mui-palette-primary-soft)' },
                                                '&:focus-visible': { outline: '2px solid rgb(var(--crm-accent-rgb) / 0.4)', outlineOffset: -2 },
                                            }}
                                        >
                                            <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{row.time}</TableCell>
                                            <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', color: 'var(--crm-slate-900)', fontWeight: 600 }}>
                                                {displayUser(row.changedBy, userNames)}
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                <ActionPill action={row.action} label={row.actionLabel} />
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                <ModuleDot module={row.module} label={row.moduleLabel} />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, minWidth: 200, maxWidth: 280, wordBreak: 'break-word' }}>
                                                <RecordCell item={row} onOpen={(href) => router.push(href)} />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, minWidth: 220, maxWidth: 380, wordBreak: 'break-word' }}>{row.summary}</TableCell>
                                            <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', color: 'var(--mui-palette-text-secondary)' }}>
                                                {row.source ? (SOURCE_LABELS[row.source] ?? row.source) : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, borderTop: '1px solid var(--mui-palette-border-main)' }}>
                            <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', flex: 1 }}>
                                Showing the newest {count(rows.length)} entr{rows.length === 1 ? 'y' : 'ies'}
                                {list.hasNextPage ? '' : ' (all of them)'}
                            </Typography>
                            {list.hasNextPage && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    sx={secondaryButtonSx}
                                    disabled={list.isFetchingNextPage}
                                    startIcon={list.isFetchingNextPage ? <CircularProgress size={14} /> : undefined}
                                    onClick={() => void list.fetchNextPage()}
                                >
                                    Load {PAGE_SIZE} older
                                </Button>
                            )}
                        </Box>
                    </>
                )}
            </Box>

            <TableFilterModal controller={controller} sortOptions={[]} />
            <AuditEntryDrawer
                id={selectedId}
                userNames={userNames}
                onClose={() => setSelectedId(null)}
                onOpenEntry={setSelectedId}
                onOpenRecord={(href) => router.push(href)}
                onRecordHistory={(entry) => showOnly({ module: { op: 'in', values: [entry.module] }, entityId: { op: 'contains', value: entry.entityId } })}
                onUserDay={(entry) => showOnly({ user: { op: 'in', values: [entry.changedBy] }, time: { op: 'equals', value: localYmd(new Date(entry.createdAt)) } })}
            />
        </Box>
    );
}
