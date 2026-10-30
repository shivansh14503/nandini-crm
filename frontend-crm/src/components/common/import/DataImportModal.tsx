'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    LinearProgress,
    Step,
    StepLabel,
    Stepper,
    Typography,
} from '@mui/material';
import { importService, notifyCrmUpdate, type ImportResult } from '@/services';
import { FileUploadDropzone } from './FileUploadDropzone';
import { ColumnMappingStep } from './ColumnMappingStep';
import { ImportPreviewStep } from './ImportPreviewStep';
import { autoMapColumns, downloadSampleTemplate, IMPORT_CONFIGS, mapAndValidateRows } from './importConfigs';
import { parseFile } from './parseFile';
import type { ColumnMapping, ImportEntityType, ParsedFile } from './types';

export interface DataImportModalProps {
    open: boolean;
    entity: ImportEntityType;
    onClose: () => void;
    /** Called once the import has finished, with the number of created records. */
    onImported: (count: number) => void;
}

const STEPS = ['Upload File', 'Map Columns', 'Preview & Import', 'Results'];
const JOB_POLL_MS = 1000;
const TERMINAL_STATES = new Set(['completed', 'failed']);

const primaryBtnSx = {
    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    color: '#fff',
    textTransform: 'none',
    fontWeight: 700,
    borderRadius: '8px',
    px: 2.5,
    boxShadow: 'none',
    '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)', boxShadow: 'none' },
    '&.Mui-disabled': { background: '#cbd5e1', color: '#fff' },
} as const;

const textBtnSx = { textTransform: 'none', fontWeight: 600, color: '#475569' } as const;

/** Mounts a fresh wizard each time it opens so no state carries over between imports. */
export function DataImportModal(props: DataImportModalProps) {
    return props.open ? <DataImportWizard {...props} /> : null;
}

function DataImportWizard({ open, entity, onClose, onImported }: DataImportModalProps) {
    const config = IMPORT_CONFIGS[entity];
    const [step, setStep] = useState(0);
    const [parsed, setParsed] = useState<ParsedFile | null>(null);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    const [parsing, setParsing] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** Set once the backend accepted the rows: a queued job to poll, or the result it already returned. */
    const [queued, setQueued] = useState<{ importId: string; total: number } | null>(null);
    const [inlineResult, setInlineResult] = useState<ImportResult | null>(null);

    // Polls the BullMQ job until it completes or fails.
    const job = useQuery({
        queryKey: ['importJob', queued?.importId],
        queryFn: () => importService.job(queued!.importId),
        enabled: Boolean(queued),
        refetchInterval: (query) => (TERMINAL_STATES.has(query.state.data?.state ?? '') ? false : JOB_POLL_MS),
        staleTime: 0,
    });
    const result = inlineResult ?? (job.data?.state === 'completed' ? (job.data.result ?? null) : null);
    const jobFailed = job.data?.state === 'failed' ? job.data.failedReason || 'The import job failed.' : null;
    const running = Boolean(queued) && !result && !jobFailed && !job.isError;

    // Refresh lists and tell the caller exactly once, when the result arrives.
    const reported = useRef(false);
    useEffect(() => {
        if (!result || reported.current) return;
        reported.current = true;
        if (result.created > 0) notifyCrmUpdate(`/api/${entity}`);
        onImported(result.created);
    }, [result, entity, onImported]);

    const mappedRows = useMemo(
        () => (parsed ? mapAndValidateRows(entity, parsed, mapping) : []),
        [entity, parsed, mapping]
    );
    const validRows = useMemo(() => mappedRows.filter((r) => r.errors.length === 0), [mappedRows]);

    const missingRequired = config.fields.filter((f) => f.required && !mapping[f.key]);

    const handleFile = async (file: File) => {
        setError(null);
        setParsing(true);
        try {
            const result = await parseFile(file);
            setParsed(result);
            setMapping(autoMapColumns(entity, result.headers));
            setStep(1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read this file.');
        } finally {
            setParsing(false);
        }
    };

    const handleImport = async () => {
        if (validRows.length === 0) return;
        setStarting(true);
        setError(null);
        try {
            const rows = validRows.map(({ rowNumber, values }) => ({ rowNumber, values }));
            const started = await importService.start(entity, rows, parsed?.fileName);
            if (started.status === 'completed') setInlineResult(started.result);
            else setQueued({ importId: started.importId, total: started.total });
            setStep(3);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
        } finally {
            setStarting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={starting ? undefined : onClose}
            fullWidth
            maxWidth="md"
            slotProps={{ paper: { sx: { borderRadius: '14px', boxShadow: '0 20px 50px rgba(15,23,42,0.18)' } } }}
        >
            <DialogTitle sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', pb: 1 }}>
                Import {config.plural}
            </DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
                    {STEPS.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {step === 0 && (
                    <FileUploadDropzone
                        loading={parsing}
                        error={error}
                        entityPlural={config.plural}
                        onFileSelected={handleFile}
                        onDownloadTemplate={() => downloadSampleTemplate(entity)}
                    />
                )}

                {step === 1 && parsed && (
                    <ColumnMappingStep config={config} parsed={parsed} mapping={mapping} onChange={setMapping} />
                )}

                {step === 2 && parsed && (
                    <Box>
                        <ImportPreviewStep config={config} rows={mappedRows} />
                        {validRows.length === 0 && (
                            <Alert severity="warning" sx={{ mt: 2, fontSize: '0.8rem' }}>
                                No valid rows to import. Go back and adjust the column mapping.
                            </Alert>
                        )}
                        {error && (
                            <Alert severity="error" sx={{ mt: 2, fontSize: '0.8rem' }}>
                                {error}
                            </Alert>
                        )}
                    </Box>
                )}

                {step === 3 && (
                    <ImportResultsStep
                        plural={config.plural}
                        total={queued?.total ?? result?.total ?? validRows.length}
                        progress={result ? 100 : (job.data?.progress ?? 0)}
                        state={result ? 'completed' : (job.data?.state ?? 'waiting')}
                        result={result}
                        error={jobFailed ?? (job.isError ? 'Lost track of the import. It may still finish; refresh the list in a moment.' : null)}
                    />
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} disabled={starting} sx={textBtnSx}>
                    {step === 3 ? (running ? 'Run in background' : 'Close') : 'Cancel'}
                </Button>
                <Box sx={{ flex: 1 }} />
                {step > 0 && step < 3 && (
                    <Button onClick={() => setStep(step - 1)} disabled={starting} sx={textBtnSx}>
                        Back
                    </Button>
                )}
                {step === 1 && (
                    <Button
                        variant="contained"
                        disabled={missingRequired.length > 0}
                        onClick={() => setStep(2)}
                        sx={primaryBtnSx}
                    >
                        {missingRequired.length > 0 ? `Map ${missingRequired[0].label} to continue` : 'Next'}
                    </Button>
                )}
                {step === 2 && (
                    <Button
                        variant="contained"
                        disabled={starting || validRows.length === 0}
                        onClick={handleImport}
                        startIcon={starting ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={primaryBtnSx}
                    >
                        {starting ? 'Uploading…' : `Import ${validRows.length} Record${validRows.length === 1 ? '' : 's'}`}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

const STATE_LABELS: Record<string, string> = {
    waiting: 'Queued, waiting for a worker…',
    delayed: 'Queued, waiting for a worker…',
    active: 'Importing…',
};

function ImportResultsStep({ plural, total, progress, state, result, error }: {
    plural: string;
    total: number;
    progress: number;
    state: string;
    result: ImportResult | null;
    error: string | null;
}) {
    if (error) return <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{error}</Alert>;
    if (!result) {
        return (
            <Box sx={{ py: 3 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', mb: 1 }}>
                    {STATE_LABELS[state] ?? 'Importing…'} ({total} rows)
                </Typography>
                <LinearProgress variant={progress > 0 ? 'determinate' : 'indeterminate'} value={progress} sx={{ height: 8, borderRadius: 4 }} />
                <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mt: 1 }}>
                    You can close this window; the import keeps running on the server.
                </Typography>
            </Box>
        );
    }
    const failedCount = result.failed.length;
    return (
        <Box>
            <Alert severity={failedCount === 0 ? 'success' : result.created > 0 ? 'warning' : 'error'} sx={{ fontSize: '0.8rem', mb: 2 }}>
                Imported {result.created} of {result.total} {plural.toLowerCase()}
                {failedCount > 0 ? `; ${failedCount} row${failedCount === 1 ? '' : 's'} could not be imported.` : '.'}
            </Alert>
            {failedCount > 0 && (
                <Box sx={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    {result.failed.map((row) => (
                        <Box key={row.rowNumber} sx={{ px: 1.5, py: 1, borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 1.5 }}>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', minWidth: 56 }}>Row {row.rowNumber}</Typography>
                            <Typography sx={{ fontSize: '0.75rem', color: '#b91c1c' }}>{row.errors.join(' · ')}</Typography>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}
