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

const headCellSx = { fontSize: '0.68rem', fontWeight: 700, color: '#64748b', backgroundColor: '#f8fafc', whiteSpace: 'nowrap' } as const;

export function ImportPreviewStep({ config, rows, previewLimit = 8 }: ImportPreviewStepProps) {
    const validCount = rows.filter((r) => r.errors.length === 0).length;
    const errorCount = rows.length - validCount;
    const preview = rows.slice(0, previewLimit);

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 1.2, mb: 2, flexWrap: 'wrap' }}>
                <Box sx={badgeSx('#ecfdf5', '#059669', '#a7f3d0')}>Valid rows: {validCount}</Box>
                <Box sx={badgeSx(errorCount ? '#fef2f2' : '#f8fafc', errorCount ? '#dc2626' : '#64748b', errorCount ? '#fecaca' : '#e2e8f0')}>
                    Errors / Missing required: {errorCount}
                </Box>
            </Box>

            <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', maxHeight: 340 }}>
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
                                <TableRow key={r.rowNumber} sx={{ backgroundColor: ok ? 'transparent' : '#fffafa' }}>
                                    <TableCell sx={{ fontSize: '0.76rem', color: '#64748b' }}>{r.rowNumber}</TableCell>
                                    <TableCell>
                                        <Tooltip title={ok ? '' : r.errors.join(', ')}>
                                            <Box component="span" sx={badgeSx(ok ? '#ecfdf5' : '#fef2f2', ok ? '#059669' : '#dc2626', ok ? '#a7f3d0' : '#fecaca')}>
                                                {ok ? 'Valid' : 'Error'}
                                            </Box>
                                        </Tooltip>
                                    </TableCell>
                                    {config.fields.map((f) => (
                                        <TableCell key={f.key} sx={{ fontSize: '0.78rem', color: '#334155', maxWidth: 180 }}>
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
                <Typography sx={{ fontSize: '0.74rem', color: '#94a3b8', mt: 1 }}>
                    Showing first {previewLimit} of {rows.length} rows. Rows with errors are skipped on import.
                </Typography>
            )}
        </Box>
    );
}
