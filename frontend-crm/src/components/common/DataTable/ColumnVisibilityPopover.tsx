'use client';

import React from 'react';
import { Box, Button, Checkbox, Divider, IconButton, InputAdornment, Popover, TextField, Tooltip, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import type { DataTableColumn } from './types';

export interface ColumnVisibilityPopoverProps<T> {
    columns: DataTableColumn<T>[];
    visibleColumnIds: Set<string>;
    onToggleColumn: (columnId: string) => void;
    /** Shows / hides a whole section at once. Without it the section toggles are not shown. */
    onSetColumnsVisible?: (columnIds: string[], visible: boolean) => void;
    onResetDefaults?: () => void;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    /** Identifies the table (stable element ids); persistence itself lives in useColumnVisibility. */
    tableId?: string;
    /** Pinned (frozen) column ids, in pin order. Listed in a "Pinned" section at the top. */
    pinnedColumnIds?: string[];
    /** Star toggle on each column. Without it no stars are shown. */
    onTogglePin?: (columnId: string) => void;
    /** Most columns that can be pinned; further stars are disabled. */
    maxPinned?: number;
}

const sectionLabelSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#64748b',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
} as const;

interface ColumnSection<T> {
    key: string;
    label: string;
    columns: DataTableColumn<T>[];
}

/**
 * "Pinned" first (in pin order), then basic columns, then one section per form tab, in the form's tab and field
 * order. A pinned column is listed only under "Pinned".
 */
function buildSections<T>(columns: DataTableColumn<T>[], pinnedIds: readonly string[]): ColumnSection<T>[] {
    const sections = new Map<string, ColumnSection<T>>();
    const add = (key: string, label: string, column: DataTableColumn<T>) => {
        let section = sections.get(key);
        if (!section) {
            section = { key, label, columns: [] };
            sections.set(key, section);
        }
        section.columns.push(column);
    };
    const byId = new Map(columns.map((c) => [c.id, c]));
    const pinned = pinnedIds.map((id) => byId.get(id)).filter((c): c is DataTableColumn<T> => Boolean(c));
    sections.set('pinned', { key: 'pinned', label: 'Pinned', columns: pinned });
    sections.set('basic', { key: 'basic', label: 'Basic Columns', columns: [] });
    const pinnedSet = new Set(pinnedIds);
    const order = (c: DataTableColumn<T>) => c.groupOrder ?? Number.MAX_SAFE_INTEGER;
    const grouped = columns.filter((c) => c.group && !pinnedSet.has(c.id)).sort((a, b) => order(a) - order(b));
    for (const column of columns) {
        if (pinnedSet.has(column.id) || column.group) continue;
        add('basic', 'Basic Columns', column);
    }
    for (const column of grouped) add(`group:${column.group}`, column.group as string, column);
    return [...sections.values()].filter((s) => s.columns.length > 0);
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const NO_PINS: string[] = [];

export function ColumnVisibilityPopover<T>({
    columns,
    visibleColumnIds,
    onToggleColumn,
    onSetColumnsVisible,
    onResetDefaults,
    anchorEl,
    onClose,
    tableId,
    pinnedColumnIds = NO_PINS,
    onTogglePin,
    maxPinned = Infinity,
}: ColumnVisibilityPopoverProps<T>) {
    const [query, setQuery] = React.useState('');
    const listRef = React.useRef<HTMLDivElement | null>(null);
    const visibleCount = columns.filter((c) => visibleColumnIds.has(c.id)).length;
    const idBase = tableId ? `${tableId}-column-visibility` : 'column-visibility';
    const pinLimitReached = pinnedColumnIds.length >= maxPinned;

    const handleTogglePin = (columnId: string) => {
        const pinning = !pinnedColumnIds.includes(columnId);
        onTogglePin?.(columnId);
        // The column moves into "Pinned" at the top: bring the list there so the user sees where it went.
        if (pinning) listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const sections = React.useMemo(() => {
        const q = normalize(query);
        const all = buildSections(columns, pinnedColumnIds);
        if (!q) return all;
        return all
            .map((s) => ({
                ...s,
                columns: s.columns.filter((c) => normalize(`${c.label} ${s.label}`).includes(q)),
            }))
            .filter((s) => s.columns.length > 0);
    }, [columns, query, pinnedColumnIds]);

    const renderItem = (column: DataTableColumn<T>) => {
        const checked = visibleColumnIds.has(column.id);
        const disabled = Boolean(column.locked) || (checked && visibleCount <= 1);
        return (
            <Box
                key={column.id}
                onClick={() => {
                    if (!disabled) onToggleColumn(column.id);
                }}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.25,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    '&:hover': { backgroundColor: '#f8fafc' },
                }}
            >
                <Checkbox
                    size="small"
                    checked={checked}
                    disabled={disabled}
                    tabIndex={-1}
                    disableRipple
                    slotProps={{ input: { 'aria-label': column.label } }}
                    sx={{ p: 0.75, color: '#94a3b8', '&.Mui-checked': { color: '#2563eb' } }}
                />
                <Typography
                    sx={{
                        fontSize: '0.82rem',
                        color: checked ? '#1e293b' : '#64748b',
                        py: 0.75,
                        userSelect: 'none',
                        textTransform: 'capitalize',
                        flex: 1,
                        minWidth: 0,
                    }}
                >
                    {column.label.toLowerCase()}
                </Typography>
                {onTogglePin && renderPinStar(column)}
            </Box>
        );
    };

    const renderPinStar = (column: DataTableColumn<T>) => {
        const pinned = pinnedColumnIds.includes(column.id);
        const blocked = !pinned && pinLimitReached;
        const tip = pinned
            ? 'Unpin column'
            : blocked
              ? `Up to ${maxPinned} columns can be pinned. Unpin one first.`
              : 'Pin column: it stays fixed while the table scrolls sideways';
        return (
            <Tooltip title={tip} placement="left" arrow>
                <span>
                    <IconButton
                        size="small"
                        aria-label={pinned ? `Unpin ${column.label}` : `Pin ${column.label}`}
                        aria-pressed={pinned}
                        disabled={blocked}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePin(column.id);
                        }}
                        sx={{
                            p: 0.5,
                            color: pinned ? '#f59e0b' : '#cbd5e1',
                            '&:hover': { color: '#f59e0b', backgroundColor: '#fffbeb' },
                        }}
                    >
                        {pinned ? <StarIcon sx={{ fontSize: 18 }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                </span>
            </Tooltip>
        );
    };

    const renderSectionHeader = (section: ColumnSection<T>) => {
        const toggleable = section.columns.filter((c) => !c.locked);
        const allVisible = toggleable.length > 0 && toggleable.every((c) => visibleColumnIds.has(c.id));
        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    px: 1.5,
                    pt: 1,
                    pb: 0.25,
                }}
            >
                <Typography sx={sectionLabelSx}>
                    {section.key === 'pinned' ? (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#b45309' }}>
                            <StarIcon sx={{ fontSize: 13, color: '#f59e0b' }} />
                            Pinned · fixed while scrolling
                        </Box>
                    ) : (
                        section.label
                    )}
                </Typography>
                {/* "Hide all" would also unpin: pinned columns are toggled one by one. */}
                {onSetColumnsVisible && section.key !== 'pinned' && toggleable.length > 1 && (
                    <Button
                        size="small"
                        onClick={() => onSetColumnsVisible(toggleable.map((c) => c.id), !allVisible)}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            minWidth: 0,
                            px: 0.75,
                            py: 0,
                            color: '#2563eb',
                        }}
                    >
                        {allVisible ? 'Hide all' : 'Show all'}
                    </Button>
                )}
            </Box>
        );
    };

    return (
        <Popover
            id={idBase}
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
                transition: { onExited: () => setQuery('') },
                paper: {
                    sx: {
                        mt: 0.75,
                        width: 320,
                        maxWidth: 'calc(100vw - 32px)',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
                        overflow: 'hidden',
                    },
                },
            }}
        >
            <Box
                sx={{
                    px: 1.75,
                    py: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    borderBottom: '1px solid #f1f5f9',
                    backgroundColor: '#fff',
                }}
            >
                <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                        Modify Columns
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {visibleCount} of {columns.length} visible
                    </Typography>
                </Box>
                {onResetDefaults && (
                    <Button
                        size="small"
                        onClick={onResetDefaults}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.76rem',
                            minWidth: 0,
                            px: 1,
                            color: '#2563eb',
                        }}
                    >
                        Reset
                    </Button>
                )}
            </Box>

            {columns.length > 8 && (
                <Box sx={{ px: 1.5, pt: 1.25, pb: 0.5 }}>
                    <TextField
                        size="small"
                        fullWidth
                        autoFocus
                        placeholder="Search fields…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        slotProps={{
                            htmlInput: { 'aria-label': 'Search columns' },
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                                    </InputAdornment>
                                ),
                            },
                        }}
                        sx={{
                            '& .MuiInputBase-root': { fontSize: '0.8rem', borderRadius: '8px', height: 34 },
                        }}
                    />
                </Box>
            )}

            <Box
                ref={listRef}
                role="group"
                aria-label="Column visibility"
                sx={{
                    maxHeight: 420,
                    overflowY: 'auto',
                    // Reserve the scrollbar gutter so toggling never shifts the layout.
                    scrollbarGutter: 'stable',
                    pb: 0.5,
                    '&::-webkit-scrollbar': { width: 6 },
                    '&::-webkit-scrollbar-track': { background: 'transparent' },
                    '&::-webkit-scrollbar-thumb': { background: '#cbd5e1', borderRadius: 3 },
                    '&::-webkit-scrollbar-thumb:hover': { background: '#94a3b8' },
                }}
            >
                {sections.length === 0 && (
                    <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', px: 1.75, py: 2 }}>
                        No fields match “{query}”.
                    </Typography>
                )}
                {sections.map((section, index) => (
                    <React.Fragment key={section.key}>
                        {index > 0 && <Divider sx={{ my: 0.75, borderColor: '#f1f5f9' }} />}
                        {renderSectionHeader(section)}
                        {section.columns.map(renderItem)}
                    </React.Fragment>
                ))}
            </Box>
        </Popover>
    );
}
