'use client';

import React from 'react';
import { Box, Button, Checkbox, Divider, Popover, Typography } from '@mui/material';
import type { DataTableColumn } from './types';

export interface ColumnVisibilityPopoverProps<T> {
    columns: DataTableColumn<T>[];
    visibleColumnIds: Set<string>;
    onToggleColumn: (columnId: string) => void;
    onResetDefaults?: () => void;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    /** Identifies the table (stable element ids); persistence itself lives in useColumnVisibility. */
    tableId?: string;
}

const sectionLabelSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#64748b',
    letterSpacing: '0.05em',
    px: 1.5,
} as const;

export function ColumnVisibilityPopover<T>({
    columns,
    visibleColumnIds,
    onToggleColumn,
    onResetDefaults,
    anchorEl,
    onClose,
    tableId,
}: ColumnVisibilityPopoverProps<T>) {
    const basicColumns = columns.filter((c) => (c.category ?? 'basic') === 'basic');
    const moreColumns = columns.filter((c) => c.category === 'more');
    const visibleCount = columns.filter((c) => visibleColumnIds.has(c.id)).length;
    const idBase = tableId ? `${tableId}-column-visibility` : 'column-visibility';

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
                    }}
                >
                    {column.label}
                </Typography>
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
                paper: {
                    sx: {
                        mt: 0.75,
                        width: 280,
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
                        Customize Columns
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

            <Box
                role="group"
                aria-label="Column visibility"
                sx={{
                    maxHeight: 380,
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
                {basicColumns.length > 0 && (
                    <>
                        <Typography sx={{ ...sectionLabelSx, pt: 1, pb: 0.5 }}>BASIC COLUMNS</Typography>
                        {basicColumns.map(renderItem)}
                    </>
                )}
                {basicColumns.length > 0 && moreColumns.length > 0 && (
                    <Divider sx={{ my: 1, borderColor: '#f1f5f9' }} />
                )}
                {moreColumns.length > 0 && (
                    <>
                        <Typography sx={{ ...sectionLabelSx, pt: 0.5, pb: 0.5 }}>MORE COLUMNS</Typography>
                        {moreColumns.map(renderItem)}
                    </>
                )}
            </Box>
        </Popover>
    );
}
