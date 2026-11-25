'use client';

import React from 'react';
import { Box, Button, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import type { AuditListItem } from '@/services/auditAdmin.service';
import { SOURCE_LABELS } from './auditLogFilter';
import { ActionPill, ModuleDot, RecordCell, displayUser } from './auditLogUi';

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
const cellSx = { py: 0.9, fontSize: '0.8rem', color: 'var(--crm-slate-700)', verticalAlign: 'top' } as const;
const count = (value: number) => value.toLocaleString('en-IN');

/**
 * The entries table (time, user, action, module, record, summary, source) with "Load N older" paging. `hideUser`: one
 * user's activity log, where every row is theirs. Scrolls sideways inside its own container on narrow screens.
 */
export function AuditEntriesTable({
    rows,
    selectedId,
    onSelect,
    onOpenRecord,
    userNames,
    hideUser = false,
    hasMore,
    loadingMore,
    onLoadMore,
    pageSize,
}: {
    rows: AuditListItem[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onOpenRecord: (href: string) => void;
    userNames: Map<string, string>;
    hideUser?: boolean;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    pageSize: number;
}) {
    return (
        <>
            <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: hideUser ? 980 : 1120 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headCellSx}>Time</TableCell>
                            {!hideUser && <TableCell sx={headCellSx}>User</TableCell>}
                            <TableCell sx={headCellSx}>Action</TableCell>
                            <TableCell sx={headCellSx}>Module</TableCell>
                            <TableCell sx={headCellSx}>Record</TableCell>
                            <TableCell sx={headCellSx}>Summary</TableCell>
                            <TableCell sx={headCellSx}>Source</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow
                                key={row.id}
                                hover
                                selected={row.id === selectedId}
                                onClick={() => onSelect(row.id)}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onSelect(row.id);
                                }}
                                sx={{
                                    cursor: 'pointer',
                                    '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: 'var(--mui-palette-primary-soft)' },
                                    '&:focus-visible': { outline: '2px solid rgb(var(--crm-accent-rgb) / 0.4)', outlineOffset: -2 },
                                }}
                            >
                                <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{row.time}</TableCell>
                                {!hideUser && (
                                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', color: 'var(--crm-slate-900)', fontWeight: 600 }}>{displayUser(row.changedBy, userNames)}</TableCell>
                                )}
                                <TableCell sx={cellSx}>
                                    <ActionPill action={row.action} label={row.actionLabel} />
                                </TableCell>
                                <TableCell sx={cellSx}>
                                    <ModuleDot module={row.module} label={row.moduleLabel} />
                                </TableCell>
                                <TableCell sx={{ ...cellSx, minWidth: 200, maxWidth: 280, wordBreak: 'break-word' }}>
                                    <RecordCell item={row} onOpen={onOpenRecord} />
                                </TableCell>
                                <TableCell sx={{ ...cellSx, minWidth: 220, maxWidth: 380, wordBreak: 'break-word' }}>{row.summary}</TableCell>
                                <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', color: 'var(--mui-palette-text-secondary)' }}>
                                    {row.source ? (SOURCE_LABELS[row.source] ?? row.source) : '—'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderTop: '1px solid var(--mui-palette-border-main)' }}>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', flex: 1, minWidth: 180 }}>
                    Showing the newest {count(rows.length)} entr{rows.length === 1 ? 'y' : 'ies'}
                    {hasMore ? '' : ' (all of them)'}
                </Typography>
                {hasMore && (
                    <Button
                        variant="outlined"
                        size="small"
                        sx={secondaryButtonSx}
                        disabled={loadingMore}
                        startIcon={loadingMore ? <CircularProgress size={14} /> : undefined}
                        onClick={onLoadMore}
                    >
                        Load {pageSize} older
                    </Button>
                )}
            </Box>
        </>
    );
}
