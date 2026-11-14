'use client';

import React from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import type { ImportEntityConfig, MappedRow } from './types';

export interface ImportPreviewStepProps {
    config: ImportEntityConfig;
    rows: MappedRow[];
    previewLimit?: number;
}

const badgeSx = (bg: string, color: string, border: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    px: 1.2,
    py: 0.4,
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 700,
    backgroundColor: bg,
    color,
    border: `1px solid ${border}`,
});

const headCellSx = { fontSize: '0.68rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', backgroundColor: 'var(--mui-palette-background-subtle)', whiteSpace: 'nowrap' } as const;

export function ImportPreviewStep({ config, rows, previewLimit = 8 }: ImportPreviewStepProps) {
    const validCount = rows.filter((r) => r.errors.length === 0).length;
    const errorCount = rows.length - validCount;
    const preview = rows.slice(0, previewLimit);

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 1.2, mb: 2, flexWrap: 'wrap' }}>
                <Box sx={badgeSx('var(--crm-emerald-50)', 'var(--crm-emerald-600)', 'var(--crm-emerald-200)')}>Valid rows: {validCount}</Box>
                <Box sx={badgeSx(errorCount ? 'var(--crm-red-50)' : 'var(--crm-slate-50)', errorCount ? 'var(--mui-palette-error-main)' : 'var(--mui-palette-text-secondary)', errorCount ? 'var(--crm-red-200)' : 'var(--crm-slate-200)')}>
                    Errors / Missing required: {errorCount}
                </Box>
            </Box>

            <TableContainer sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', maxHeight: 340 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headCellSx}>ROW</TableCell>
                            <TableCell sx={headCellSx}>STATUS</TableCell>
                            {config.fields.map((f) => (
                                <TableCell key={f.key} sx={headCellSx}>
                                    {f.label.toUpperCase()}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {preview.map((r) => {
                            const ok = r.errors.length === 0;
                            return (
                                <TableRow key={r.rowNumber} sx={{ backgroundColor: ok ? 'transparent' : 'var(--mui-palette-error-soft)' }}>
                                    <TableCell sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)' }}>{r.rowNumber}</TableCell>
                                    <TableCell>
                                        <Tooltip title={ok ? '' : r.errors.join(', ')}>
                                            <Box component="span" sx={badgeSx(ok ? 'var(--crm-emerald-50)' : 'var(--crm-red-50)', ok ? 'var(--crm-emerald-600)' : 'var(--mui-palette-error-main)', ok ? 'var(--crm-emerald-200)' : 'var(--crm-red-200)')}>
                                                {ok ? 'Valid' : 'Error'}
                                            </Box>
                                        </Tooltip>
                                    </TableCell>
                                    {config.fields.map((f) => (
                                        <TableCell key={f.key} sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-700)', maxWidth: 180 }}>
                                            <Typography noWrap sx={{ fontSize: 'inherit' }}>
                                                {r.values[f.key] || '-'}
                                            </Typography>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {rows.length > previewLimit && (
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)', mt: 1 }}>
                    Showing first {previewLimit} of {rows.length} rows. Rows with errors are skipped on import.
                </Typography>
            )}
        </Box>
    );
}
