'use client';

import React from 'react';
import {
    Box,
    Checkbox,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { DataTableProps, DataTableColumn } from './types';
import { DataTableEmptyState } from './DataTableEmptyState';
import { TableRowActions } from './TableRowActions';
import { useTableScroll } from './useTableScroll';
import { useFrozenColumns } from './useFrozenColumns';

/**
 * Widest a cell gets (unless its column sets `width`). The table sizes columns to their content, so without
 * this cap long text would just widen the column; with it, longer text wraps onto the next line.
 */
const CELL_MAX_WIDTH = 320;

/**
 * Cell text wraps within the column width, never cut off: full text is always visible. Applies inside custom
 * cell renders too (overrides `noWrap`). Very long unbroken values (emails, URLs) break rather than overflow.
 * Chip labels stay whole; a row of chips wraps onto the next line instead.
 */
const wrappingCellSx = {
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    '& *': { whiteSpace: 'normal !important', textOverflow: 'clip !important' },
    // Text beside an icon wraps next to it instead of pushing the cell wider.
    '& .MuiBox-root, & .MuiTypography-root, & a': { minWidth: 0 },
    '& .MuiChip-label': { whiteSpace: 'nowrap !important' },
    '& svg, & .MuiChip-root, & .MuiCheckbox-root': { flexShrink: 0 },
} as const;

/** Press-and-hold arrow at one edge of the table; scrolls sideways for as long as it is held. */
function ScrollArrow({
    direction,
    visible,
    onStart,
    onStop,
    offset = 0,
}: {
    direction: -1 | 1;
    visible: boolean;
    onStart: (direction: -1 | 1) => void;
    onStop: () => void;
    /** Distance from its edge, e.g. past the frozen columns. */
    offset?: number;
}) {
    const Icon = direction < 0 ? ChevronLeftIcon : ChevronRightIcon;
    return (
        <Box
            role="button"
            aria-label={direction < 0 ? 'Scroll table left' : 'Scroll table right'}
            tabIndex={-1}
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                onStart(direction);
            }}
            onPointerUp={onStop}
            onPointerCancel={onStop}
            onLostPointerCapture={onStop}
            sx={{
                position: 'absolute',
                top: '50%',
                [direction < 0 ? 'left' : 'right']: 6 + offset,
                transform: 'translateY(-50%)',
                zIndex: 4,
                width: 30,
                height: 30,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--mui-palette-background-paper)',
                border: '1px solid var(--mui-palette-border-strong)',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
                color: 'var(--crm-slate-700)',
                cursor: 'pointer',
                userSelect: 'none',
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? 'auto' : 'none',
                transition: 'opacity 0.15s ease, background-color 0.15s ease',
                '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-blue-700)', borderColor: 'var(--crm-blue-300)' },
                '&:active': { backgroundColor: 'var(--crm-blue-100)' },
            }}
        >
            <Icon sx={{ fontSize: 20 }} />
        </Box>
    );
}

/**
 * Universal Production-Grade Enterprise Data Table.
 * Reusable across all CRM modules (Organizations, Contacts, Leads, Opportunities, Invoices, etc.).
 */
export function DataTable<T>({
    data,
    columns,
    keyExtractor = (row: T, idx: number) =>
        String((row as Record<string, unknown>)?.id || `row-${idx}`),
    selectable = true,
    selectedIds,
    onToggleSelectRow,
    onToggleSelectAll,
    isAllSelected,
    isIndeterminate,
    sortField,
    sortOrder = 'asc',
    onSort,
    renderActions,
    onViewRow,
    onEditRow,
    getViewHref,
    getEditHref,
    onDeleteRow,
    viewTooltip,
    editTooltip,
    deleteTooltip,
    actionsPosition = 'left',
    actionsWidth = 80,
    actionsAlign = 'center',
    actionsHeaderLabel = 'ACTIONS',
    onRowClick,
    activeRowId,
    emptyState,
    emptyIcon,
    emptyTitle,
    emptyDescription,
    emptyActionLabel,
    onEmptyAction,
    minHeight = 280,
    stickyHeader = true,
}: DataTableProps<T>) {
    const { setContainer, canScrollLeft, canScrollRight, isPanning, onPointerDown, startHold, stopHold } = useTableScroll();

    // Action presence check (view is now triggered by clicking the row)
    const hasActions = Boolean(renderActions || onEditRow || getEditHref || onDeleteRow);

    // ── Frozen columns: pinned columns (listed first) stay at the left edge while the table scrolls sideways,
    // together with the checkbox and left-hand actions columns before them.
    const pinnedCount = columns.filter((c) => c.pinned).length;
    const checkboxSlot = pinnedCount > 0 && selectable ? 0 : -1;
    const actionsSlot = pinnedCount > 0 && hasActions && actionsPosition === 'left' ? (selectable ? 1 : 0) : -1;
    const firstColumnSlot = pinnedCount > 0 ? (selectable ? 1 : 0) + (actionsSlot >= 0 ? 1 : 0) : 0;
    const frozenCount = pinnedCount > 0 ? firstColumnSlot + pinnedCount : 0;
    const { registerHeaderCell, lefts, frozenWidth } = useFrozenColumns(
        frozenCount,
        `${columns.filter((c) => c.pinned).map((c) => c.id).join('|')}#${selectable}#${actionsSlot}`
    );
    /** Sticky styles of a cell in frozen slot `slot` (none when the slot isn't frozen). */
    const frozenSx = (slot: number, header: boolean) => {
        if (slot < 0 || slot >= frozenCount) return {};
        return {
            position: 'sticky',
            left: lefts[slot] ?? 0,
            // Above scrolling cells (and anything positioned inside them); frozen header cells also above the
            // (sticky) header row and the frozen body cells.
            zIndex: header ? 4 : 2,
            ...(header ? {} : { backgroundColor: 'inherit' }),
            ...(slot === frozenCount - 1 && {
                borderRight: '1px solid var(--mui-palette-border-main)',
                boxShadow: '6px 0 8px -6px rgba(15, 23, 42, 0.18)',
            }),
        } as const;
    };
    /** Header cell stacking: unfrozen sticky header cells (MUI: 2) sit above the frozen body cells (2) too. */
    const headerSx = (slot: number) => ({ zIndex: 3, ...frozenSx(slot, true) });
    const columnSlot =(columnIndex: number) => (columnIndex < pinnedCount ? firstColumnSlot + columnIndex : -1);

    // Determine row selection state helper
    const isRowSelected = (rowId: string): boolean => {
        if (!selectedIds) return false;
        if (selectedIds instanceof Set) {
            return selectedIds.has(rowId);
        }
        if (Array.isArray(selectedIds)) {
            return selectedIds.includes(rowId);
        }
        return false;
    };

    // Calculate selection states if not passed explicitly
    const computedAllSelected =
        isAllSelected !== undefined
            ? isAllSelected
            : data.length > 0 &&
              data.every((item, idx) => isRowSelected(keyExtractor(item, idx)));

    const computedSomeSelected =
        isIndeterminate !== undefined
            ? isIndeterminate
            : !computedAllSelected &&
              data.some((item, idx) => isRowSelected(keyExtractor(item, idx)));

    // Empty state fallback
    if (data.length === 0) {
        if (emptyState) {
            return <>{emptyState}</>;
        }
        return (
            <DataTableEmptyState
                icon={emptyIcon}
                title={emptyTitle}
                description={emptyDescription}
                actionLabel={emptyActionLabel}
                onAction={onEmptyAction}
            />
        );
    }

    // Row click handler: row click opens the view
    const handleRowClick = onRowClick || onViewRow;

    const renderActionButtons = (row: T, index: number) => {
        if (renderActions) {
            // Wrap custom actions so they follow the same alignment as the built-in ones
            return (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent:
                            actionsAlign === 'left'
                                ? 'flex-start'
                                : actionsAlign === 'right'
                                ? 'flex-end'
                                : 'center',
                        width: '100%',
                    }}
                >
                    {renderActions(row, index)}
                </Box>
            );
        }
        return (
            <TableRowActions
                onView={onViewRow ? () => onViewRow(row) : undefined}
                onEdit={onEditRow ? () => onEditRow(row) : undefined}
                viewHref={getViewHref?.(row)}
                editHref={getEditHref?.(row)}
                onDelete={onDeleteRow ? () => onDeleteRow(row) : undefined}
                viewTooltip={viewTooltip}
                editTooltip={editTooltip}
                deleteTooltip={deleteTooltip}
                align={actionsAlign}
            />
        );
    };

    // Actions cell renderer
    const renderActionsHeader = (slot = -1) => (
        <TableCell
            align={actionsAlign}
            ref={slot >= 0 ? registerHeaderCell(slot) : undefined}
            sx={{
                ...headerSx(slot),
                backgroundColor: 'var(--mui-palette-background-subtle)',
                borderBottom: '1px solid var(--mui-palette-border-main)',
                color: 'var(--mui-palette-text-secondary)',
                fontWeight: 700,
                fontSize: '0.74rem',
                letterSpacing: '0.04em',
                py: 1.2,
                px: 1,
                width: actionsWidth,
                minWidth: actionsWidth,
                whiteSpace: 'nowrap',
                textAlign: actionsAlign,
            }}
        >
            {actionsHeaderLabel}
        </TableCell>
    );

    return (
        <Box sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <ScrollArrow direction={-1} visible={canScrollLeft} onStart={startHold} onStop={stopHold} offset={frozenWidth} />
        <ScrollArrow direction={1} visible={canScrollRight} onStart={startHold} onStop={stopHold} />
        <TableContainer
            ref={setContainer}
            onPointerDown={onPointerDown}
            // Middle (scroll-wheel) button pans the table; stop the browser's autoscroll cursor.
            onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
            }}
            sx={{
                flex: 1,
                minHeight,
                // Bounded so the horizontal scrollbar stays on screen instead of below the last row.
                maxHeight: 'max(360px, calc(100vh - 270px))',
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                cursor: isPanning ? 'grabbing' : undefined,
                userSelect: isPanning ? 'none' : undefined,
                scrollbarWidth: 'auto',
                scrollbarColor: 'var(--mui-palette-text-muted) var(--crm-slate-100)',
                '&::-webkit-scrollbar': {
                    width: '10px',
                    height: '12px',
                },
                '&::-webkit-scrollbar-track': {
                    backgroundColor: 'var(--mui-palette-background-hover)',
                    borderRadius: '6px',
                },
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: 'var(--crm-slate-400)',
                    borderRadius: '6px',
                    border: '2px solid var(--mui-palette-border-light)',
                    '&:hover': {
                        backgroundColor: 'var(--crm-slate-500)',
                    },
                },
            }}
        >
            <Table
                stickyHeader={stickyHeader}
                size="small"
                sx={{
                    minWidth: 'max-content',
                    width: '100%',
                    tableLayout: 'auto',
                }}
            >
                {/* ── Table Header ───────────────────────────────────────────── */}
                <TableHead>
                    <TableRow sx={{ backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                        {/* Checkbox Column */}
                        {selectable && (
                            <TableCell
                                padding="checkbox"
                                ref={checkboxSlot >= 0 ? registerHeaderCell(checkboxSlot) : undefined}
                                sx={{
                                    ...headerSx(checkboxSlot),
                                    backgroundColor: 'var(--mui-palette-background-subtle)',
                                    borderBottom: '1px solid var(--mui-palette-border-main)',
                                    width: 40,
                                    pl: 1.5,
                                }}
                            >
                                <Checkbox
                                    size="small"
                                    checked={computedAllSelected}
                                    indeterminate={computedSomeSelected}
                                    onChange={(e) => onToggleSelectAll?.(e.target.checked)}
                                    sx={{
                                        p: 0.5,
                                        color: 'var(--mui-palette-text-muted)',
                                        '&.Mui-checked': { color: 'var(--crm-text-blue-600)' },
                                    }}
                                />
                            </TableCell>
                        )}

                        {/* Actions on Left */}
                        {hasActions && actionsPosition === 'left' && renderActionsHeader(actionsSlot)}

                        {/* Configurable Columns */}
                        {columns.map((col: DataTableColumn<T>, columnIndex: number) => {
                            const isSorted = sortField && (col.sortKey || col.id) === sortField;
                            const isSortable = col.sortable && onSort;
                            const slot = columnSlot(columnIndex);

                            return (
                                <TableCell
                                    key={col.id}
                                    align={col.align || 'left'}
                                    ref={slot >= 0 ? registerHeaderCell(slot) : undefined}
                                    onClick={
                                        isSortable
                                            ? () => onSort?.(col.sortKey || col.id)
                                            : undefined
                                    }
                                    sx={{
                                        ...headerSx(slot),
                                        backgroundColor: 'var(--mui-palette-background-subtle)',
                                        borderBottom: '1px solid var(--mui-palette-border-main)',
                                        color: isSorted ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                                        fontWeight: 700,
                                        fontSize: '0.74rem',
                                        letterSpacing: '0.04em',
                                        py: 1.2,
                                        width: col.width,
                                        minWidth: col.minWidth,
                                        cursor: isSortable ? 'pointer' : 'default',
                                        userSelect: 'none',
                                        whiteSpace: 'nowrap',
                                        transition: 'color 0.15s ease',
                                        '&:hover': isSortable ? { color: 'var(--mui-palette-text-primary)' } : {},
                                    }}
                                >
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 0.5,
                                            justifyContent:
                                                col.align === 'right'
                                                    ? 'flex-end'
                                                    : col.align === 'center'
                                                    ? 'center'
                                                    : 'flex-start',
                                        }}
                                    >
                                        <span>{col.label}</span>
                                        {isSortable && (
                                            <Box
                                                component="span"
                                                sx={{
                                                    display: 'inline-flex',
                                                    color: isSorted ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-muted)',
                                                }}
                                            >
                                                {isSorted ? (
                                                    sortOrder === 'asc' ? (
                                                        <ArrowDropUpIcon sx={{ fontSize: 18 }} />
                                                    ) : (
                                                        <ArrowDropDownIcon sx={{ fontSize: 18 }} />
                                                    )
                                                ) : (
                                                    <UnfoldMoreIcon sx={{ fontSize: 14 }} />
                                                )}
                                            </Box>
                                        )}
                                    </Box>
                                </TableCell>
                            );
                        })}

                        {/* Actions on Right */}
                        {hasActions && actionsPosition === 'right' && renderActionsHeader()}
                    </TableRow>
                </TableHead>

                {/* ── Table Body ───────────────────────────────────────────── */}
                <TableBody>
                    {data.map((row: T, index: number) => {
                        const rowId = keyExtractor(row, index);
                        const isSelected = isRowSelected(rowId);
                        const isActive = Boolean(activeRowId && activeRowId === rowId);

                        return (
                            <TableRow
                                key={rowId}
                                hover
                                selected={isSelected || isActive}
                                onClick={handleRowClick ? () => handleRowClick(row) : undefined}
                                sx={{
                                    // Explicit so frozen cells (background: inherit) cover what scrolls beneath them.
                                    backgroundColor: 'var(--mui-palette-background-paper)',
                                    cursor: handleRowClick ? 'pointer' : 'default',
                                    transition: 'background-color 0.12s ease',
                                    // Opaque, and as specific as MUI's own `hover` rule (a translucent action.hover): frozen
                                    // cells inherit the row colour, so a translucent one let scrolled cells show through them.
                                    '&:hover, &.MuiTableRow-hover:hover': { backgroundColor: 'var(--mui-palette-background-subtle)' },
                                    ...(isActive && {
                                        backgroundColor: 'var(--mui-palette-primary-soft) !important',
                                        boxShadow: 'inset 3px 0 0 var(--mui-palette-primary-main)',
                                    }),
                                    '&.Mui-selected': {
                                        backgroundColor: 'var(--mui-palette-primary-soft) !important',
                                    },
                                    '&.Mui-selected:hover': {
                                        backgroundColor: 'var(--crm-blue-100) !important',
                                    },
                                }}
                            >
                                {/* Checkbox Cell */}
                                {selectable && (
                                    <TableCell
                                        padding="checkbox"
                                        sx={{ ...frozenSx(checkboxSlot, false), pl: 1.5, py: 1 }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Checkbox
                                            size="small"
                                            checked={isSelected}
                                            onChange={() => onToggleSelectRow?.(rowId)}
                                            onClick={(e) => e.stopPropagation()}
                                            sx={{
                                                p: 0.5,
                                                color: 'var(--crm-slate-300)',
                                                '&.Mui-checked': { color: 'var(--crm-text-blue-600)' },
                                            }}
                                        />
                                    </TableCell>
                                )}

                                {/* Actions Cell Left */}
                                {hasActions && actionsPosition === 'left' && (
                                    <TableCell
                                        align={actionsAlign}
                                        sx={{
                                            ...frozenSx(actionsSlot, false),
                                            py: 1,
                                            px: 1,
                                            borderBottom: '1px solid var(--mui-palette-border-light)',
                                            width: actionsWidth,
                                            minWidth: actionsWidth,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {renderActionButtons(row, index)}
                                    </TableCell>
                                )}

                                {/* Column Data Cells */}
                                {columns.map((col: DataTableColumn<T>, columnIndex: number) => {
                                    let cellContent: React.ReactNode = null;

                                    if (col.render) {
                                        cellContent = col.render(row, index);
                                    } else if (typeof col.accessor === 'function') {
                                        cellContent = col.accessor(row);
                                    } else if (col.accessor) {
                                        cellContent = (row as Record<string, React.ReactNode>)[
                                            String(col.accessor)
                                        ];
                                    } else {
                                        cellContent = (row as Record<string, React.ReactNode>)[col.id];
                                    }

                                    return (
                                        <TableCell
                                            key={col.id}
                                            align={col.align || 'left'}
                                            sx={{
                                                ...frozenSx(columnSlot(columnIndex), false),
                                                py: 1.2,
                                                fontSize: '0.8rem',
                                                color: 'var(--crm-slate-700)',
                                                borderBottom: '1px solid var(--mui-palette-border-light)',
                                            }}
                                        >
                                            {/* max-width on a <td> is ignored by auto table layout: cap an inner box instead. */}
                                            <Box sx={{ ...wrappingCellSx, maxWidth: col.width ?? CELL_MAX_WIDTH }}>
                                                {cellContent}
                                            </Box>
                                        </TableCell>
                                    );
                                })}

                                {/* Actions Cell Right */}
                                {hasActions && actionsPosition === 'right' && (
                                    <TableCell
                                        align={actionsAlign}
                                        sx={{
                                            py: 1,
                                            px: 1,
                                            borderBottom: '1px solid var(--mui-palette-border-light)',
                                            width: actionsWidth,
                                            minWidth: actionsWidth,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {renderActionButtons(row, index)}
                                    </TableCell>
                                )}
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
        </Box>
    );
}
