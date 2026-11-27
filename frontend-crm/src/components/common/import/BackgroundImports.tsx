'use client';

import React from 'react';
import { Box, Button, IconButton, Paper, Typography } from '@mui/material';
import { CloseRounded } from '@mui/icons-material';
import { importTracker, isImportFinished, useTrackedImports } from '@/services/importTracker';
import { ImportProgressPanel } from './ImportProgressPanel';

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

/**
 * Imports that kept running after their wizard closed ("Run in background"): a card in the bottom corner with live
 * progress, Cancel, and the final summary (with the error-rows download). Mounted once in the root layout.
 */
export function BackgroundImports() {
    const items = useTrackedImports().filter((item) => item.background);
    if (items.length === 0) return null;

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
