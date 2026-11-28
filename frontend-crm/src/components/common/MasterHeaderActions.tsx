'use client';

import React from 'react';
import { Box, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { CreateSplitButton } from './CreateSplitButton';
import { useMasterPermissions } from './masterPermissions';
import { downloadCsv, type CsvColumn } from '@/utils/csvExport';

/**
 * A list's CSV export (the header's Export button). The list only declares what to write; the button, the file name
 * (`<fileName>-YYYY-MM-DD.csv`) and the messages are shared. Shown only with the list module's Export permission
 * (Admin › Roles, via CommonMasterView).
 */
export interface MasterExportConfig<T> {
    /** File name base, e.g. `'leads'` → `leads-2026-11-28.csv`. */
    fileName: string;
    /** What a row is called in the messages: `{ singular: 'lead', plural: 'leads' }` → "Exported 3 leads.". */
    noun: { singular: string; plural: string };
    /**
     * The rows to write, read when the button is pressed: the selected rows when any are selected, otherwise every
     * row matching the current filters and search (all pages). `selectedOrAll(filtered, selectedIds, allRows)` from
     * `@/utils/exportCells` does exactly that (selected rows come from the whole loaded list, so a selection hidden by
     * a later pill or search change is still exported).
     */
    rows: () => readonly T[];
    /** The CSV columns, in order (cell helpers in `@/utils/exportCells`). */
    columns: readonly CsvColumn<T>[];
    /**
     * Shows the result to the user through the list's own toast: `success` "Exported 3 leads." after the download,
     * `info` "There are no leads to export." when there is nothing to write (no file then).
     */
    onNotify: (message: string, severity: 'success' | 'info') => void;
}

/** Writes `config`'s rows as a CSV download and reports the result through `config.onNotify`. */
export function runMasterExport<T>(config: MasterExportConfig<T>): void {
    const rows = config.rows();
    if (rows.length === 0) {
        config.onNotify(`There are no ${config.noun.plural} to export.`, 'info');
        return;
    }
    downloadCsv(`${config.fileName}-${new Date().toISOString().slice(0, 10)}.csv`, rows, config.columns);
    config.onNotify(`Exported ${rows.length} ${rows.length === 1 ? config.noun.singular : config.noun.plural}.`, 'success');
}

export interface MasterHeaderActionsProps<T = unknown> {
    onRefresh?: () => void;
    onNewClick?: () => void;
    newButtonLabel?: string;
    /** When provided, the New button becomes a split button with import options. */
    onImportClick?: () => void;
    /** When provided (and the role may export), an Export button after Refresh downloads the list as CSV. */
    exportConfig?: MasterExportConfig<T>;
    /** Extra buttons rendered between Refresh / Export and the New button. */
    children?: React.ReactNode;
}

export const outlinedHeaderButtonSx = {
    borderColor: 'var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    borderRadius: '8px',
    height: 36,
    px: 1.8,
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

/**
 * Standard right-aligned header action row shared by the entity master views. New, Import and Export show only when
 * the user's role may create / import / export in the page's module (Admin › Roles, via CommonMasterView). The row
 * wraps on narrow screens.
 */
export function MasterHeaderActions<T = unknown>({
    onRefresh,
    onNewClick: onNewClickProp,
    newButtonLabel = 'New Record',
    onImportClick: onImportClickProp,
    exportConfig,
    children,
}: MasterHeaderActionsProps<T>) {
    const { canCreate, canImport, canExport } = useMasterPermissions();
    const onNewClick = canCreate ? onNewClickProp : undefined;
    const onImportClick = canCreate && canImport ? onImportClickProp : undefined;
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
            {onRefresh && (
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                    onClick={onRefresh}
                    sx={outlinedHeaderButtonSx}
                >
                    Refresh
                </Button>
            )}

            {exportConfig && canExport && (
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                    onClick={() => runMasterExport(exportConfig)}
                    sx={outlinedHeaderButtonSx}
                >
                    Export
                </Button>
            )}

            {children}

            {onNewClick && onImportClick && (
                <CreateSplitButton
                    newButtonLabel={newButtonLabel}
                    onNewClick={onNewClick}
                    onImportClick={onImportClick}
                />
            )}

            {onNewClick && !onImportClick && (
                <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                    onClick={onNewClick}
                    sx={{
                        background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                        color: '#fff',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        borderRadius: '8px',
                        height: 36,
                        px: 2,
                        boxShadow: 'none',
                        '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)' },
                    }}
                >
                    {newButtonLabel}
                </Button>
            )}
        </Box>
    );
}
