'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    IconButton,
    InputAdornment,
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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { TableSkeleton } from '@/components/common/skeletons';
import { EmptyState, errorMessage, inputSx, panelHeaderSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { usePeople } from '@/hooks/queries/useIntegrationsAdmin';
import type { Person, UserEmailIssue } from '@/types/integration.types';
import { CompanyEmailDialog } from './CompanyEmailDialog';
import { StatusChip, hintSx, type ChipTone } from './integrationUi';

type PeopleFilter = 'all' | 'issues' | UserEmailIssue;

const FILTERS: { key: PeopleFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'issues', label: 'Email issues' },
    { key: 'missing', label: 'Missing' },
    { key: 'duplicate', label: 'Duplicate' },
    { key: 'not_company', label: 'Other domain' },
];

const ISSUE_CHIP: Record<UserEmailIssue, { tone: ChipTone; label: string; title: string }> = {
    missing: { tone: 'warning', label: 'Missing', title: 'No company email: this person can’t connect a calendar until one is set.' },
    duplicate: { tone: 'error', label: 'Duplicate', title: 'Another active person has the same email. Each person needs their own.' },
    not_company: { tone: 'warning', label: 'Other domain', title: 'Not one of the company email domains.' },
};

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
const cellSx = { py: 0.9, fontSize: '0.82rem', color: 'var(--crm-slate-700)' } as const;

const pillSx = (active: boolean) =>
    ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: 32,
        px: 1.25,
        borderRadius: '999px',
        fontSize: '0.78rem',
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

const matches = (p: Person, filter: PeopleFilter) => (filter === 'all' ? true : filter === 'issues' ? p.emailIssue !== null : p.emailIssue === filter);

/** People and their company emails (calendar connections join in P2-2). */
export function PeopleTable({ companyDomains, onToast }: { companyDomains: string[]; onToast: (message: string, severity?: 'success' | 'error') => void }) {
    const people = usePeople();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<PeopleFilter>('all');
    const [editing, setEditing] = useState<Person | null>(null);

    const all = useMemo(() => people.data ?? [], [people.data]);
    const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((p) => matches(p, f.key)).length])) as Record<PeopleFilter, number>, [all]);
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return all.filter(
            (p) => matches(p, filter) && (!q || [p.fullName, p.username, p.email ?? '', p.department ?? ''].some((v) => v.toLowerCase().includes(q))),
        );
    }, [all, filter, search]);

    return (
        <Box component="section" aria-labelledby="people-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 200 }}>
                        <Typography id="people-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)' }}>
                            People
                        </Typography>
                        <Typography sx={hintSx}>
                            Each person connects a calendar with their own company email. Fix missing or duplicate emails before turning a provider on.
                        </Typography>
                    </Box>
                    <TextField
                        size="small"
                        placeholder="Search people"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        sx={{ ...inputSx, width: { xs: '100%', sm: 240 } }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchRoundedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                                    </InputAdornment>
                                ),
                            },
                            htmlInput: { 'aria-label': 'Search people' },
                        }}
                    />
                </Box>
                <Box role="group" aria-label="Filter people" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {FILTERS.map((f) => (
                        <Box key={f.key} component="button" type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} sx={pillSx(filter === f.key)}>
                            {f.label}
                            <Box component="span" sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 700 }}>
                                {people.data ? counts[f.key] : ''}
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Box>

            {people.isLoading ? (
                <Box sx={{ p: 2 }}>
                    <TableSkeleton rows={6} columns={5} toolbar={false} />
                </Box>
            ) : people.isError && !people.data ? (
                // Only when nothing is cached: a failed background refetch keeps the last rows on screen.
                <Alert severity="error" sx={{ m: 2 }}>
                    {errorMessage(people.error, 'Could not load people.')}
                </Alert>
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={<GroupsOutlinedIcon />}
                    title={search || filter !== 'all' ? 'Nobody matches' : 'No active people'}
                    description={filter === 'issues' && !search ? 'Every active person has a unique company email.' : undefined}
                />
            ) : (
                <TableContainer sx={{ overflowX: 'auto', maxHeight: { xs: 'none', md: 560 } }}>
                    <Table size="small" stickyHeader sx={{ minWidth: 760 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={headCellSx}>Person</TableCell>
                                <TableCell sx={headCellSx}>Role</TableCell>
                                <TableCell sx={headCellSx}>Company email</TableCell>
                                <TableCell sx={headCellSx}>Email check</TableCell>
                                <TableCell sx={headCellSx}>Calendar</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map((p) => {
                                const issue = p.emailIssue ? ISSUE_CHIP[p.emailIssue] : null;
                                return (
                                    <TableRow key={p.username} hover>
                                        <TableCell sx={{ ...cellSx, maxWidth: 240 }}>
                                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{p.fullName || p.username}</Typography>
                                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                                                {p.username}
                                                {p.department ? ` · ${p.department}` : ''}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{p.role}</TableCell>
                                        <TableCell sx={{ ...cellSx, maxWidth: 300 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                                                <Typography
                                                    sx={{
                                                        fontSize: '0.82rem',
                                                        color: p.email ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-muted)',
                                                        overflowWrap: 'anywhere',
                                                        minWidth: 0,
                                                        flex: 1,
                                                    }}
                                                >
                                                    {p.email ?? 'Not set'}
                                                </Typography>
                                                <Tooltip title="Edit company email">
                                                    <IconButton
                                                        size="small"
                                                        aria-label={`Edit the company email of ${p.fullName || p.username}`}
                                                        onClick={() => setEditing(p)}
                                                        sx={{
                                                            width: 34,
                                                            height: 34,
                                                            flexShrink: 0,
                                                            borderRadius: '8px',
                                                            color: 'var(--mui-palette-text-secondary)',
                                                            transition: 'all 0.15s ease',
                                                            '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                                                        }}
                                                    >
                                                        <EditOutlinedIcon sx={{ fontSize: 17 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            {issue ? (
                                                <StatusChip tone={issue.tone} title={issue.title}>
                                                    {issue.label}
                                                </StatusChip>
                                            ) : (
                                                <StatusChip tone="success">OK</StatusChip>
                                            )}
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            {p.connection ? (
                                                <StatusChip tone={p.connection.status === 'active' ? 'success' : 'warning'}>{p.connection.status === 'active' ? 'Connected' : 'Needs attention'}</StatusChip>
                                            ) : (
                                                <StatusChip tone="neutral">Not connected</StatusChip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <CompanyEmailDialog
                key={editing?.username ?? 'none'}
                person={editing}
                companyDomains={companyDomains}
                onClose={() => setEditing(null)}
                onSaved={(saved) => {
                    setEditing(null);
                    onToast(saved.email ? `Saved ${saved.email} for ${saved.fullName || saved.username}.` : `Cleared the email of ${saved.fullName || saved.username}.`);
                }}
            />
        </Box>
    );
}
