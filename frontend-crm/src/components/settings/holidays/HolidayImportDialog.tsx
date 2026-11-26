'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Step,
    StepLabel,
    Stepper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { ColumnMappingStep } from '@/components/common/import/ColumnMappingStep';
import { FileUploadDropzone } from '@/components/common/import/FileUploadDropzone';
import { autoMapColumns, downloadSampleTemplate } from '@/components/common/import/importConfigs';
import { parseFile } from '@/components/common/import/parseFile';
import type { ColumnMapping, ImportEntityConfig, ParsedFile } from '@/components/common/import/types';
import { errorMessage, primaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useImportHolidays } from '@/hooks/queries/useHolidays';
import { holidayService } from '@/services/holiday.service';
import type { HolidayImportOutcome, HolidayImportResult, HolidayImportRow, HolidayImportRowResult } from '@/types/holiday.types';
import { formatHolidayDate } from './holidayDisplay';

/** Columns of the holiday template; the same labels as the form and the list. */
export const HOLIDAY_IMPORT_CONFIG: ImportEntityConfig = {
    entity: 'holidays',
    singular: 'Holiday',
    plural: 'Holidays',
    fields: [
        { key: 'occasion', label: 'Occasion', required: true, aliases: ['holiday', 'holiday name', 'name', 'festival', 'occasion name', 'description', 'title'], sample: ['Republic Day', 'Company Foundation Day'] },
        { key: 'holidayDate', label: 'Holiday Date', required: true, aliases: ['date', 'holiday date', 'day', 'on'], sample: ['26/01/2027', '01/04/2027'] },
        { key: 'holidayType', label: 'Holiday Type', required: false, aliases: ['type', 'category', 'kind'], sample: ['Public', 'Company'] },
        { key: 'status', label: 'Status', required: false, aliases: ['active', 'state'], sample: ['Active', 'Active'] },
    ],
};

const STEPS = ['Upload File', 'Map Columns', 'Check & Import', 'Results'];

const OUTCOME_STYLE: Record<HolidayImportOutcome, { label: string; color: string; bg: string; border: string }> = {
    new: { label: 'New', color: 'var(--mui-palette-success-main)', bg: 'var(--mui-palette-success-soft)', border: 'var(--mui-palette-success-softBorder)' },
    duplicate: { label: 'Duplicate', color: 'var(--crm-amber-700)', bg: 'var(--mui-palette-warning-soft)', border: 'var(--mui-palette-warning-softBorder)' },
    error: { label: 'Error', color: 'var(--mui-palette-error-main)', bg: 'var(--mui-palette-error-soft)', border: 'var(--mui-palette-error-softBorder)' },
};

const textBtnSx = { textTransform: 'none', fontWeight: 600, color: 'var(--crm-slate-600)' } as const;
const headCellSx = { fontSize: '0.68rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', backgroundColor: 'var(--mui-palette-background-subtle)', whiteSpace: 'nowrap' } as const;
const cellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;

function OutcomePill({ outcome, count }: { outcome: HolidayImportOutcome; count?: number }) {
    const s = OUTCOME_STYLE[outcome];
    return (
        <Box
            component="span"
            sx={{ display: 'inline-flex', px: 1, py: 0.25, borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', color: s.color, backgroundColor: s.bg, border: `1px solid ${s.border}` }}
        >
            {count === undefined ? s.label : `${s.label}: ${count}`}
        </Box>
    );
}

function rowsFrom(parsed: ParsedFile, mapping: ColumnMapping): HolidayImportRow[] {
    return parsed.rows.map((raw, idx) => {
        const values: HolidayImportRow['values'] = {};
        HOLIDAY_IMPORT_CONFIG.fields.forEach((f) => {
            const header = mapping[f.key];
            values[f.key as keyof HolidayImportRow['values']] = header ? (raw[header] ?? '').trim() : '';
        });
        return { rowNumber: idx + 2, values };
    });
}

/** The checked rows: what each will do (added, skipped as a duplicate, or not imported because of an error). */
function CheckedRows({ rows, filter }: { rows: HolidayImportRowResult[]; filter: HolidayImportOutcome | 'all' }) {
    const shown = filter === 'all' ? rows : rows.filter((r) => r.outcome === filter);
    if (shown.length === 0) {
        return <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', py: 2, textAlign: 'center' }}>No rows here.</Typography>;
    }
    return (
        <TableContainer sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', maxHeight: 340, overflowX: 'auto' }}>
            <Table size="small" stickyHeader sx={{ minWidth: 560 }}>
                <TableHead>
                    <TableRow>
                        <TableCell sx={headCellSx}>ROW</TableCell>
                        <TableCell sx={headCellSx}>RESULT</TableCell>
                        <TableCell sx={headCellSx}>OCCASION</TableCell>
                        <TableCell sx={headCellSx}>HOLIDAY DATE</TableCell>
                        <TableCell sx={headCellSx}>TYPE</TableCell>
                        <TableCell sx={headCellSx}>STATUS</TableCell>
                        <TableCell sx={headCellSx}>NOTE</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {shown.map((r) => (
                        <TableRow key={r.rowNumber} sx={{ backgroundColor: r.outcome === 'error' ? 'var(--mui-palette-error-soft)' : 'transparent' }}>
                            <TableCell sx={{ ...cellSx, color: 'var(--mui-palette-text-secondary)' }}>{r.rowNumber}</TableCell>
                            <TableCell>
                                <OutcomePill outcome={r.outcome} />
                            </TableCell>
                            <TableCell sx={{ ...cellSx, fontWeight: 600, color: 'var(--crm-slate-900)', maxWidth: 200, overflowWrap: 'anywhere' }}>{r.occasion || '-'}</TableCell>
                            <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{r.outcome === 'error' ? r.holidayDate || '-' : formatHolidayDate(r.holidayDate)}</TableCell>
                            <TableCell sx={cellSx}>{r.holidayType || '-'}</TableCell>
                            <TableCell sx={cellSx}>{r.status || '-'}</TableCell>
                            <TableCell sx={{ ...cellSx, color: r.outcome === 'error' ? 'var(--mui-palette-error-main)' : 'var(--mui-palette-text-secondary)', minWidth: 160 }}>
                                {r.messages.join(' · ') || '-'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

function Summary({ result }: { result: HolidayImportResult }) {
    return (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <OutcomePill outcome="new" count={result.created} />
            <OutcomePill outcome="duplicate" count={result.duplicates} />
            <OutcomePill outcome="error" count={result.failed} />
        </Box>
    );
}

export interface HolidayImportDialogProps {
    open: boolean;
    onClose: () => void;
    onImported: (created: number) => void;
}

/** Mounts a fresh wizard each time it opens. */
export function HolidayImportDialog(props: HolidayImportDialogProps) {
    return props.open ? <HolidayImportWizard {...props} /> : null;
}

/**
 * Import holidays from a .csv / .xlsx / .xls file: upload (with a template), map the columns, then a check on the
 * server that marks each row new, duplicate (already in the list, or repeated in the file) or error before anything
 * is saved. Only new rows are added; duplicates are skipped.
 */
function HolidayImportWizard({ open, onClose, onImported }: HolidayImportDialogProps) {
    const theme = useTheme();
    const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
    const [step, setStep] = useState(0);
    const [parsed, setParsed] = useState<ParsedFile | null>(null);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    const [parsing, setParsing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<HolidayImportOutcome | 'all'>('all');
    const [result, setResult] = useState<HolidayImportResult | null>(null);
    const importHolidays = useImportHolidays();

    const rows = useMemo(() => (parsed ? rowsFrom(parsed, mapping) : []), [parsed, mapping]);
    const missingRequired = HOLIDAY_IMPORT_CONFIG.fields.filter((f) => f.required && !mapping[f.key]);

    // The server's check of the mapped rows (nothing is saved).
    const check = useQuery({
        queryKey: ['holidays', 'import-check', parsed?.fileName, rows],
        queryFn: () => holidayService.import(rows, { dryRun: true, fileName: parsed?.fileName }),
        enabled: step === 2 && rows.length > 0,
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });

    const handleFile = async (file: File) => {
        setError(null);
        setParsing(true);
        try {
            const next = await parseFile(file);
            setParsed(next);
            setMapping(autoMapColumns(HOLIDAY_IMPORT_CONFIG, next.headers));
            setStep(1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read this file.');
        } finally {
            setParsing(false);
        }
    };

    const runImport = async () => {
        setError(null);
        try {
            const done = await importHolidays.mutateAsync({ rows, fileName: parsed?.fileName });
            setResult(done);
            setFilter('all');
            setStep(3);
            onImported(done.created);
        } catch (err) {
            setError(errorMessage(err, 'Import failed. Please try again.'));
            void check.refetch();
        }
    };

    const toAdd = check.data?.created ?? 0;
    const busy = importHolidays.isPending;
    const shownResult = step === 3 ? result : check.data;

    return (
        <Dialog
            open={open}
            onClose={busy ? undefined : onClose}
            fullWidth
            maxWidth="md"
            slotProps={{ paper: { sx: { borderRadius: '14px', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } } }}
        >
            <DialogTitle sx={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--crm-slate-900)', pb: 1 }}>Import Holidays</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Stepper activeStep={step} alternativeLabel={isPhone} sx={{ mb: 3, mt: 1, '& .MuiStepLabel-label': { fontSize: { xs: '0.68rem', sm: '0.8rem' } } }}>
                    {STEPS.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {step === 0 && (
                    <Box>
                        <FileUploadDropzone
                            loading={parsing}
                            error={error}
                            entityPlural="Holidays"
                            onFileSelected={handleFile}
                            onDownloadTemplate={() => downloadSampleTemplate(HOLIDAY_IMPORT_CONFIG)}
                        />
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', mt: 1.5, lineHeight: 1.6 }}>
                            Write dates day first (15/08/2026, 15-Aug-2026) or as 2026-08-15; Excel date cells work too. Holiday Type is Public, Optional or Company
                            (Public when blank) and Status is Active or Inactive (Active when blank). A holiday already in the list, with the same date and occasion,
                            is skipped.
                        </Typography>
                    </Box>
                )}

                {step === 1 && parsed && <ColumnMappingStep config={HOLIDAY_IMPORT_CONFIG} parsed={parsed} mapping={mapping} onChange={setMapping} />}

                {(step === 2 || step === 3) && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {step === 2 && check.isLoading && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3, justifyContent: 'center' }}>
                                <CircularProgress size={18} />
                                <Typography sx={{ fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)' }}>Checking {rows.length} rows…</Typography>
                            </Box>
                        )}
                        {step === 2 && check.isError && (
                            <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                                {errorMessage(check.error, 'Could not check the file.')}
                            </Alert>
                        )}
                        {step === 3 && result && (
                            <Alert severity={result.created > 0 ? 'success' : 'info'} sx={{ fontSize: '0.8rem' }}>
                                Added {result.created} holiday{result.created === 1 ? '' : 's'}
                                {result.duplicates > 0 ? `, skipped ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'}` : ''}
                                {result.failed > 0 ? `; ${result.failed} row${result.failed === 1 ? '' : 's'} had errors and ${result.failed === 1 ? 'was' : 'were'} not imported` : ''}.
                            </Alert>
                        )}
                        {shownResult && (
                            <>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                                    <Summary result={shownResult} />
                                    <ToggleButtonGroup
                                        size="small"
                                        exclusive
                                        value={filter}
                                        onChange={(_, v) => v && setFilter(v)}
                                        sx={{
                                            flexWrap: 'wrap',
                                            '& .MuiToggleButton-root': { textTransform: 'none', fontSize: '0.75rem', py: 0.4, px: 1.25, minHeight: 32 },
                                            '& .Mui-selected': { color: 'var(--crm-text-blue-900) !important', backgroundColor: 'var(--mui-palette-primary-soft) !important' },
                                        }}
                                    >
                                        <ToggleButton value="all">All</ToggleButton>
                                        <ToggleButton value="new">New</ToggleButton>
                                        <ToggleButton value="duplicate">Duplicates</ToggleButton>
                                        <ToggleButton value="error">Errors</ToggleButton>
                                    </ToggleButtonGroup>
                                </Box>
                                <CheckedRows rows={shownResult.rows} filter={filter} />
                                {step === 2 && (
                                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)' }}>
                                        Nothing is saved yet. Only new rows are added; duplicates are skipped and rows with errors are left out.
                                    </Typography>
                                )}
                            </>
                        )}
                        {step === 2 && error && (
                            <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                                {error}
                            </Alert>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--mui-palette-border-main)', flexWrap: 'wrap', gap: 1 }}>
                <Button onClick={onClose} disabled={busy} sx={textBtnSx}>
                    {step === 3 ? 'Close' : 'Cancel'}
                </Button>
                <Box sx={{ flex: 1 }} />
                {step > 0 && step < 3 && (
                    <Button onClick={() => setStep(step - 1)} disabled={busy} sx={textBtnSx}>
                        Back
                    </Button>
                )}
                {step === 1 && (
                    <Button variant="contained" disabled={missingRequired.length > 0} onClick={() => setStep(2)} sx={primaryButtonSx}>
                        {missingRequired.length > 0 ? `Map ${missingRequired[0].label} to continue` : 'Check rows'}
                    </Button>
                )}
                {step === 2 && (
                    <Button
                        variant="contained"
                        disabled={busy || !check.data || toAdd === 0}
                        onClick={() => void runImport()}
                        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={primaryButtonSx}
                    >
                        {busy ? 'Importing…' : `Import ${toAdd} Holiday${toAdd === 1 ? '' : 's'}`}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
