'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Typography } from '@mui/material';
import { FileDownloadOutlined } from '@mui/icons-material';
import { isImportFinished, type TrackedImport } from '@/services/importTracker';
import { downloadImportErrors, importProblemRows } from './importErrorsFile';

const pluralize = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const clock = (ms: number) => {
    const seconds = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Re-renders every second while `active`, so elapsed / time-left keep moving between polls. */
function useNow(active: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [active]);
    return now;
}

const outlinedBtnSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.78rem',
    borderRadius: '8px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

/** The minimize / expand icon buttons of the import dialog and its corner card. */
export const minimizeBtnSx = {
    width: 32,
    height: 32,
    color: 'var(--mui-palette-text-secondary)',
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '8px',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <Box
            sx={{
                flex: '1 1 0',
                minWidth: 72,
                px: 1.25,
                py: 0.75,
                borderRadius: '8px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-subtle)',
            }}
        >
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color, lineHeight: 1.2 }}>{value}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 600 }}>{label}</Typography>
        </Box>
    );
}

/**
 * Live progress and final summary of one import, shared by the import wizard and the background card.
 * Progress comes from the server's row counts (processed / created / failed), polled every second.
 */
export function ImportProgressPanel({ item, compact = false }: { item: TrackedImport; compact?: boolean }) {
    const finished = isImportFinished(item);
    const now = useNow(!finished);
    const noun = item.plural.toLowerCase();
    const skipped = item.skipped.length;

    if (!finished) {
        const percent = item.total ? Math.floor((item.processed / item.total) * 100) : 0;
        const preparing = item.phase === 'running' && item.processed === 0;
        const queued = item.phase === 'queued';
        const elapsed = now - item.startedAt;
        const rowsElapsed = item.rowsStartedAt ? now - item.rowsStartedAt : 0;
        // Rate from the rows done so far; shown once a few rows give a usable estimate.
        const left = item.processed >= 3 && rowsElapsed > 0 ? ((item.total - item.processed) * rowsElapsed) / item.processed : null;
        const title = item.cancelling
            ? 'Cancelling… finishing the current row'
            : queued
              ? 'Waiting for the import to start…'
              : preparing
                ? `Preparing to import ${pluralize(item.total, 'row')}…`
                : `Importing ${noun}…`;
        const statusLine = queued || preparing
            ? `${pluralize(item.total, 'row')} to import${skipped ? ` · ${skipped} skipped in the preview` : ''}`
            : [
                  `Processing row ${Math.min(item.processed + 1, item.total)} of ${item.total}`,
                  `${item.created} created`,
                  `${item.failedCount} failed`,
                  ...(skipped ? [`${skipped} skipped`] : []),
              ].join(' · ');

        return (
            <Box sx={{ py: compact ? 0.5 : 2, minWidth: 0 }} aria-live="polite">
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5, mb: 1 }}>
                    <Typography sx={{ fontSize: compact ? '0.8rem' : '0.9rem', fontWeight: 700, color: 'var(--crm-slate-900)', minWidth: 0 }}>
                        {title}
                    </Typography>
                    <Typography sx={{ fontSize: compact ? '1rem' : '1.4rem', fontWeight: 800, color: 'var(--crm-text-blue-700)', flexShrink: 0 }}>
                        {percent}%
                    </Typography>
                </Box>
                <LinearProgress
                    variant={queued || preparing ? 'indeterminate' : 'determinate'}
                    value={percent}
                    aria-label={`Import progress ${percent}%`}
                    sx={{
                        height: compact ? 6 : 10,
                        borderRadius: 5,
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        '& .MuiLinearProgress-bar': { borderRadius: 5, transition: 'transform 0.4s linear' },
                    }}
                />
                <Typography sx={{ fontSize: compact ? '0.72rem' : '0.8rem', color: 'var(--crm-slate-700)', mt: 1, fontWeight: 500 }}>
                    {statusLine}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                    Elapsed {clock(elapsed)}
                    {left !== null ? ` · about ${clock(left)} left` : ''}
                    {!compact && ' · You can close this window; the import keeps running and the list refreshes when it finishes.'}
                </Typography>
                {item.error && (
                    <Alert severity="warning" sx={{ mt: 1.5, fontSize: '0.78rem' }}>
                        {item.error}
                    </Alert>
                )}
            </Box>
        );
    }

    const problems = importProblemRows(item);
    const created = item.created;
    let severity: 'success' | 'warning' | 'error' | 'info' = 'success';
    let summary: string;
    if (item.phase === 'failed' || item.phase === 'lost') {
        severity = item.phase === 'failed' ? 'error' : 'warning';
        summary = item.error ?? 'The import stopped.';
    } else if (item.phase === 'cancelled') {
        severity = 'info';
        summary = created
            ? `Import cancelled after ${item.processed} of ${item.total} rows. ${pluralize(created, noun.replace(/s$/, ''))} imported before it stopped stay in the list.`
            : 'Import cancelled. Nothing was imported.';
    } else {
        if (item.failedCount > 0 || skipped > 0) severity = created > 0 ? 'warning' : 'error';
        summary = `Imported ${created} of ${item.total + skipped} ${noun}.${problems.length ? ` ${pluralize(problems.length, 'row')} could not be imported.` : ''}`;
    }

    return (
        <Box sx={{ minWidth: 0 }}>
            <Alert severity={severity} sx={{ fontSize: '0.8rem', mb: 1.5 }}>
                {summary}
            </Alert>
            {(item.phase === 'completed' || item.phase === 'cancelled') && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: problems.length ? 1.5 : 0 }}>
                    <Stat label="Created" value={created} color="var(--mui-palette-success-main)" />
                    <Stat label="Failed" value={item.failedCount} color={item.failedCount ? 'var(--mui-palette-error-main)' : 'var(--crm-slate-900)'} />
                    <Stat label="Skipped" value={skipped} color="var(--crm-slate-900)" />
                    {item.phase === 'cancelled' && <Stat label="Not run" value={item.total - item.processed} color="var(--crm-slate-900)" />}
                </Box>
            )}
            {problems.length > 0 && (
                <>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                            Rows not imported
                        </Typography>
                        <Button size="small" startIcon={<FileDownloadOutlined fontSize="small" />} onClick={() => void downloadImportErrors(item)} sx={outlinedBtnSx}>
                            Download error rows
                        </Button>
                    </Box>
                    <Box
                        sx={{
                            maxHeight: compact ? 140 : 260,
                            overflowY: 'auto',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '8px',
                        }}
                    >
                        {problems.map((row) => (
                            <Box
                                key={row.rowNumber}
                                sx={{ px: 1.5, py: 0.875, borderBottom: '1px solid var(--mui-palette-border-light)', display: 'flex', gap: 1.5, minWidth: 0 }}
                            >
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--crm-slate-700)', minWidth: 56, flexShrink: 0 }}>
                                    Row {row.rowNumber}
                                </Typography>
                                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-error-main)', minWidth: 0, overflowWrap: 'anywhere' }}>
                                    {row.errors.join(' · ')}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </>
            )}
        </Box>
    );
}
