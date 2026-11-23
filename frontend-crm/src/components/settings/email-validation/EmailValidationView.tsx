'use client';

import React, { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    InputAdornment,
    LinearProgress,
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
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import AlternateEmailRoundedIcon from '@mui/icons-material/AlternateEmailRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import UnsubscribeOutlinedIcon from '@mui/icons-material/UnsubscribeOutlined';
import { AppToast } from '@/components/common/AppToast';
import { StatusSummaryCards, type StatusSummaryItem } from '@/components/common/StatusSummaryCards';
import { TableSkeleton } from '@/components/common/skeletons';
import { REASON_TEXT } from '@/components/forms/EmailVerification';
import {
    ConfirmDeleteDialog,
    EmptyState,
    errorMessage,
    inputSx,
    panelHeaderSx,
    primaryButtonSx,
    secondaryButtonSx,
    surfaceSx,
} from '@/components/settings/form-customization/builderUi';
import {
    emailValidationAdminService,
    type AddressFilter,
    type AddressSort,
    type AddressStatus,
    type AddressStatusFilter,
    type EmailAction,
    type EmailAddressRow,
    type EmailValidationRun,
    type StartRunPayload,
} from '@/services/emailValidationAdmin.service';

const SUMMARY_KEY = ['email-validation', 'summary'] as const;
const ADDRESSES_KEY = ['email-validation', 'addresses'] as const;
const RUNS_KEY = ['email-validation', 'runs'] as const;

const STATUS_FILTERS: { value: AddressStatusFilter; label: string }[] = [
    { value: 'all', label: 'All addresses' },
    { value: 'unchecked', label: 'Never checked' },
    { value: 'attention', label: 'Needs attention (risky + invalid)' },
    { value: 'risky', label: 'Risky' },
    { value: 'invalid', label: 'Invalid' },
    { value: 'valid', label: 'Valid' },
];

const SORTS: { value: AddressSort; label: string }[] = [
    { value: 'oldest', label: 'Never / longest unchecked first' },
    { value: 'newest', label: 'Most recently checked first' },
    { value: 'email', label: 'Address (A–Z)' },
];

const QUICK_COUNTS = [10, 50, 100];

const STATUS_STYLE: Record<AddressStatus, { label: string; color: string; bg: string; border: string }> = {
    valid: { label: 'Valid', color: 'var(--mui-palette-success-main)', bg: 'var(--mui-palette-success-soft)', border: 'var(--mui-palette-success-softBorder)' },
    risky: { label: 'Risky', color: 'var(--crm-amber-700)', bg: 'var(--mui-palette-warning-soft)', border: 'var(--mui-palette-warning-softBorder)' },
    invalid: { label: 'Invalid', color: 'var(--mui-palette-error-main)', bg: 'var(--mui-palette-error-soft)', border: 'var(--mui-palette-error-softBorder)' },
    unchecked: { label: 'Never checked', color: 'var(--mui-palette-info-main)', bg: 'var(--mui-palette-info-soft)', border: 'var(--mui-palette-info-softBorder)' },
};

const RUN_STATUS_LABEL: Record<string, string> = {
    queued: 'Waiting to start',
    running: 'Running',
    completed: 'Completed',
    cancelled: 'Cancelled',
    stopped: 'Stopped early',
};

const ACTION_TEXT: Record<EmailAction, { label: string; done: string }> = {
    accept: { label: 'Mark as valid', done: 'Marked as valid' },
    markBounced: { label: 'Mark as bounced', done: 'Marked as bounced' },
    remove: { label: 'Remove from records', done: 'Removed from records' },
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

const formatDateTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function StatusPill({ status, reason }: { status: AddressStatus; reason: string | null }) {
    const style = STATUS_STYLE[status];
    const pill = (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                px: 1,
                py: 0.15,
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: style.color,
                backgroundColor: style.bg,
                border: `1px solid ${style.border}`,
                cursor: reason ? 'help' : 'default',
            }}
        >
            {style.label}
        </Box>
    );
    const text = reason ? (REASON_TEXT[reason] ?? reason) : '';
    return text ? <Tooltip title={text}>{pill}</Tooltip> : pill;
}

function usedOn(records: EmailAddressRow['records']): string {
    const parts = [
        records.leads ? `${records.leads} lead${records.leads > 1 ? 's' : ''}` : '',
        records.contacts ? `${records.contacts} contact${records.contacts > 1 ? 's' : ''}` : '',
        records.organizations ? `${records.organizations} organization${records.organizations > 1 ? 's' : ''}` : '',
    ].filter(Boolean);
    return parts.join(' · ') || '—';
}


/** Headline and progress of a running check; list-mode checks go through phases at the provider. */
function runProgressText(run: EmailValidationRun): { title: string; percent: number | null } {
    const n = (value: number) => value.toLocaleString();
    const sent = run.providerTotal ?? 0;
    switch (run.mode === 'list' ? run.phase : null) {
        case 'local_checks':
            return { title: `Step 1 of 3 · Free checks: ${n(run.processed)} of ${n(run.total)}`, percent: run.total ? (run.processed / run.total) * 100 : 0 };
        case 'uploading':
            return { title: `Step 2 of 3 · Sending ${n(sent)} addresses to the verification provider`, percent: null };
        case 'provider_running':
            return { title: `Step 2 of 3 · The provider is checking ${n(sent)} addresses (${run.providerProgress ?? 0}%)`, percent: run.providerProgress ?? 0 };
        case 'provider_waiting':
            return { title: 'Step 2 of 3 · Waiting for credits at the verification provider', percent: run.providerProgress ?? 0 };
        case 'importing':
            return { title: 'Step 3 of 3 · Saving the results to the records', percent: null };
        default:
            return {
                title: `${RUN_STATUS_LABEL[run.status] ?? run.status}: ${n(run.processed)} of ${n(run.total)} addresses checked`,
                percent: run.total ? (run.processed / run.total) * 100 : 0,
            };
    }
}

function RunProgress({ run, onCancel, cancelling }: { run: EmailValidationRun; onCancel: () => void; cancelling: boolean }) {
    const { title, percent } = runProgressText(run);
    const atProvider = run.mode === 'list' && (run.phase === 'provider_running' || run.phase === 'provider_waiting');
    return (
        <Box sx={{ ...surfaceSx, p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--crm-slate-900)', flex: 1, minWidth: 200 }}>{title}</Typography>
                <Tooltip title={atProvider ? 'The list is already with the provider and its credits are used; cancelling only skips importing the results.' : ''}>
                    <span>
                        <Button size="small" variant="outlined" sx={secondaryButtonSx} disabled={cancelling} onClick={onCancel}>
                            Cancel check
                        </Button>
                    </span>
                </Tooltip>
            </Box>
            {percent === null ? (
                <LinearProgress sx={{ height: 6, borderRadius: 3 }} />
            ) : (
                <LinearProgress variant="determinate" value={Math.round(percent)} sx={{ height: 6, borderRadius: 3 }} />
            )}
            {run.message && run.phase === 'provider_waiting' && (
                <Alert severity="warning" sx={{ py: 0 }}>
                    {run.message}
                </Alert>
            )}
            <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                {run.mode === 'list' ? 'Large check, sent to the provider as one list. ' : ''}So far {run.validCount} valid · {run.riskyCount} risky · {run.invalidCount} invalid
                {run.undecidedCount ? ` · ${run.undecidedCount} undecided` : ''}. Started by {run.startedBy}.
                {atProvider && run.lastPolledAt ? ` Last status check ${new Date(run.lastPolledAt).toLocaleTimeString()}; checked every few minutes.` : ''} You can leave this
                page; the check carries on.
            </Typography>
        </Box>
    );
}

/** Admin › Email Validation: every saved address with its stored result, bulk re-checks, and what to do with bad ones. */
export function EmailValidationView() {
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<AddressFilter>({ status: 'all', sort: 'oldest' });
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [customCount, setCustomCount] = useState('');
    const [confirmRun, setConfirmRun] = useState<{ payload: StartRunPayload; count: number } | null>(null);
    const [confirmAction, setConfirmAction] = useState<EmailAction | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
    const showToast = (message: string, severity: 'success' | 'error' = 'success') => setToast({ open: true, message, severity });

    // Search applies after a short pause in typing.
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilter((f) => (f.search === (searchInput.trim() || undefined) ? f : { ...f, search: searchInput.trim() || undefined }));
        }, 350);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // A new filter starts from the first page with nothing ticked.
    const filterKey = JSON.stringify(filter);
    const [lastFilterKey, setLastFilterKey] = useState(filterKey);
    if (filterKey !== lastFilterKey) {
        setLastFilterKey(filterKey);
        setPage(0);
        setSelected(new Set());
    }

    const summary = useQuery({
        queryKey: SUMMARY_KEY,
        queryFn: () => emailValidationAdminService.summary(),
        // Poll while a check runs so the progress bar moves.
        // While the provider works on a large list (minutes to hours), every 15 s is plenty.
        refetchInterval: (q) => {
            const run = q.state.data?.activeRun;
            if (!run) return false;
            return run.mode === 'list' && (run.phase === 'provider_running' || run.phase === 'provider_waiting') ? 15_000 : 2_000;
        },
    });
    const activeRun = summary.data?.activeRun ?? null;

    const addresses = useQuery({
        queryKey: [...ADDRESSES_KEY, filter, page, pageSize],
        queryFn: () => emailValidationAdminService.addresses(filter, page + 1, pageSize),
        placeholderData: keepPreviousData,
    });
    const runs = useQuery({ queryKey: RUNS_KEY, queryFn: () => emailValidationAdminService.runs() });

    // When a check finishes, refresh the list and history so the new results show.
    const [wasRunning, setWasRunning] = useState(false);
    if (Boolean(activeRun) !== wasRunning) {
        setWasRunning(Boolean(activeRun));
        if (wasRunning && !activeRun) {
            void queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY });
            void queryClient.invalidateQueries({ queryKey: RUNS_KEY });
        }
    }

    const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['email-validation'] });

    const startRun = useMutation({
        mutationFn: (payload: StartRunPayload) => emailValidationAdminService.startRun(payload),
        onSuccess: (run) => {
            showToast(`Checking ${run.total} address${run.total === 1 ? '' : 'es'} in the background.`);
            setSelected(new Set());
            void refreshAll();
        },
        onError: (err) => showToast(errorMessage(err, 'Could not start the check.'), 'error'),
    });
    const cancelRun = useMutation({
        mutationFn: (id: string) => emailValidationAdminService.cancelRun(id),
        onSuccess: () => {
            showToast('Check cancelled. Addresses checked so far keep their new results.');
            void refreshAll();
        },
        onError: (err) => showToast(errorMessage(err, 'Could not cancel the check.'), 'error'),
    });
    const applyAction = useMutation({
        mutationFn: ({ action, emails }: { action: EmailAction; emails: string[] }) => emailValidationAdminService.applyAction(action, emails),
        onSuccess: ({ affectedRecords }, { action, emails }) => {
            showToast(`${ACTION_TEXT[action].done}: ${emails.length} address${emails.length === 1 ? '' : 'es'} on ${affectedRecords} record${affectedRecords === 1 ? '' : 's'}.`);
            setSelected(new Set());
            void refreshAll();
        },
        onError: (err) => showToast(errorMessage(err, 'Could not update the addresses.'), 'error'),
    });

    if (summary.isLoading) return <TableSkeleton rows={8} columns={5} />;
    if (summary.isError || !summary.data) {
        return (
            <Alert severity="error" sx={{ borderRadius: '10px' }}>
                {errorMessage(summary.error, 'Could not load email validation.')}
            </Alert>
        );
    }

    const { counts, providerConfigured, providerAvailable, enabled, maxRunSize, listApiMin } = summary.data;
    const rows = addresses.data?.items ?? [];
    const total = addresses.data?.total ?? 0;
    const selectedEmails = [...selected];
    const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.email));
    const someOnPageSelected = rows.some((r) => selected.has(r.email));
    const busy = Boolean(activeRun) || startRun.isPending;

    const toggle = (email: string) =>
        setSelected((s) => {
            const next = new Set(s);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    const togglePage = () =>
        setSelected((s) => {
            const next = new Set(s);
            if (allOnPageSelected) rows.forEach((r) => next.delete(r.email));
            else rows.forEach((r) => next.add(r.email));
            return next;
        });

    const askTopN = (n: number) => {
        const count = Math.min(n, total, maxRunSize);
        if (count > 0) setConfirmRun({ payload: { filter, limit: count }, count });
    };
    const customN = Number.parseInt(customCount, 10);
    const customValid = Number.isFinite(customN) && customN >= 1;

    // Same colored cards as the module list screens; the colors match the status pills in the table.
    const statusCards: StatusSummaryItem<AddressStatusFilter>[] = [
        { id: 'all', label: 'All addresses', count: counts.total, tone: 'brand', icon: <AlternateEmailRoundedIcon />, hint: 'Saved on live records' },
        { id: 'unchecked', label: 'Never checked', count: counts.unchecked, color: 'var(--mui-palette-info-main)', icon: <HourglassEmptyRoundedIcon />, hint: 'No result yet' },
        { id: 'valid', label: 'Valid', count: counts.valid, tone: 'success', icon: <VerifiedRoundedIcon />, hint: 'Mailbox confirmed' },
        { id: 'risky', label: 'Risky', count: counts.risky, tone: 'warning', icon: <WarningAmberRoundedIcon />, hint: 'Catch-all, disposable, unconfirmed' },
        { id: 'invalid', label: 'Invalid', count: counts.invalid, tone: 'error', icon: <UnsubscribeOutlinedIcon />, hint: 'Can’t receive email' },
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Header */}
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
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
                    <MarkEmailReadOutlinedIcon />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                        Email Validation
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, lineHeight: 1.55 }}>
                        An address is checked once, when it is first saved, and keeps that result while it stays in the CRM. Re-check addresses here in bulk; each address
                        uses one verification credit. Risky and invalid results are yours to decide: mark them valid, mark them bounced, or remove them from the records.
                    </Typography>
                </Box>
            </Box>

            {!enabled && <Alert severity="warning" sx={{ overflowWrap: 'anywhere' }}>Email verification is turned off on the server (EMAIL_VERIFICATION_ENABLED=false), so checks can&apos;t run.</Alert>}
            {enabled && !providerConfigured && (
                <Alert severity="info">
                    No verification provider key is set, so checks only run the free tests (format, typos, disposable providers, whether the domain takes email). Mailboxes
                    themselves aren&apos;t confirmed.
                </Alert>
            )}
            {enabled && providerConfigured && !providerAvailable && (
                <Alert severity="warning">The verification provider is out of credits or rate limited. Checks pause for an hour; start new ones later.</Alert>
            )}

            {activeRun && <RunProgress run={activeRun} cancelling={cancelRun.isPending} onCancel={() => cancelRun.mutate(activeRun.id)} />}

            {/* The cards bring their own bottom margin; cancel it inside this gap-spaced column. */}
            <Box sx={{ mb: -2, minWidth: 0 }}>
                <StatusSummaryCards
                    items={statusCards}
                    activeId={filter.status}
                    allId="all"
                    total={counts.total}
                    onChange={(status) => setFilter((f) => ({ ...f, status }))}
                />
            </Box>

            {/* Addresses */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={{ ...panelHeaderSx, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <TextField
                        size="small"
                        placeholder="Search addresses"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        sx={{ ...inputSx, width: { xs: '100%', sm: 240 } }}
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
                        value={filter.status}
                        onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as AddressStatusFilter }))}
                        sx={{ ...inputSx, width: { xs: '100%', sm: 250 } }}
                        slotProps={{ htmlInput: { 'aria-label': 'Status' } }}
                    >
                        {STATUS_FILTERS.map((o) => (
                            <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.85rem' }}>
                                {o.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        value={filter.sort}
                        onChange={(e) => setFilter((f) => ({ ...f, sort: e.target.value as AddressSort }))}
                        sx={{ ...inputSx, width: { xs: '100%', sm: 250 } }}
                        slotProps={{ htmlInput: { 'aria-label': 'Sort' } }}
                    >
                        {SORTS.map((o) => (
                            <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.85rem' }}>
                                {o.label}
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>

                {/* Bulk check bar */}
                <Box sx={{ px: 2, py: 1.25, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, borderBottom: '1px solid var(--mui-palette-border-main)' }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)', mr: 0.5 }}>Check the first</Typography>
                    {QUICK_COUNTS.map((n) => (
                        <Button key={n} size="small" variant="outlined" sx={secondaryButtonSx} disabled={busy || !enabled || total === 0} onClick={() => askTopN(n)}>
                            {n}
                        </Button>
                    ))}
                    <TextField
                        size="small"
                        type="number"
                        placeholder="Any number"
                        value={customCount}
                        onChange={(e) => setCustomCount(e.target.value)}
                        sx={{ ...inputSx, width: 120 }}
                        slotProps={{ htmlInput: { min: 1, max: maxRunSize, 'aria-label': 'Number of addresses to check' } }}
                    />
                    <Button
                        size="small"
                        variant="outlined"
                        sx={secondaryButtonSx}
                        disabled={busy || !enabled || !customValid || total === 0}
                        onClick={() => askTopN(customN)}
                    >
                        Check
                    </Button>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>of this list, in the order shown (max {maxRunSize.toLocaleString()} per check)</Typography>
                </Box>

                {/* Selection bar */}
                {selected.size > 0 && (
                    <Box
                        sx={{
                            px: 2,
                            py: 1,
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 1,
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            borderBottom: '1px solid var(--mui-palette-primary-softBorder)',
                        }}
                    >
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-text-blue-900)', mr: 1 }}>{selected.size} selected</Typography>
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={<PlayArrowRoundedIcon />}
                            sx={primaryButtonSx}
                            disabled={busy || !enabled}
                            onClick={() => setConfirmRun({ payload: { emails: selectedEmails }, count: selectedEmails.length })}
                        >
                            Check selected
                        </Button>
                        <Button size="small" variant="outlined" sx={secondaryButtonSx} disabled={applyAction.isPending} onClick={() => setConfirmAction('accept')}>
                            {ACTION_TEXT.accept.label}
                        </Button>
                        <Button size="small" variant="outlined" sx={secondaryButtonSx} disabled={applyAction.isPending} onClick={() => setConfirmAction('markBounced')}>
                            {ACTION_TEXT.markBounced.label}
                        </Button>
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={applyAction.isPending}
                            onClick={() => setConfirmAction('remove')}
                            sx={{
                                ...secondaryButtonSx,
                                '&:hover': {
                                    color: 'var(--mui-palette-error-main)',
                                    backgroundColor: 'var(--mui-palette-error-soft)',
                                    borderColor: 'var(--mui-palette-error-softBorder)',
                                },
                            }}
                        >
                            {ACTION_TEXT.remove.label}
                        </Button>
                        <Button size="small" sx={{ ...secondaryButtonSx, ml: 'auto' }} onClick={() => setSelected(new Set())}>
                            Clear selection
                        </Button>
                    </Box>
                )}

                {addresses.isLoading ? (
                    <Box sx={{ p: 2 }}>
                        <TableSkeleton rows={6} columns={5} toolbar={false} />
                    </Box>
                ) : addresses.isError ? (
                    <Alert severity="error" sx={{ m: 2 }}>
                        {errorMessage(addresses.error, 'Could not load the addresses.')}
                    </Alert>
                ) : rows.length === 0 ? (
                    <EmptyState title="No addresses here" description="No saved email address matches this filter." />
                ) : (
                    <>
                        <TableContainer sx={{ overflowX: 'auto' }}>
                            <Table size="small" sx={{ minWidth: 720 }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox" sx={headCellSx}>
                                            <Checkbox
                                                size="small"
                                                checked={allOnPageSelected}
                                                indeterminate={someOnPageSelected && !allOnPageSelected}
                                                onChange={togglePage}
                                                slotProps={{ input: { 'aria-label': 'Select all on this page' } }}
                                            />
                                        </TableCell>
                                        <TableCell sx={headCellSx}>Email address</TableCell>
                                        <TableCell sx={headCellSx}>Status</TableCell>
                                        <TableCell sx={headCellSx}>Last checked</TableCell>
                                        <TableCell sx={headCellSx}>Used on</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((row) => (
                                        <TableRow key={row.email} hover selected={selected.has(row.email)} sx={{ '&.Mui-selected': { backgroundColor: 'var(--mui-palette-primary-soft)' } }}>
                                            <TableCell padding="checkbox">
                                                <Checkbox size="small" checked={selected.has(row.email)} onChange={() => toggle(row.email)} slotProps={{ input: { 'aria-label': `Select ${row.email}` } }} />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, fontWeight: 600, color: 'var(--crm-slate-900)', wordBreak: 'break-all' }}>
                                                {row.email}
                                                {row.isBounced && (
                                                    <Box
                                                        component="span"
                                                        sx={{
                                                            ml: 1,
                                                            px: 0.75,
                                                            py: 0.1,
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: 700,
                                                            color: 'var(--crm-red-700)',
                                                            backgroundColor: 'var(--crm-red-100)',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        Bounced
                                                    </Box>
                                                )}
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                <StatusPill status={row.status} reason={row.reason} />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{formatDateTime(row.lastCheckedAt)}</TableCell>
                                            <TableCell sx={{ ...cellSx, color: 'var(--mui-palette-text-secondary)' }}>{usedOn(row.records)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
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
                        />
                    </>
                )}
            </Box>

            {/* History */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={panelHeaderSx}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>Recent checks</Typography>
                </Box>
                {(runs.data ?? []).length === 0 ? (
                    <EmptyState title="No bulk checks yet" description="Checks you start here are listed with their results." />
                ) : (
                    <TableContainer sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 720 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={headCellSx}>Started</TableCell>
                                    <TableCell sx={headCellSx}>By</TableCell>
                                    <TableCell sx={headCellSx}>Status</TableCell>
                                    <TableCell sx={headCellSx}>Checked</TableCell>
                                    <TableCell sx={headCellSx}>Results</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(runs.data ?? []).map((run) => (
                                    <TableRow key={run.id}>
                                        <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{formatDateTime(run.createdAt)}</TableCell>
                                        <TableCell sx={cellSx}>{run.startedBy}</TableCell>
                                        <TableCell sx={cellSx}>
                                            {run.message ? (
                                                <Tooltip title={run.message}>
                                                    <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>{RUN_STATUS_LABEL[run.status] ?? run.status}</span>
                                                </Tooltip>
                                            ) : (
                                                (RUN_STATUS_LABEL[run.status] ?? run.status)
                                            )}
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            {run.processed} / {run.total}
                                        </TableCell>
                                        <TableCell sx={{ ...cellSx, color: 'var(--mui-palette-text-secondary)' }}>
                                            {run.validCount} valid · {run.riskyCount} risky · {run.invalidCount} invalid
                                            {run.undecidedCount > 0 ? ` · ${run.undecidedCount} undecided` : ''}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            {/* Confirm a bulk check */}
            <Dialog open={Boolean(confirmRun)} onClose={() => setConfirmRun(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>Check {confirmRun?.count} address{confirmRun?.count === 1 ? '' : 'es'}?</DialogTitle>
                <DialogContent sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span>
                        {providerConfigured
                            ? `This uses up to ${confirmRun?.count} verification credit${confirmRun?.count === 1 ? '' : 's'} (addresses that fail the free tests cost nothing).`
                            : 'Only the free tests run (no provider key is set).'}{' '}
                        Each result replaces the address&apos;s current one on every record that has it.
                    </span>
                    {providerConfigured && (confirmRun?.count ?? 0) >= listApiMin && (
                        <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                            This is a large check, so the addresses that pass the free tests go to the provider as one list. Credits for the whole list are taken when it is
                            sent (the provider refunds &ldquo;unknown&rdquo; results), and cancelling after that doesn&apos;t refund them. The provider can take from minutes to a
                            few hours; this page shows its progress.
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button variant="outlined" sx={secondaryButtonSx} onClick={() => setConfirmRun(null)}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        sx={primaryButtonSx}
                        onClick={() => {
                            if (confirmRun) startRun.mutate(confirmRun.payload);
                            setConfirmRun(null);
                        }}
                    >
                        Start check
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirm accept / mark bounced */}
            <Dialog
                open={confirmAction === 'accept' || confirmAction === 'markBounced'}
                onClose={() => setConfirmAction(null)}
                maxWidth="xs"
                fullWidth
                slotProps={{ paper: { sx: { borderRadius: '12px' } } }}
            >
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                    {confirmAction ? ACTION_TEXT[confirmAction].label : ''}: {selected.size} address{selected.size === 1 ? '' : 'es'}?
                </DialogTitle>
                <DialogContent sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)' }}>
                    {confirmAction === 'accept'
                        ? 'They count as valid from now on and the risky / invalid badge goes away on every record that has them.'
                        : 'They stay on their records with “Invalid Bounce” ticked, so nobody emails them by mistake. The change is recorded in each record’s history.'}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button variant="outlined" sx={secondaryButtonSx} onClick={() => setConfirmAction(null)}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        sx={primaryButtonSx}
                        onClick={() => {
                            if (confirmAction) applyAction.mutate({ action: confirmAction, emails: selectedEmails });
                            setConfirmAction(null);
                        }}
                    >
                        {confirmAction ? ACTION_TEXT[confirmAction].label : ''}
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDeleteDialog
                open={confirmAction === 'remove'}
                title={`Remove ${selected.size} address${selected.size === 1 ? '' : 'es'} from the records?`}
                confirmLabel="Remove"
                onClose={() => setConfirmAction(null)}
                onConfirm={() => {
                    applyAction.mutate({ action: 'remove', emails: selectedEmails });
                    setConfirmAction(null);
                }}
            >
                <span>
                    The address{selected.size === 1 ? ' is' : 'es are'} deleted from every lead, contact and organization that has {selected.size === 1 ? 'it' : 'them'}. Where
                    one was the primary address, the next one becomes primary. This can&apos;t be undone here, but each record&apos;s history shows what was removed.
                </span>
            </ConfirmDeleteDialog>

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
