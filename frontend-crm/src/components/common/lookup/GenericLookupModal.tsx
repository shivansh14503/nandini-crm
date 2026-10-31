'use client';

import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogContent,
    DialogTitle,
    Grid,
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
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { splitMulti, joinMulti } from '@/types/lookup.types';
import type {
    LookupColumn,
    LookupFilterField,
    LookupFilterValues,
    LookupSearchPredicate,
} from '@/types/lookup.types';

export interface GenericLookupModalProps<T extends { id: string }> {
    open: boolean;
    onClose: () => void;
    onSelect: (item: T) => void;
    title: string;
    subtitle?: string;
    columns: LookupColumn<T>[];
    data: T[];
    filterFields?: LookupFilterField[];
    /** Filter values the dialog opens with (e.g. the text already typed in the field); "Clear" still resets to blank. */
    initialFilterValues?: LookupFilterValues;
    /** Receives the filter values and the main search text. Defaults to text match + exact filter match. */
    searchPredicate?: LookupSearchPredicate<T>;
    selectedId?: string;
    searchPlaceholder?: string;
    rowsPerPage?: number;
    /** Show the main free-text Search box (default true). Presets with a full field form can hide it. */
    showSearchBox?: boolean;
    /** Shows a spinner instead of the empty state while data is being fetched. */
    loading?: boolean;
    emptyMessage?: string;
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        fontSize: '0.82rem',
        backgroundColor: '#fff',
        borderRadius: '8px',
        '& fieldset': { borderColor: '#e2e8f0' },
        '&:hover fieldset': { borderColor: '#cbd5e1' },
        '&.Mui-focused fieldset': { borderColor: '#2563eb' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.8rem' },
} as const;

const headCellSx = {
    fontSize: '0.68rem',
    fontWeight: 700,
    color: '#64748b',
    letterSpacing: 0.4,
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
} as const;

const fieldValue = <T,>(item: T, key: string): string => {
    const v = (item as Record<string, unknown>)[key];
    return v === null || v === undefined ? '' : String(v);
};

const cellText = <T,>(row: T, col: LookupColumn<T>): string =>
    col.getValue ? col.getValue(row) : fieldValue(row, col.id);

const initialFilters = (fields: LookupFilterField[]): LookupFilterValues =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? '']));

/**
 * Universal record picker dialog: filter bar, results table and pagination.
 * Clicking a row (or pressing Enter on it) calls `onSelect` and closes the dialog.
 */
export function GenericLookupModal<T extends { id: string }>(props: GenericLookupModalProps<T>) {
    // Mount a fresh instance per open so filters and paging always start from their defaults.
    return props.open ? <LookupDialog {...props} /> : null;
}

function LookupDialog<T extends { id: string }>({
    onClose,
    onSelect,
    title,
    subtitle,
    columns,
    data,
    filterFields = [],
    initialFilterValues,
    searchPredicate,
    selectedId,
    searchPlaceholder = 'Search…',
    rowsPerPage = 25,
    showSearchBox = true,
    loading = false,
    emptyMessage,
}: GenericLookupModalProps<T>) {
    const [query, setQuery] = useState('');
    const [filters, setFilters] = useState<LookupFilterValues>(() => ({
        ...initialFilters(filterFields),
        ...initialFilterValues,
    }));
    const [page, setPage] = useState(0);
    const firstRowRef = useRef<HTMLTableRowElement>(null);
    const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null);
    const deferredQuery = useDeferredValue(query);

    const filtered = useMemo(() => {
        const q = deferredQuery.trim().toLowerCase();
        const rows = data.filter((item) => {
            if (searchPredicate) return searchPredicate(item, filters, q);
            const filtersMatch = filterFields.every((f) => {
                if (!filters[f.key]) return true;
                if (f.type === 'multiselect') return splitMulti(filters[f.key]).includes(fieldValue(item, f.key));
                return fieldValue(item, f.key) === filters[f.key];
            });
            if (!filtersMatch) return false;
            return !q || columns.some((c) => cellText(item, c).toLowerCase().includes(q));
        });
        const sortCol = sort && columns.find((c) => c.id === sort.id);
        if (!sort || !sortCol) return rows;
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...rows].sort(
            (a, b) => dir * cellText(a, sortCol).localeCompare(cellText(b, sortCol), undefined, { sensitivity: 'base' })
        );
    }, [data, deferredQuery, filters, filterFields, columns, searchPredicate, sort]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
    const safePage = Math.min(page, pageCount - 1);
    const pageRows = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);
    const rangeStart = filtered.length === 0 ? 0 : safePage * rowsPerPage + 1;
    const rangeEnd = safePage * rowsPerPage + pageRows.length;

    const updateFilter = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(0);
    };

    const toggleSort = (id: string) => {
        setSort((prev) => (prev?.id === id ? { id, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' }));
        setPage(0);
    };

    const handleReset = () => {
        setQuery('');
        setFilters(initialFilters(filterFields));
        setPage(0);
    };

    const choose = (row: T) => {
        onSelect(row);
        onClose();
    };

    return (
        <Dialog
            open
            onClose={onClose}
            fullWidth
            maxWidth="lg"
            aria-labelledby="lookup-dialog-title"
            slotProps={{
                paper: { sx: { borderRadius: '14px', boxShadow: '0 20px 50px rgba(15,23,42,0.18)', maxHeight: '88vh' } },
            }}
        >
            <DialogTitle id="lookup-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5, borderBottom: '1px solid #e2e8f0' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography component="span" sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                            {title}
                        </Typography>
                        <Box
                            component="span"
                            sx={{
                                px: 1,
                                py: 0.2,
                                borderRadius: '10px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: '#1d4ed8',
                                backgroundColor: '#eff6ff',
                                border: '1px solid #bfdbfe',
                            }}
                        >
                            {data.length} records
                        </Box>
                    </Box>
                    {subtitle && <Typography sx={{ fontSize: '0.78rem', color: '#64748b', mt: 0.3 }}>{subtitle}</Typography>}
                </Box>
                <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: '#64748b' }}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Filter bar */}
                <Box
                    component="form"
                    onSubmit={(e: React.FormEvent) => {
                        e.preventDefault();
                        firstRowRef.current?.focus();
                    }}
                    sx={{ px: 3, py: 2, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}
                >
                    <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
                        {showSearchBox && (
                        <Grid size={{ xs: 12, md: 3 }}>
                            <TextField
                                autoFocus
                                fullWidth
                                size="small"
                                label="Search"
                                placeholder={searchPlaceholder}
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setPage(0);
                                }}
                                sx={inputSx}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                            />
                        </Grid>
                        )}
                        {filterFields.map((f) => (
                            <Grid key={f.key} size={{ xs: 6, md: f.width ?? 2 }}>
                                {f.type === 'multiselect' ? (
                                    <TextField
                                        select
                                        fullWidth
                                        size="small"
                                        label={f.label}
                                        value={splitMulti(filters[f.key])}
                                        onChange={(e) => {
                                            const v = e.target.value as unknown as string | string[];
                                            updateFilter(f.key, joinMulti(typeof v === 'string' ? splitMulti(v) : v));
                                        }}
                                        sx={inputSx}
                                        slotProps={{
                                            select: {
                                                multiple: true,
                                                renderValue: (v) => (v as string[]).join(', '),
                                                MenuProps: { slotProps: { paper: { sx: { maxHeight: 280 } } } },
                                            },
                                        }}
                                    >
                                        {(f.options ?? []).map((o) => (
                                            <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.82rem' }}>
                                                {o.label}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                ) : f.type === 'select' ? (
                                    <TextField
                                        select
                                        fullWidth
                                        size="small"
                                        label={f.label}
                                        value={filters[f.key] ?? ''}
                                        onChange={(e) => updateFilter(f.key, e.target.value)}
                                        sx={inputSx}
                                    >
                                        {(f.options ?? []).map((o) => (
                                            <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.82rem' }}>
                                                {o.label}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                ) : (
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label={f.label}
                                        placeholder={f.placeholder}
                                        value={filters[f.key] ?? ''}
                                        onChange={(e) => updateFilter(f.key, e.target.value)}
                                        sx={inputSx}
                                    />
                                )}
                            </Grid>
                        ))}
                        <Grid size={{ xs: 12, md: 'grow' }} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button
                                type="submit"
                                variant="contained"
                                size="small"
                                startIcon={<SearchIcon sx={{ fontSize: 16 }} />}
                                sx={{
                                    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    height: 36,
                                    px: 2,
                                    boxShadow: 'none',
                                    '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)', boxShadow: 'none' },
                                }}
                            >
                                Search
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={handleReset}
                                startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
                                sx={{
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    borderRadius: '8px',
                                    height: 36,
                                    borderColor: '#e2e8f0',
                                    color: '#475569',
                                    backgroundColor: '#fff',
                                    '&:hover': { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
                                }}
                            >
                                Clear
                            </Button>
                        </Grid>
                    </Grid>
                </Box>

                {/* Results */}
                <TableContainer sx={{ flex: 1, minHeight: 240 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                {columns.map((c) => (
                                    <TableCell key={c.id} align={c.align} sx={{ ...headCellSx, minWidth: c.minWidth, width: c.width }}>
                                        {c.sortable ? (
                                            <TableSortLabel
                                                active={sort?.id === c.id}
                                                direction={sort?.id === c.id ? sort.dir : 'asc'}
                                                onClick={() => toggleSort(c.id)}
                                            >
                                                {c.label.toUpperCase()}
                                            </TableSortLabel>
                                        ) : (
                                            c.label.toUpperCase()
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pageRows.map((row, idx) => {
                                const isSelected = row.id === selectedId;
                                return (
                                    <TableRow
                                        key={row.id}
                                        ref={idx === 0 ? firstRowRef : undefined}
                                        hover
                                        tabIndex={0}
                                        selected={isSelected}
                                        onClick={() => choose(row)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                choose(row);
                                            }
                                        }}
                                        sx={{
                                            cursor: 'pointer',
                                            '&:hover': { backgroundColor: '#f8fafc !important' },
                                            '&.Mui-selected': { backgroundColor: '#eff6ff' },
                                            '&:focus-visible': { outline: '2px solid #2563eb', outlineOffset: -2 },
                                            '& td': { borderBottom: '1px solid #f1f5f9' },
                                        }}
                                    >
                                        {columns.map((c) => (
                                            <TableCell key={c.id} align={c.align} sx={{ fontSize: '0.8rem', color: '#475569', py: 1.1, width: c.width }}>
                                                {c.render ? c.render(row) : cellText(row, c) || '-'}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    {loading && (
                        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
                            <CircularProgress size={28} />
                        </Box>
                    )}

                    {!loading && filtered.length === 0 && (
                        <Box sx={{ py: 6, textAlign: 'center' }}>
                            <SearchOffIcon sx={{ fontSize: 36, color: '#cbd5e1' }} />
                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155', mt: 1 }}>
                                {emptyMessage ?? 'No matching records'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8', mt: 0.3 }}>
                                Try a different search term or clear the filters.
                            </Typography>
                        </Box>
                    )}
                </TableContainer>

                {/* Footer */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        px: 3,
                        borderTop: '1px solid #e2e8f0',
                        backgroundColor: '#fff',
                    }}
                >
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        ({rangeStart} - {rangeEnd} of {filtered.length})
                    </Typography>
                    <TablePagination
                        component="div"
                        count={filtered.length}
                        page={safePage}
                        rowsPerPage={rowsPerPage}
                        rowsPerPageOptions={[]}
                        showFirstButton
                        showLastButton
                        onPageChange={(_, p) => setPage(p)}
                        labelDisplayedRows={() => `Page ${safePage + 1} of ${pageCount}`}
                        sx={{ '& .MuiTablePagination-displayedRows': { fontSize: '0.78rem', color: '#64748b' } }}
                    />
                </Box>
            </DialogContent>
        </Dialog>
    );
}
