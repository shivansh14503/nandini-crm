'use client';

import React from 'react';
import { Box, Button, Checkbox, Divider, IconButton, InputAdornment, Popover, TextField, Tooltip, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DataTableColumn } from './types';

export interface ColumnVisibilityPopoverProps<T> {
    /** Every column in display order (the user's order). */
    columns: DataTableColumn<T>[];
    visibleColumnIds: Set<string>;
    onToggleColumn: (columnId: string) => void;
    /** Shows / hides several columns at once. Without it the Select all / Clear all buttons are not shown. */
    onSetColumnsVisible?: (columnIds: string[], visible: boolean) => void;
    onResetDefaults?: () => void;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    /** Identifies the table (stable element ids); persistence itself lives in useColumnVisibility. */
    tableId?: string;
    /** Pinned (frozen) column ids, in pin order. Listed in a "Pinned" section at the top. */
    pinnedColumnIds?: string[];
    /** Pin toggle on each column. Without it no pins are shown. */
    onTogglePin?: (columnId: string) => void;
    /** Most columns that can be pinned; further pins are disabled. */
    maxPinned?: number;
    /** New order of the shown (unpinned) columns. Without it the list can't be dragged. */
    onReorderColumns?: (columnIds: string[]) => void;
    /** New order of the pinned columns. */
    onReorderPinned?: (columnIds: string[]) => void;
}

const sectionLabelSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--mui-palette-text-secondary)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
} as const;

const linkBtnSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.7rem',
    minWidth: 0,
    px: 0.75,
    py: 0,
    color: 'var(--crm-text-blue-600)',
} as const;

/**
 * pinned: the frozen columns, in pin order (draggable).
 * order:  "Display Columns": every shown, unpinned column in table order (draggable; columns added from any section land here).
 * group:  one per form tab (plus "More Columns" for built-in columns hidden by default), listing all of its columns, shown or not, with its own
 *         Select all / Clear all.
 */
type SectionKind = 'pinned' | 'order' | 'group';

interface ColumnSection<T> {
    key: string;
    label: string;
    kind: SectionKind;
    columns: DataTableColumn<T>[];
}

const BASIC_LABEL = 'More Columns';

function buildSections<T>(columns: DataTableColumn<T>[], visible: Set<string>, pinnedIds: readonly string[]): ColumnSection<T>[] {
    const byId = new Map(columns.map((c) => [c.id, c]));
    const pinnedSet = new Set(pinnedIds);
    const pinned = pinnedIds.map((id) => byId.get(id)).filter((c): c is DataTableColumn<T> => Boolean(c));
    const shown = columns.filter((c) => visible.has(c.id) && !pinnedSet.has(c.id));

    const groups = new Map<string, ColumnSection<T>>();
    // Built-in columns are already in "Display Columns"; only the ones hidden by default need a section to be added from.
    groups.set('group:basic', {
        key: 'group:basic',
        label: BASIC_LABEL,
        kind: 'group',
        columns: columns.filter((c) => !c.group && c.defaultHidden),
    });
    // Form fields in the form's tab and field order.
    const order = (c: DataTableColumn<T>) => c.groupOrder ?? Number.MAX_SAFE_INTEGER;
    for (const c of columns.filter((col) => col.group).sort((a, b) => order(a) - order(b))) {
        const key = `group:${c.group}`;
        if (!groups.has(key)) groups.set(key, { key, label: c.group as string, kind: 'group', columns: [] });
        groups.get(key)!.columns.push(c);
    }

    return [
        { key: 'pinned', label: 'Pinned · fixed while scrolling', kind: 'pinned' as const, columns: pinned },
        { key: 'order', label: 'Display Columns', kind: 'order' as const, columns: shown },
        ...groups.values(),
    ].filter((s) => s.columns.length > 0);
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
    onReorderColumns,
    onReorderPinned,
}: ColumnVisibilityPopoverProps<T>) {
    const [query, setQuery] = React.useState('');
    const listRef = React.useRef<HTMLDivElement | null>(null);
    const visibleCount = columns.filter((c) => visibleColumnIds.has(c.id)).length;
    const idBase = tableId ? `${tableId}-column-visibility` : 'column-visibility';
    const pinLimitReached = pinnedColumnIds.length >= maxPinned;
    const searching = normalize(query) !== '';

    const sensors = useSensors(
        // A few pixels of movement before a drag starts, so clicking the handle doesn't count as a drag.
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleTogglePin = (columnId: string) => {
        const pinning = !pinnedColumnIds.includes(columnId);
        onTogglePin?.(columnId);
        // The column moves into "Pinned" at the top: bring the list there so the user sees where it went.
        if (pinning) listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const allSections = React.useMemo(() => buildSections(columns, visibleColumnIds, pinnedColumnIds), [columns, visibleColumnIds, pinnedColumnIds]);

    const sections = React.useMemo(() => {
        const q = normalize(query);
        if (!q) return allSections;
        return allSections
            .map((s) => ({ ...s, columns: s.columns.filter((c) => normalize(`${c.label} ${c.group ?? BASIC_LABEL}`).includes(q)) }))
            .filter((s) => s.columns.length > 0);
    }, [allSections, query]);

    const toggleable = (list: DataTableColumn<T>[]) => list.filter((c) => !c.locked).map((c) => c.id);
    const allToggleable = toggleable(columns);
    const everyVisible = allToggleable.every((id) => visibleColumnIds.has(id));
    const noneVisible = allToggleable.every((id) => !visibleColumnIds.has(id) || columns.find((c) => c.id === id)?.locked);

    const handleDragEnd = (section: ColumnSection<T>) => (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const ids = section.columns.map((c) => c.id);
        const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
        if (section.kind === 'pinned') onReorderPinned?.(next);
        else onReorderColumns?.(next);
    };

    const canDrag = (section: ColumnSection<T>) =>
        !searching &&
        section.columns.length > 1 &&
        (section.kind === 'pinned' ? Boolean(onReorderPinned) : section.kind === 'order' && Boolean(onReorderColumns));

    const renderPin = (column: DataTableColumn<T>) => {
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
                            color: pinned ? 'var(--crm-text-blue-600)' : 'var(--crm-slate-300)',
                            '&:hover': { color: 'var(--mui-palette-primary-main)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                        }}
                    >
                        {pinned ? (
                            <PushPinIcon sx={{ fontSize: 17 }} />
                        ) : (
                            <PushPinOutlinedIcon sx={{ fontSize: 17, transform: 'rotate(45deg)' }} />
                        )}
                    </IconButton>
                </span>
            </Tooltip>
        );
    };

    const renderRow = (column: DataTableColumn<T>, dragHandle?: React.ReactNode, tag?: string) => {
        const checked = visibleColumnIds.has(column.id);
        const disabled = Boolean(column.locked) || (checked && visibleCount <= 1);
        return (
            <Box
                onClick={() => {
                    if (!disabled) onToggleColumn(column.id);
                }}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    pl: dragHandle ? 0.25 : 1.25,
                    pr: 1.25,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    '&:hover': { backgroundColor: 'var(--mui-palette-background-subtle)' },
                }}
            >
                {dragHandle}
                <Checkbox
                    size="small"
                    checked={checked}
                    disabled={disabled}
                    tabIndex={-1}
                    disableRipple
                    slotProps={{ input: { 'aria-label': column.label } }}
                    sx={{ p: 0.75, color: 'var(--mui-palette-text-muted)', '&.Mui-checked': { color: 'var(--crm-text-blue-600)' } }}
                />
                <Typography
                    sx={{
                        fontSize: '0.82rem',
                        color: checked ? 'var(--mui-palette-text-primary)' : 'var(--mui-palette-text-secondary)',
                        py: 0.75,
                        userSelect: 'none',
                        textTransform: 'capitalize',
                        flex: 1,
                        minWidth: 0,
                    }}
                >
                    {column.label.toLowerCase()}
                </Typography>
                {tag && (
                    <Box
                        component="span"
                        title={`From ${tag}`}
                        sx={{
                            fontSize: '0.64rem',
                            fontWeight: 600,
                            color: 'var(--crm-slate-600)',
                            backgroundColor: 'var(--mui-palette-background-hover)',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '4px',
                            px: 0.6,
                            py: 0.1,
                            maxWidth: 96,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                        }}
                    >
                        {tag}
                    </Box>
                )}
                {onTogglePin && renderPin(column)}
            </Box>
        );
    };

    const renderSectionHeader = (section: ColumnSection<T>) => {
        // Pinned columns are toggled one by one (clearing would also unpin them).
        const unpinned = section.columns.filter((c) => !pinnedColumnIds.includes(c.id));
        const shownIds = toggleable(unpinned.filter((c) => visibleColumnIds.has(c.id)));
        const hiddenIds = toggleable(unpinned.filter((c) => !visibleColumnIds.has(c.id)));
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1.5, pt: 1, pb: 0.25 }}>
                <Typography sx={sectionLabelSx}>
                    {section.kind === 'pinned' ? (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'var(--crm-text-blue-700)' }}>
                            <PushPinIcon sx={{ fontSize: 13 }} />
                            {section.label}
                        </Box>
                    ) : (
                        section.label
                    )}
                </Typography>
                {/* The table-order list only clears; each section below selects and clears its own columns. */}
                {onSetColumnsVisible && section.kind === 'order' && shownIds.length > 1 && (
                    <Button size="small" onClick={() => onSetColumnsVisible(shownIds, false)} sx={linkBtnSx}>
                        Clear all
                    </Button>
                )}
                {onSetColumnsVisible && section.kind === 'group' && shownIds.length + hiddenIds.length > 1 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <Button size="small" disabled={hiddenIds.length === 0} onClick={() => onSetColumnsVisible(hiddenIds, true)} sx={linkBtnSx}>
                            Select all
                        </Button>
                        <Button size="small" disabled={shownIds.length === 0} onClick={() => onSetColumnsVisible(shownIds, false)} sx={linkBtnSx}>
                            Clear all
                        </Button>
                    </Box>
                )}
            </Box>
        );
    };

    // In the table-order list, a tag names the form tab a column comes from (basic columns need none).
    const tagOf = (section: ColumnSection<T>, column: DataTableColumn<T>) => (section.kind === 'order' ? column.group : undefined);

    const renderSection = (section: ColumnSection<T>) => {
        if (!canDrag(section)) {
            return section.columns.map((column) => <React.Fragment key={column.id}>{renderRow(column, undefined, tagOf(section, column))}</React.Fragment>);
        }
        return (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(section)}>
                <SortableContext items={section.columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {section.columns.map((column) => (
                        <SortableRow key={column.id} id={column.id} label={column.label}>
                            {(handle) => renderRow(column, handle, tagOf(section, column))}
                        </SortableRow>
                    ))}
                </SortableContext>
            </DndContext>
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
                        border: '1px solid var(--mui-palette-border-main)',
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
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                    backgroundColor: 'var(--mui-palette-background-paper)',
                }}
            >
                <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>Modify Columns</Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {visibleCount} of {columns.length} visible
                    </Typography>
                </Box>
                {onResetDefaults && (
                    <Button
                        size="small"
                        onClick={onResetDefaults}
                        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.76rem', minWidth: 0, px: 1, color: 'var(--crm-text-blue-600)' }}
                    >
                        Reset
                    </Button>
                )}
            </Box>

            {onSetColumnsVisible && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pt: 0.75 }}>
                    <Button size="small" disabled={everyVisible} onClick={() => onSetColumnsVisible(allToggleable, true)} sx={linkBtnSx}>
                        Select all
                    </Button>
                    <Typography sx={{ color: 'var(--crm-slate-300)', fontSize: '0.75rem' }}>|</Typography>
                    {/* One column always stays visible (the table can't be empty). */}
                    <Button size="small" disabled={noneVisible} onClick={() => onSetColumnsVisible(allToggleable, false)} sx={linkBtnSx}>
                        Clear all
                    </Button>
                    {(onReorderColumns || onReorderPinned) && !searching && (
                        <Typography sx={{ ml: 'auto', pr: 0.75, display: 'flex', alignItems: 'center', fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)' }}>
                            <DragIndicatorIcon sx={{ fontSize: 14 }} /> Drag to reorder
                        </Typography>
                    )}
                </Box>
            )}

            {columns.length > 8 && (
                <Box sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
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
                                        <SearchIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                                    </InputAdornment>
                                ),
                            },
                        }}
                        sx={{ '& .MuiInputBase-root': { fontSize: '0.8rem', borderRadius: '8px', height: 34 } }}
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
                    '&::-webkit-scrollbar-thumb': { background: 'var(--crm-slate-300)', borderRadius: 3 },
                    '&::-webkit-scrollbar-thumb:hover': { background: 'var(--crm-slate-400)' },
                }}
            >
                {sections.length === 0 && (
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)', px: 1.75, py: 2 }}>No fields match “{query}”.</Typography>
                )}
                {sections.map((section, index) => (
                    <React.Fragment key={section.key}>
                        {index > 0 && <Divider sx={{ my: 0.75, borderColor: 'var(--mui-palette-border-light)' }} />}
                        {renderSectionHeader(section)}
                        {renderSection(section)}
                    </React.Fragment>
                ))}
            </Box>
        </Popover>
    );
}

/** A draggable row: only the handle starts a drag, so clicking the row still toggles the column. */
function SortableRow({ id, label, children }: { id: string; label: string; children: (handle: React.ReactNode) => React.ReactNode }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
    const handle = (
        <Box
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${label}`}
            onClick={(e) => e.stopPropagation()}
            sx={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--crm-slate-300)',
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
                borderRadius: '4px',
                '&:hover, &:focus-visible': { color: 'var(--mui-palette-text-secondary)', outline: 'none', backgroundColor: 'var(--mui-palette-background-hover)' },
            }}
        >
            <DragIndicatorIcon sx={{ fontSize: 18 }} />
        </Box>
    );
    return (
        <Box
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            sx={{
                position: 'relative',
                zIndex: isDragging ? 2 : 'auto',
                backgroundColor: isDragging ? 'var(--mui-palette-background-paper)' : undefined,
                boxShadow: isDragging ? '0 6px 16px rgba(15,23,42,0.15)' : undefined,
                borderRadius: isDragging ? '6px' : undefined,
            }}
        >
            {children(handle)}
        </Box>
    );
}
