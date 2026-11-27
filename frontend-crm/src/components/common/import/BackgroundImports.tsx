'use client';

import React, { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Step, StepLabel, Stepper, Typography } from '@mui/material';
import { CloseFullscreenRounded, CloseRounded, OpenInFullRounded } from '@mui/icons-material';
import { importTracker, isImportFinished, onImportFinished, useTrackedImports, type TrackedImport } from '@/services/importTracker';
import { AppToast } from '../AppToast';
import { ImportProgressPanel, minimizeBtnSx } from './ImportProgressPanel';
import { IMPORT_STEPS } from './types';

const cancelBtnSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.75rem',
    color: 'var(--crm-slate-600)',
    border: '1px solid transparent',
    borderRadius: '8px',
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

const closeBtnSx = {
    width: 32,
    height: 32,
    color: 'var(--mui-palette-text-secondary)',
    '&:hover': { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' },
} as const;

type ImportToast = { key: string; message: string; severity: 'success' | 'warning' | 'error' | 'info' };

const singular = (plural: string, n: number) => (n === 1 ? plural.replace(/ies$/, 'y').replace(/s$/, '') : plural).toLowerCase();

/** The snackbar text for a finished import. */
function toastFor(item: TrackedImport): ImportToast {
    const notImported = item.failedCount + item.skipped.length;
    const created = `${item.created} ${singular(item.plural, item.created)}`;
    if (item.phase === 'completed') {
        return notImported
            ? { key: item.importId, severity: item.created ? 'warning' : 'error', message: `Import finished: ${created} imported, ${notImported} not imported.` }
            : { key: item.importId, severity: 'success', message: `Import complete: ${created} imported.` };
    }
    if (item.phase === 'cancelled') {
        return { key: item.importId, severity: 'info', message: item.created ? `Import cancelled: ${created} imported before it stopped.` : 'Import cancelled.' };
    }
    return { key: item.importId, severity: item.phase === 'failed' ? 'error' : 'warning', message: item.error ?? `Import of ${item.plural.toLowerCase()} stopped.` };
}

/**
 * Imports that kept running after their wizard closed ("Run in background"): a card in the bottom corner with live
 * progress, Cancel, and the final summary (with the error-rows download). Mounted once in the root layout.
 */
export function BackgroundImports() {
    const all = useTrackedImports().filter((item) => item.background);
    const items = all.filter((item) => !item.expanded);
    const expanded = all.find((item) => item.expanded) ?? null;
    // Every finished import (wizard open or not) is announced by a snackbar.
    const [toast, setToast] = useState<ImportToast | null>(null);
    const [toastOpen, setToastOpen] = useState(false);
    useEffect(
        () =>
            onImportFinished((item) => {
                setToast(toastFor(item));
                setToastOpen(true);
            }),
        []
    );

    return (
        <>
            {toast && (
                <AppToast
                    key={toast.key}
                    open={toastOpen}
                    message={toast.message}
                    severity={toast.severity}
                    autoHideDuration={6000}
                    onClose={() => setToastOpen(false)}
                />
            )}
            {items.length > 0 && <BackgroundImportCards items={items} />}
            {expanded && <ExpandedImportDialog item={expanded} />}
        </>
    );
}

function BackgroundImportCards({ items }: { items: TrackedImport[] }) {
    return (
        <Box
            sx={{
                position: 'fixed',
                right: { xs: 8, sm: 16 },
                bottom: { xs: 8, sm: 16 },
                width: { xs: 'calc(100vw - 16px)', sm: 380 },
                maxHeight: 'calc(100vh - 32px)',
                overflowY: 'auto',
                zIndex: 1250,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
            }}
        >
            {items.map((item) => {
                const finished = isImportFinished(item);
                return (
                    <Paper
                        key={item.importId}
                        elevation={0}
                        role="status"
                        sx={{
                            p: 1.5,
                            borderRadius: '12px',
                            border: '1px solid var(--mui-palette-border-main)',
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            boxShadow: '0 12px 32px rgba(15,23,42,0.18)',
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.82rem', fontWeight: 800, color: 'var(--crm-slate-900)' }} noWrap>
                                Import {item.plural}
                            </Typography>
                            <IconButton
                                aria-label="Expand"
                                title="Open the full import window"
                                size="small"
                                onClick={() => importTracker.expand(item.importId)}
                                sx={minimizeBtnSx}
                            >
                                <OpenInFullRounded fontSize="small" />
                            </IconButton>
                            {!finished && (
                                <Button size="small" onClick={() => void importTracker.cancel(item.importId)} disabled={item.cancelling} sx={cancelBtnSx}>
                                    {item.cancelling ? 'Cancelling…' : 'Cancel'}
                                </Button>
                            )}
                            {finished && (
                                <IconButton aria-label="Dismiss" size="small" onClick={() => importTracker.dismiss(item.importId)} sx={closeBtnSx}>
                                    <CloseRounded fontSize="small" />
                                </IconButton>
                            )}
                        </Box>
                        <ImportProgressPanel item={item} compact />
                    </Paper>
                );
            })}
        </Box>
    );
}

const textBtnSx = { textTransform: 'none', fontWeight: 600, color: 'var(--crm-slate-600)' } as const;

/**
 * A background import opened again from its corner card: the same full-size window as the wizard's Results step,
 * showing the live progress or the final summary. Minimize (or Run in background, Esc, a click outside) shrinks it
 * back to the card; Close on a finished import dismisses it.
 */
function ExpandedImportDialog({ item }: { item: TrackedImport }) {
    const finished = isImportFinished(item);
    const minimize = () => importTracker.minimize(item.importId);
    return (
        <Dialog
            open
            onClose={minimize}
            fullWidth
            maxWidth="md"
            slotProps={{ paper: { sx: { borderRadius: '14px', boxShadow: '0 20px 50px rgba(15,23,42,0.18)' } } }}
        >
            <DialogTitle sx={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--crm-slate-900)', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                    Import {item.plural}
                </Box>
                <IconButton aria-label="Minimize" title="Minimize" size="small" onClick={minimize} sx={minimizeBtnSx}>
                    <CloseFullscreenRounded fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Stepper activeStep={3} sx={{ mb: 3, mt: 1 }}>
                    {IMPORT_STEPS.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>
                <ImportProgressPanel item={item} />
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--mui-palette-border-main)' }}>
                <Button onClick={finished ? () => importTracker.dismiss(item.importId) : minimize} sx={textBtnSx}>
                    {finished ? 'Close' : 'Run in background'}
                </Button>
                <Box sx={{ flex: 1 }} />
                {!finished && (
                    <Button onClick={() => void importTracker.cancel(item.importId)} disabled={item.cancelling} sx={{ ...textBtnSx, ...cancelBtnSx, fontSize: undefined }}>
                        {item.cancelling ? 'Cancelling…' : 'Cancel import'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
