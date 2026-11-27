'use client';

import React, { useMemo, useState } from 'react';
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

const errorTextSx = { fontSize: '0.74rem', color: 'var(--mui-palette-error-main)', lineHeight: 1.4 } as const;

const toggleSx = (active: boolean) => ({
    px: 1.2,
    py: 0.4,
    minHeight: 32,
    borderRadius: '8px',
    fontSize: '0.74rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)'}`,
    backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)',
    color: active ? 'var(--crm-text-blue-900)' : 'var(--crm-slate-700)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
});

const headCellSx = { fontSize: '0.68rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', backgroundColor: 'var(--mui-palette-background-subtle)', whiteSpace: 'nowrap' } as const;

/** Each distinct error with the number of rows it hits, most common first. */
function errorSummary(rows: MappedRow[]): { message: string; count: number }[] {
    const counts = new Map<string, number>();
    rows.forEach((r) => new Set(r.errors).forEach((e) => counts.set(e, (counts.get(e) ?? 0) + 1)));
    return [...counts.entries()].map(([message, count]) => ({ message, count })).sort((a, b) => b.count - a.count);
}

const SUMMARY_LIMIT = 6;

export function ImportPreviewStep({ config, rows, previewLimit = 50 }: ImportPreviewStepProps) {
    const validCount = rows.filter((r) => r.errors.length === 0).length;
    const errorCount = rows.length - validCount;
    const summary = useMemo(() => errorSummary(rows), [rows]);
    const [errorsOnly, setErrorsOnly] = useState(false);
    const [showAllReasons, setShowAllReasons] = useState(false);
    const listed = errorsOnly ? rows.filter((r) => r.errors.length > 0) : rows;
    const preview = listed.slice(0, previewLimit);
    // Only the columns the file fills (or a required one it leaves empty): a form can have dozens of fields, most unmapped.
    const shownFields = config.fields.filter((f) => rows.some((r) => r.values[f.key] || r.cellErrors[f.key]));
    const reasons = showAllReasons ? summary : summary.slice(0, SUMMARY_LIMIT);

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 1.2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Box sx={badgeSx('var(--crm-emerald-50)', 'var(--crm-emerald-600)', 'var(--crm-emerald-200)')}>Valid rows: {validCount}</Box>
                <Box sx={badgeSx(errorCount ? 'var(--crm-red-50)' : 'var(--crm-slate-50)', errorCount ? 'var(--mui-palette-error-main)' : 'var(--mui-palette-text-secondary)', errorCount ? 'var(--crm-red-200)' : 'var(--crm-slate-200)')}>
                    Errors / Missing required: {errorCount}
                </Box>
                {errorCount > 0 && validCount > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.8, ml: { sm: 'auto' } }}>
                        <Box component="button" type="button" onClick={() => setErrorsOnly(false)} sx={toggleSx(!errorsOnly)}>
                            All rows
                        </Box>
                        <Box component="button" type="button" onClick={() => setErrorsOnly(true)} sx={toggleSx(errorsOnly)}>
                            Rows with errors
                        </Box>
                    </Box>
                )}
            </Box>

            {summary.length > 0 && (
                <Box
                    sx={{
                        mb: 2,
                        p: { xs: 1.2, sm: 1.5 },
                        borderRadius: '10px',
                        backgroundColor: 'var(--mui-palette-error-soft)',
                        border: '1px solid var(--mui-palette-error-softBorder)',
                    }}
                >
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-900)', mb: 0.8 }}>
                        Why {errorCount} {errorCount === 1 ? 'row fails' : 'rows fail'}
                    </Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2.2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {reasons.map(({ message, count }) => (
                            <Box component="li" key={message} sx={{ ...errorTextSx, wordBreak: 'break-word' }}>
                                {message}{' '}
                                <Box component="span" sx={{ color: 'var(--mui-palette-text-secondary)', fontWeight: 600 }}>
                                    ({count} {count === 1 ? 'row' : 'rows'})
                                </Box>
                            </Box>
                        ))}
                    </Box>
                    {summary.length > SUMMARY_LIMIT && (
                        <Box
                            component="button"
                            type="button"
                            onClick={() => setShowAllReasons((v) => !v)}
                            sx={{ mt: 0.8, p: 0, border: 0, background: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, color: 'var(--crm-text-blue-700)', '&:hover': { color: 'var(--crm-text-blue-600)', textDecoration: 'underline' } }}
                        >
                            {showAllReasons ? 'Show fewer' : `Show all ${summary.length} reasons`}
                        </Box>
                    )}
                </Box>
            )}

            <TableContainer sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', maxHeight: 380, overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headCellSx}>ROW</TableCell>
                            <TableCell sx={headCellSx}>STATUS</TableCell>
                            {errorCount > 0 && <TableCell sx={headCellSx}>ERRORS</TableCell>}
                            {shownFields.map((f) => (
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
                                <TableRow key={r.rowNumber} sx={{ backgroundColor: ok ? 'transparent' : 'var(--mui-palette-error-soft)', verticalAlign: 'top' }}>
                                    <TableCell sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)' }}>{r.rowNumber}</TableCell>
                                    <TableCell>
                                        <Box component="span" sx={badgeSx(ok ? 'var(--crm-emerald-50)' : 'var(--crm-red-50)', ok ? 'var(--crm-emerald-600)' : 'var(--mui-palette-error-main)', ok ? 'var(--crm-emerald-200)' : 'var(--crm-red-200)')}>
                                            {ok ? 'Valid' : 'Error'}
                                        </Box>
                                    </TableCell>
                                    {errorCount > 0 && (
                                        <TableCell sx={{ minWidth: 220, maxWidth: 340 }}>
                                            {r.errors.map((e) => (
                                                <Typography key={e} sx={{ ...errorTextSx, wordBreak: 'break-word' }}>
                                                    {e}
                                                </Typography>
                                            ))}
                                        </TableCell>
                                    )}
                                    {shownFields.map((f) => {
                                        const cellError = r.cellErrors[f.key];
                                        return (
                                            <Tooltip key={f.key} title={cellError ?? ''} disableHoverListener={!cellError} enterTouchDelay={0}>
                                                <TableCell
                                                    sx={{
                                                        fontSize: '0.78rem',
                                                        color: cellError ? 'var(--mui-palette-error-main)' : 'var(--crm-slate-700)',
                                                        fontWeight: cellError ? 700 : 400,
                                                        maxWidth: 180,
                                                        ...(cellError && {
                                                            backgroundColor: 'color-mix(in srgb, var(--mui-palette-error-main) 14%, transparent)',
                                                            boxShadow: 'inset 0 0 0 1px var(--mui-palette-error-softBorder)',
                                                        }),
                                                    }}
                                                >
                                                    <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 'inherit' }}>
                                                        {r.values[f.key] || (cellError ? 'Missing' : '-')}
                                                    </Typography>
                                                </TableCell>
                                            </Tooltip>
                                        );
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {listed.length > previewLimit && (
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)', mt: 1 }}>
                    Showing first {previewLimit} of {listed.length} rows. Rows with errors are skipped on import.
                </Typography>
            )}
        </Box>
    );
}
