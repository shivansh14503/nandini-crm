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
import type { DataTableProps, DataTableColumn } from './types';
import { DataTableEmptyState } from './DataTableEmptyState';
import { TableRowActions } from './TableRowActions';

/**
 * Universal Production-Grade Enterprise Data Table.
 * Reusable across all CRM modules (Organizations, Contacts, Leads, Opportunities, Invoices, etc.).
 */
export function DataTable<T>({
    data,
    columns,
    keyExtractor = (row: any, idx) => row.id || `row-${idx}`,
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
    onDeleteRow,
    viewTooltip,
    editTooltip,
    deleteTooltip,
    actionsPosition = 'left',
    actionsWidth = 80,
    actionsHeaderLabel = 'ACTIONS',
    onRowClick,
    emptyState,
    emptyIcon,
    emptyTitle,
    emptyDescription,
    emptyActionLabel,
    onEmptyAction,
    minHeight = 280,
    stickyHeader = true,
}: DataTableProps<T>) {
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

    // Action presence check
    const hasActions = Boolean(renderActions || onViewRow || onEditRow || onDeleteRow);

    const renderActionButtons = (row: T, index: number) => {
        if (renderActions) {
            return renderActions(row, index);
        }
        return (
            <TableRowActions
                onView={onViewRow ? () => onViewRow(row) : undefined}
                onEdit={onEditRow ? () => onEditRow(row) : undefined}
                onDelete={onDeleteRow ? () => onDeleteRow(row) : undefined}
                viewTooltip={viewTooltip}
                editTooltip={editTooltip}
                deleteTooltip={deleteTooltip}
            />
        );
    };

    // Actions cell renderer
    const renderActionsHeader = () => (
        <TableCell
            sx={{
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                color: '#64748b',
                fontWeight: 700,
                fontSize: '0.74rem',
                letterSpacing: '0.04em',
                py: 1.2,
                width: actionsWidth,
                textAlign: actionsPosition === 'right' ? 'right' : 'left',
            }}
        >
            {actionsHeaderLabel}
        </TableCell>
    );

    return (
        <TableContainer
            sx={{
                flex: 1,
                minHeight,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Table stickyHeader={stickyHeader} size="small">
                {/* ── Table Header ───────────────────────────────────────────── */}
                <TableHead>
                    <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                        {/* Checkbox Column */}
                        {selectable && (
                            <TableCell
                                padding="checkbox"
                                sx={{
                                    backgroundColor: '#f8fafc',
                                    borderBottom: '1px solid #e2e8f0',
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
                                        color: '#94a3b8',
                                        '&.Mui-checked': { color: '#2563eb' },
                                    }}
                                />
                            </TableCell>
                        )}

                        {/* Actions on Left */}
                        {hasActions && actionsPosition === 'left' && renderActionsHeader()}

                        {/* Configurable Columns */}
                        {columns.map((col: DataTableColumn<T>) => {
                            const isSorted = sortField && (col.sortKey || col.id) === sortField;
                            const isSortable = col.sortable && onSort;

                            return (
                                <TableCell
                                    key={col.id}
                                    align={col.align || 'left'}
                                    onClick={
                                        isSortable
                                            ? () => onSort?.(col.sortKey || col.id)
                                            : undefined
                                    }
                                    sx={{
                                        backgroundColor: '#f8fafc',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: isSorted ? '#1e3a8a' : '#64748b',
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
                                        '&:hover': isSortable ? { color: '#1e293b' } : {},
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
                                                    color: isSorted ? '#2563eb' : '#94a3b8',
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

                        return (
                            <TableRow
                                key={rowId}
                                hover
                                selected={isSelected}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                sx={{
                                    cursor: onRowClick ? 'pointer' : 'default',
                                    transition: 'background-color 0.12s ease',
                                    '&:hover': { backgroundColor: '#f8fafc' },
                                    '&.Mui-selected': {
                                        backgroundColor: '#eff6ff !important',
                                    },
                                    '&.Mui-selected:hover': {
                                        backgroundColor: '#dbeafe !important',
                                    },
                                }}
                            >
                                {/* Checkbox Cell */}
                                {selectable && (
                                    <TableCell padding="checkbox" sx={{ pl: 1.5, py: 1 }}>
                                        <Checkbox
                                            size="small"
                                            checked={isSelected}
                                            onChange={() => onToggleSelectRow?.(rowId)}
                                            onClick={(e) => e.stopPropagation()}
                                            sx={{
                                                p: 0.5,
                                                color: '#cbd5e1',
                                                '&.Mui-checked': { color: '#2563eb' },
                                            }}
                                        />
                                    </TableCell>
                                )}

                                {/* Actions Cell Left */}
                                {hasActions && actionsPosition === 'left' && (
                                    <TableCell
                                        sx={{
                                            py: 1,
                                            borderBottom: '1px solid #f1f5f9',
                                            width: actionsWidth,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {renderActionButtons(row, index)}
                                    </TableCell>
                                )}

                                {/* Column Data Cells */}
                                {columns.map((col: DataTableColumn<T>) => {
                                    let cellContent: React.ReactNode = null;

                                    if (col.render) {
                                        cellContent = col.render(row, index);
                                    } else if (typeof col.accessor === 'function') {
                                        cellContent = col.accessor(row);
                                    } else if (col.accessor) {
                                        cellContent = (row as any)[col.accessor];
                                    } else {
                                        cellContent = (row as any)[col.id];
                                    }

                                    return (
                                        <TableCell
                                            key={col.id}
                                            align={col.align || 'left'}
                                            sx={{
                                                py: 1.2,
                                                fontSize: '0.8rem',
                                                color: '#334155',
                                                borderBottom: '1px solid #f1f5f9',
                                                maxWidth: col.width,
                                            }}
                                        >
                                            {cellContent}
                                        </TableCell>
                                    );
                                })}

                                {/* Actions Cell Right */}
                                {hasActions && actionsPosition === 'right' && (
                                    <TableCell
                                        align="right"
                                        sx={{
                                            py: 1,
                                            borderBottom: '1px solid #f1f5f9',
                                            width: actionsWidth,
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
    );
}
