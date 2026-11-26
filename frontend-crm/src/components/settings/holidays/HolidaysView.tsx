'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    IconButton,
    InputAdornment,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { AppToast } from '@/components/common/AppToast';
import { TableSkeleton } from '@/components/common/skeletons';
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
import { useBulkHolidays, useDeleteHoliday, useHolidayList } from '@/hooks/queries/useHolidays';
import {
    HOLIDAY_STATUSES,
    HOLIDAY_TYPES,
    type Holiday,
    type HolidayBulkAction,
    type HolidayListParams,
    type HolidaySortField,
    type HolidayStatus,
    type HolidayType,
} from '@/types/holiday.types';
import { HolidayFormDialog } from './HolidayFormDialog';
import { HolidayImportDialog } from './HolidayImportDialog';
import { HolidayStatusPill, HolidayTypePill, formatHolidayDate, holidayWeekday } from './holidayDisplay';

const ALL = 'all';

const headCellSx = {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--crm-slate-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    backgroundColor: 'var(--mui-palette-background-subtle)',
    whiteSpace: 'nowrap',
    py: 1.1,
    '& .MuiTableSortLabel-root:hover, & .MuiTableSortLabel-root.Mui-active': { color: 'var(--crm-text-blue-700)' },
    '& .MuiTableSortLabel-root.Mui-active .MuiTableSortLabel-icon': { color: 'var(--crm-text-blue-700)' },
} as const;

const cellSx = { py: 0.9, fontSize: '0.82rem', color: 'var(--crm-slate-700)' } as const;

const iconButtonSx = {
    width: 32,
    height: 32,
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    transition: 'all 0.15s ease',
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

const dangerIconButtonSx = {
    ...iconButtonSx,
    '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
} as const;

const dangerButtonSx = {
    ...secondaryButtonSx,
    '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)', borderColor: 'var(--mui-palette-error-softBorder)' },
} as const;

const BULK_TEXT: Record<HolidayBulkAction, { label: string; done: (n: number) => string }> = {
    activate: { label: 'Mark Active', done: (n) => `${n} holiday${n === 1 ? '' : 's'} marked Active.` },
    deactivate: { label: 'Mark Inactive', done: (n) => `${n} holiday${n === 1 ? '' : 's'} marked Inactive.` },
    delete: { label: 'Delete', done: (n) => `${n} holiday${n === 1 ? '' : 's'} deleted.` },
};

const SORTABLE: { field: HolidaySortField; label: string }[] = [
    { field: 'occasion', label: 'Occasion' },
    { field: 'holidayDate', label: 'Holiday Date' },
];

/**
 * Admin › Holidays: the company holiday list. Add, edit, import, activate / deactivate and delete holidays; filter
 * by year, type and status. Active holidays show on everyone's calendar.
 */
export function HolidaysView() {
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [year, setYear] = useState<number | typeof ALL>(ALL);
    const [holidayType, setHolidayType] = useState<HolidayType | typeof ALL>(ALL);
    const [status, setStatus] = useState<HolidayStatus | typeof ALL>(ALL);
    const [sort, setSort] = useState<{ by: HolidaySortField; order: 'asc' | 'desc' }>({ by: 'holidayDate', order: 'desc' });
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<{ open: boolean; holiday: Holiday | null }>({ open: false, holiday: null });
    const [importOpen, setImportOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    // Search waits for a pause in typing.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(0);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const params: HolidayListParams = {
        page: page + 1,
        limit: pageSize,
        search: search || undefined,
        year: year === ALL ? undefined : year,
        holidayType: holidayType === ALL ? undefined : holidayType,
        status: status === ALL ? undefined : status,
        sortBy: sort.by,
        sortOrder: sort.order,
    };
    const list = useHolidayList(params);
    const rows = useMemo(() => list.data?.data ?? [], [list.data]);
    const total = list.data?.total ?? 0;
    const years = list.data?.years ?? [new Date().getFullYear()];
    const filtered = Boolean(search) || year !== ALL || holidayType !== ALL || status !== ALL;

    const bulk = useBulkHolidays();
    const remove = useDeleteHoliday();
    const showToast = (message: string, severity: 'success' | 'error' = 'success') => setToast({ open: true, message, severity });

    const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const someOnPageSelected = rows.some((r) => selected.has(r.id));
    const togglePage = () =>
        setSelected((prev) => {
            const next = new Set(prev);
            rows.forEach((r) => (allOnPageSelected ? next.delete(r.id) : next.add(r.id)));
            return next;
        });
    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const resetPage = () => {
        setPage(0);
        setSelected(new Set());
    };

    const runBulk = async (action: HolidayBulkAction, ids: string[]) => {
        try {
            const { affected } = await bulk.mutateAsync({ action, ids });
            showToast(action === 'delete' || affected > 0 ? BULK_TEXT[action].done(affected) : 'Nothing to change: they already had that status.');
            setSelected(new Set());
        } catch (err) {
            showToast(errorMessage(err, 'Could not update the holidays.'), 'error');
        }
    };

    const deleteConfirmed = async () => {
        if (!confirmDelete) return;
        const { ids } = confirmDelete;
        setConfirmDelete(null);
        if (ids.length === 1) {
            try {
                await remove.mutateAsync(ids[0]);
                showToast('Holiday deleted.');
                setSelected((prev) => {
                    const next = new Set(prev);
                    next.delete(ids[0]);
                    return next;
                });
            } catch (err) {
                showToast(errorMessage(err, 'Could not delete the holiday.'), 'error');
            }
        } else {
            await runBulk('delete', ids);
        }
        // A page emptied by the delete steps back.
        if (page > 0 && ids.length >= rows.length) setPage((p) => Math.max(0, p - 1));
    };

    const sortBy = (field: HolidaySortField) =>
        setSort((s) => (s.by === field ? { by: field, order: s.order === 'asc' ? 'desc' : 'asc' } : { by: field, order: field === 'holidayDate' ? 'desc' : 'asc' }));

    const selectedIds = [...selected];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Header */}
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
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
                        <EventBusyOutlinedIcon />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                            Holidays
                        </Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, lineHeight: 1.55 }}>
                            The company holiday list. Active holidays show on everyone&apos;s calendar, and scheduling an activity on one shows a warning. Inactive
                            holidays stay in the list but are hidden from the calendar.
                        </Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'stretch', md: 'flex-end' } }}>
                    <Button variant="outlined" startIcon={<FileUploadOutlinedIcon />} sx={{ ...secondaryButtonSx, flex: { xs: 1, md: 'none' }, minHeight: 36 }} onClick={() => setImportOpen(true)}>
                        Import
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddRoundedIcon />}
                        sx={{ ...primaryButtonSx, flex: { xs: 1, md: 'none' }, minHeight: 36, whiteSpace: 'nowrap' }}
                        onClick={() => setEditing({ open: true, holiday: null })}
                    >
                        Add Holiday
                    </Button>
                </Box>
            </Box>

            <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                {/* Filters */}
                <Box sx={{ ...panelHeaderSx, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <TextField
                        size="small"
                        placeholder="Search occasions"
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
                            htmlInput: { 'aria-label': 'Search occasions' },
                        }}
                    />
                    <TextField
                        select
                        size="small"
                        value={year}
                        onChange={(e) => {
                            setYear(e.target.value === ALL ? ALL : Number(e.target.value));
                            resetPage();
                        }}
                        sx={{ ...inputSx, width: { xs: 'calc(33.33% - 6px)', sm: 140 } }}
                        slotProps={{ htmlInput: { 'aria-label': 'Year' } }}
                    >
                        <MenuItem value={ALL} sx={{ fontSize: '0.85rem' }}>
                            All years
                        </MenuItem>
                        {years.map((y) => (
                            <MenuItem key={y} value={y} sx={{ fontSize: '0.85rem' }}>
                                {y}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        value={holidayType}
                        onChange={(e) => {
                            setHolidayType(e.target.value as HolidayType | typeof ALL);
                            resetPage();
                        }}
                        sx={{ ...inputSx, width: { xs: 'calc(33.33% - 6px)', sm: 150 } }}
                        slotProps={{ htmlInput: { 'aria-label': 'Holiday Type' } }}
                    >
                        <MenuItem value={ALL} sx={{ fontSize: '0.85rem' }}>
                            All types
                        </MenuItem>
                        {HOLIDAY_TYPES.map((t) => (
                            <MenuItem key={t} value={t} sx={{ fontSize: '0.85rem' }}>
                                {t}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        value={status}
                        onChange={(e) => {
                            setStatus(e.target.value as HolidayStatus | typeof ALL);
                            resetPage();
                        }}
                        sx={{ ...inputSx, width: { xs: 'calc(33.33% - 6px)', sm: 150 } }}
                        slotProps={{ htmlInput: { 'aria-label': 'Status' } }}
                    >
                        <MenuItem value={ALL} sx={{ fontSize: '0.85rem' }}>
                            All statuses
                        </MenuItem>
                        {HOLIDAY_STATUSES.map((s) => (
                            <MenuItem key={s} value={s} sx={{ fontSize: '0.85rem' }}>
                                {s}
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>

                {/* Bulk actions */}
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
                        <Button size="small" variant="outlined" sx={secondaryButtonSx} disabled={bulk.isPending} onClick={() => void runBulk('activate', selectedIds)}>
                            {BULK_TEXT.activate.label}
                        </Button>
                        <Button size="small" variant="outlined" sx={secondaryButtonSx} disabled={bulk.isPending} onClick={() => void runBulk('deactivate', selectedIds)}>
                            {BULK_TEXT.deactivate.label}
                        </Button>
                        <Button
                            size="small"
                            variant="outlined"
                            sx={dangerButtonSx}
                            disabled={bulk.isPending}
                            onClick={() => setConfirmDelete({ ids: selectedIds, label: `${selectedIds.length} holiday${selectedIds.length === 1 ? '' : 's'}` })}
                        >
                            {BULK_TEXT.delete.label}
                        </Button>
                        <Button size="small" sx={{ ...secondaryButtonSx, ml: 'auto' }} onClick={() => setSelected(new Set())}>
                            Clear selection
                        </Button>
                    </Box>
                )}

                {list.isLoading ? (
                    <Box sx={{ p: 2 }}>
                        <TableSkeleton rows={6} columns={5} toolbar={false} />
                    </Box>
                ) : list.isError ? (
                    <Alert severity="error" sx={{ m: 2 }}>
                        {errorMessage(list.error, 'Could not load the holidays.')}
                    </Alert>
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={<EventBusyOutlinedIcon />}
                        title={filtered ? 'No holidays match these filters' : 'No holidays yet'}
                        description={filtered ? 'Try another year, type or status.' : 'Add the company holidays one by one, or import them from a spreadsheet.'}
                        action={
                            filtered ? undefined : (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <Button variant="outlined" startIcon={<FileUploadOutlinedIcon />} sx={secondaryButtonSx} onClick={() => setImportOpen(true)}>
                                        Import
                                    </Button>
                                    <Button variant="contained" startIcon={<AddRoundedIcon />} sx={primaryButtonSx} onClick={() => setEditing({ open: true, holiday: null })}>
                                        Add Holiday
                                    </Button>
                                </Box>
                            )
                        }
                    />
                ) : (
                    <>
                        <TableContainer sx={{ overflowX: 'auto', opacity: list.isFetching && list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 0.15s ease' }}>
                            <Table size="small" sx={{ minWidth: 640 }}>
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
                                        {SORTABLE.map(({ field, label }) => (
                                            <TableCell key={field} sx={headCellSx} sortDirection={sort.by === field ? sort.order : false}>
                                                <TableSortLabel active={sort.by === field} direction={sort.by === field ? sort.order : 'asc'} onClick={() => sortBy(field)}>
                                                    {label}
                                                </TableSortLabel>
                                            </TableCell>
                                        ))}
                                        <TableCell sx={headCellSx}>Day</TableCell>
                                        <TableCell sx={headCellSx} sortDirection={sort.by === 'holidayType' ? sort.order : false}>
                                            <TableSortLabel active={sort.by === 'holidayType'} direction={sort.by === 'holidayType' ? sort.order : 'asc'} onClick={() => sortBy('holidayType')}>
                                                Holiday Type
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={headCellSx} sortDirection={sort.by === 'status' ? sort.order : false}>
                                            <TableSortLabel active={sort.by === 'status'} direction={sort.by === 'status' ? sort.order : 'asc'} onClick={() => sortBy('status')}>
                                                Status
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ ...headCellSx, textAlign: 'right' }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((row) => (
                                        <TableRow key={row.id} hover selected={selected.has(row.id)} sx={{ '&.Mui-selected': { backgroundColor: 'var(--mui-palette-primary-soft)' } }}>
                                            <TableCell padding="checkbox">
                                                <Checkbox size="small" checked={selected.has(row.id)} onChange={() => toggle(row.id)} slotProps={{ input: { 'aria-label': `Select ${row.occasion}` } }} />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, fontWeight: 600, color: 'var(--crm-slate-900)', maxWidth: 280, overflowWrap: 'anywhere' }}>
                                                <Box
                                                    component="button"
                                                    type="button"
                                                    onClick={() => setEditing({ open: true, holiday: row })}
                                                    sx={{
                                                        p: 0,
                                                        border: 0,
                                                        background: 'none',
                                                        font: 'inherit',
                                                        textAlign: 'left',
                                                        cursor: 'pointer',
                                                        color: 'var(--crm-text-blue-700)',
                                                        '&:hover': { color: 'var(--crm-text-blue-600)', textDecoration: 'underline' },
                                                    }}
                                                >
                                                    {row.occasion}
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{formatHolidayDate(row.holidayDate)}</TableCell>
                                            <TableCell sx={{ ...cellSx, color: 'var(--mui-palette-text-secondary)', whiteSpace: 'nowrap' }}>{holidayWeekday(row.holidayDate)}</TableCell>
                                            <TableCell sx={cellSx}>
                                                <HolidayTypePill type={row.holidayType} />
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                <HolidayStatusPill status={row.status} />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <Tooltip title="Edit">
                                                    <IconButton size="small" sx={iconButtonSx} aria-label={`Edit ${row.occasion}`} onClick={() => setEditing({ open: true, holiday: row })}>
                                                        <EditOutlinedIcon sx={{ fontSize: 18 }} />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton
                                                        size="small"
                                                        sx={dangerIconButtonSx}
                                                        aria-label={`Delete ${row.occasion}`}
                                                        onClick={() => setConfirmDelete({ ids: [row.id], label: `${row.occasion} (${formatHolidayDate(row.holidayDate)})` })}
                                                    >
                                                        <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
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
                            sx={{ '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', px: { xs: 1, sm: 2 } } }}
                        />
                    </>
                )}
            </Box>

            <HolidayFormDialog
                open={editing.open}
                holiday={editing.holiday}
                onClose={() => setEditing({ open: false, holiday: null })}
                onSaved={(holiday, created) => {
                    setEditing({ open: false, holiday: null });
                    showToast(created ? `${holiday.occasion} added.` : `${holiday.occasion} saved.`);
                }}
            />
            <HolidayImportDialog
                open={importOpen}
                onClose={() => setImportOpen(false)}
                onImported={(created) => {
                    if (created > 0) resetPage();
                }}
            />
            <ConfirmDeleteDialog
                open={Boolean(confirmDelete)}
                title={confirmDelete && confirmDelete.ids.length > 1 ? 'Delete holidays?' : 'Delete holiday?'}
                onConfirm={() => void deleteConfirmed()}
                onClose={() => setConfirmDelete(null)}
            >
                <span>
                    Delete <strong>{confirmDelete?.label}</strong>? {confirmDelete && confirmDelete.ids.length > 1 ? 'They' : 'It'} will be removed from the list and
                    the calendar. To hide a holiday but keep it, mark it Inactive instead.
                </span>
            </ConfirmDeleteDialog>
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
