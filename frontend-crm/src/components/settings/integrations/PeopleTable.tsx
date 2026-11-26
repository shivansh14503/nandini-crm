'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
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
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { TableSkeleton } from '@/components/common/skeletons';
import { EmptyState, errorMessage, inputSx, panelHeaderSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { usePeople } from '@/hooks/queries/useIntegrationsAdmin';
import type { Person, PersonCalendar, PersonWebhook, ProviderAdmin, UserEmailIssue } from '@/types/integration.types';
import { CalendarChoiceDialog } from './CalendarChoiceDialog';
import { CompanyEmailDialog } from './CompanyEmailDialog';
import { CALENDAR_PROVIDER_LABELS, NOT_SYNCED_LABELS, PERSON_WEBHOOK_LABELS, StatusChip, formatDateTime, hintSx, type ChipTone } from './integrationUi';

/** People filters: `calendar_problem` is also what the admins' daily digest opens (`?tab=people&issue=calendar_problem`). */
export type PeopleFilter = 'all' | 'calendar_problem' | 'not_synced' | 'issues' | UserEmailIssue;

const FILTERS: { key: PeopleFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'calendar_problem', label: 'Calendar problems' },
    { key: 'not_synced', label: 'Not synced' },
    { key: 'issues', label: 'Email issues' },
    { key: 'missing', label: 'Missing' },
    { key: 'duplicate', label: 'Duplicate' },
    { key: 'not_company', label: 'Other domain' },
];

export const isPeopleFilter = (value: string | null | undefined): value is PeopleFilter => FILTERS.some((f) => f.key === value);

const ISSUE_CHIP: Record<UserEmailIssue, { tone: ChipTone; label: string; title: string }> = {
    missing: { tone: 'warning', label: 'Missing', title: 'No company email: this person’s calendar can’t sync until one is set.' },
    duplicate: { tone: 'error', label: 'Duplicate', title: 'Another active person has the same email. Each person needs their own.' },
    not_company: { tone: 'warning', label: 'Other domain', title: 'Not one of the company email domains, so the calendar does not sync.' },
};

const SYNC_CHIP: Record<string, { tone: ChipTone; label: string }> = {
    pending: { tone: 'info', label: 'Setting up' },
    ok: { tone: 'success', label: 'Synced' },
    error: { tone: 'error', label: 'Problem' },
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

const iconButtonSx = {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    transition: 'all 0.15s ease',
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

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

function matches(p: Person, filter: PeopleFilter): boolean {
    switch (filter) {
        case 'all':
            return true;
        case 'calendar_problem':
            return p.calendar.connection?.status === 'error';
        case 'not_synced':
            return !p.calendar.connection;
        case 'issues':
            return p.emailIssue !== null;
        default:
            return p.emailIssue === filter;
    }
}

/** The webhook chip's tooltip (P2-7). Pure. */
function webhookTitle(webhook: PersonWebhook): string {
    if (webhook.status === 'active') return `Calendar changes arrive in seconds (webhook; renewed automatically${webhook.expiresAt ? `, current one runs to ${formatDateTime(webhook.expiresAt)}` : ''}).`;
    if (webhook.status === 'failed') return 'The provider refused this calendar’s webhook; changes arrive by polling. Retried every few hours.';
    return 'The webhook for this calendar is being set up; until then changes arrive by polling.';
}

/** The Calendar cell: the live row (provider, status, mailbox, the admin sentence of a problem), or why not synced. */
function CalendarCell({ calendar }: { calendar: PersonCalendar }) {
    const c = calendar.connection;
    if (!c) {
        const label = calendar.reason ? NOT_SYNCED_LABELS[calendar.reason] : calendar.target ? 'Starting soon' : 'Not synced';
        return (
            <Box sx={{ minWidth: 0 }}>
                <StatusChip tone={calendar.reason === 'excluded' ? 'warning' : 'neutral'}>{label}</StatusChip>
                {calendar.choice?.note && <Typography sx={{ ...hintSx, mt: 0.25, overflowWrap: 'anywhere' }}>{calendar.choice.note}</Typography>}
            </Box>
        );
    }
    const chip = SYNC_CHIP[c.status] ?? SYNC_CHIP.error;
    return (
        <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{CALENDAR_PROVIDER_LABELS[c.provider] ?? c.provider}</Typography>
                <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                {c.source === 'override' && (
                    <StatusChip tone="brand" title="Chosen for this person instead of the email domain's provider">
                        Override
                    </StatusChip>
                )}
                {c.webhook && (
                    <StatusChip tone={PERSON_WEBHOOK_LABELS[c.webhook.status].tone} title={webhookTitle(c.webhook)}>
                        {PERSON_WEBHOOK_LABELS[c.webhook.status].label}
                    </StatusChip>
                )}
            </Box>
            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                {c.accountEmail}
                {c.lastSuccessAt ? ` · ok ${formatDateTime(c.lastSuccessAt)}` : ''}
            </Typography>
            {c.status === 'error' && c.lastErrorMessage && (
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-error-main)', overflowWrap: 'anywhere', lineHeight: 1.45, mt: 0.25 }}>{c.lastErrorMessage}</Typography>
            )}
        </Box>
    );
}

/**
 * People: company emails and each person's calendar sync (provider, status, last problem). Calendar sync is automatic
 * for every active person with a company email on a provider's domains; per person an admin may pick another provider
 * or exclude them (CalendarChoiceDialog), and run "Check now".
 */
export function PeopleTable({
    companyDomains,
    providers,
    fakeProvider,
    initialFilter = 'all',
    onToast,
}: {
    companyDomains: string[];
    providers: ProviderAdmin[];
    fakeProvider: boolean;
    initialFilter?: PeopleFilter;
    onToast: (message: string, severity?: 'success' | 'error') => void;
}) {
    const people = usePeople();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<PeopleFilter>(initialFilter);
    const [editing, setEditing] = useState<Person | null>(null);
    const [choosing, setChoosing] = useState<string | null>(null);

    const all = useMemo(() => people.data ?? [], [people.data]);
    const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((p) => matches(p, f.key)).length])) as Record<PeopleFilter, number>, [all]);
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return all.filter((p) => matches(p, filter) && (!q || [p.fullName, p.username, p.email ?? '', p.department ?? ''].some((v) => v.toLowerCase().includes(q))));
    }, [all, filter, search]);
    // The dialog follows the list, so a save or check shows the fresh row.
    const choosingPerson = choosing ? (all.find((p) => p.username === choosing) ?? null) : null;

    return (
        <Box component="section" id="people" aria-labelledby="people-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0, scrollMarginTop: 80 }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 200 }}>
                        <Typography id="people-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)' }}>
                            People
                        </Typography>
                        <Typography sx={hintSx}>
                            Everyone with a company email on a switched-on provider&apos;s domains is synced automatically. Use Calendar… to pick another provider for one
                            person or to leave them out.
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
                    description={
                        filter === 'issues' && !search ? 'Every active person has a unique company email.' : filter === 'calendar_problem' && !search ? "Nobody's calendar has a problem." : undefined
                    }
                />
            ) : (
                <TableContainer sx={{ overflowX: 'auto', maxHeight: { xs: 'none', md: 600 } }}>
                    <Table size="small" stickyHeader sx={{ minWidth: 860 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={headCellSx}>Person</TableCell>
                                <TableCell sx={headCellSx}>Company email</TableCell>
                                <TableCell sx={headCellSx}>Email check</TableCell>
                                <TableCell sx={headCellSx}>Calendar</TableCell>
                                <TableCell sx={{ ...headCellSx, width: 1 }} aria-label="Actions" />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map((p) => {
                                const issue = p.emailIssue ? ISSUE_CHIP[p.emailIssue] : null;
                                const name = p.fullName || p.username;
                                return (
                                    <TableRow key={p.username} hover>
                                        <TableCell sx={{ ...cellSx, maxWidth: 220 }}>
                                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{name}</Typography>
                                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                                                {p.username}
                                                {p.role ? ` · ${p.role}` : ''}
                                                {p.department ? ` · ${p.department}` : ''}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ ...cellSx, maxWidth: 280 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                                                <Typography
                                                    sx={{ fontSize: '0.82rem', color: p.email ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-muted)', overflowWrap: 'anywhere', minWidth: 0, flex: 1 }}
                                                >
                                                    {p.email ?? 'Not set'}
                                                </Typography>
                                                <Tooltip title="Edit company email">
                                                    <IconButton size="small" aria-label={`Edit the company email of ${name}`} onClick={() => setEditing(p)} sx={iconButtonSx}>
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
                                        <TableCell sx={{ ...cellSx, maxWidth: 340 }}>
                                            <CalendarCell calendar={p.calendar} />
                                        </TableCell>
                                        <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<EventNoteOutlinedIcon sx={{ fontSize: 16 }} />}
                                                aria-label={`Calendar settings of ${name}`}
                                                onClick={() => setChoosing(p.username)}
                                                sx={{ ...secondaryButtonSx, minHeight: 36 }}
                                            >
                                                Calendar…
                                            </Button>
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

            <CalendarChoiceDialog
                key={choosing ?? 'none'}
                person={choosingPerson}
                providers={providers}
                fakeProvider={fakeProvider}
                onClose={() => setChoosing(null)}
                onToast={onToast}
            />
        </Box>
    );
}
