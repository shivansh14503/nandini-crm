'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from '@mui/material';
import { importService } from '@/services';
import { importTracker, isImportFinished, useTrackedImport, type ImportSourceFile } from '@/services/importTracker';
import { ImportProgressPanel } from './ImportProgressPanel';
import { FileUploadDropzone } from './FileUploadDropzone';
import { ColumnMappingStep } from './ColumnMappingStep';
import { ImportPreviewStep } from './ImportPreviewStep';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { autoMapColumns, downloadSampleTemplate, mapAndValidateRows } from './importConfigs';
import { buildImportConfig } from './importFields';
import { parseFile } from './parseFile';
import type { ColumnMapping, ImportEntityType, ParsedFile } from './types';

export interface DataImportModalProps {
    open: boolean;
    entity: ImportEntityType;
    onClose: () => void;
    /**
     * Called once the import has finished while the wizard is open, with the number of created records. The app-wide
     * import snackbar (`BackgroundImports`) already announces every finished import.
     */
    onImported?: (count: number) => void;
}

const STEPS = ['Upload File', 'Map Columns', 'Preview & Import', 'Results'];

const primaryBtnSx = {
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    color: '#fff',
    textTransform: 'none',
    fontWeight: 700,
    borderRadius: '8px',
    px: 2.5,
    boxShadow: 'none',
    '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)', boxShadow: 'none' },
    '&.Mui-disabled': { background: 'var(--crm-slate-300)', color: '#fff' },
} as const;

const textBtnSx = { textTransform: 'none', fontWeight: 600, color: 'var(--crm-slate-600)' } as const;

const cancelImportBtnSx = {
    ...textBtnSx,
    border: '1px solid transparent',
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

/** Mounts a fresh wizard each time it opens so no state carries over between imports. */
export function DataImportModal(props: DataImportModalProps) {
    return props.open ? <DataImportWizard {...props} /> : null;
}

function DataImportWizard({ open, entity, onClose, onImported }: DataImportModalProps) {
    // Every field of the module's creation form (Form Builder configuration), custom fields included.
    const formConfigs = useFormConfigs();
    const config = useMemo(() => buildImportConfig(entity, formConfigs), [entity, formConfigs]);
    const [step, setStep] = useState(0);
    const [parsed, setParsed] = useState<ParsedFile | null>(null);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    const [parsing, setParsing] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** Set once the backend accepted the rows; the app-wide import tracker polls it from there. */
    const [importId, setImportId] = useState<string | null>(null);
    const tracked = useTrackedImport(importId);
    const finished = tracked ? isImportFinished(tracked) : false;
    const running = Boolean(tracked) && !finished;

    // Closing the wizard (Close, "Run in background", Esc, a click outside) hands a running import to the background
    // card; the tracker keeps polling and refreshes the list when it ends.
    useEffect(() => () => {
        if (importId) importTracker.release(importId);
    }, [importId]);

    // Tell the page exactly once, when the result arrives while the wizard is open (the tracker refreshes the list).
    const reported = useRef(false);
    useEffect(() => {
        if (!tracked || !finished || reported.current) return;
        if (tracked.phase !== 'completed' && tracked.phase !== 'cancelled') return;
        reported.current = true;
        if (tracked.created > 0) onImported?.(tracked.created);
    }, [tracked, finished, onImported]);

    const mappedRows = useMemo(
        () => (parsed ? mapAndValidateRows(config, parsed, mapping) : []),
        [config, parsed, mapping]
    );
    const validRows = useMemo(() => mappedRows.filter((r) => r.errors.length === 0), [mappedRows]);

    const missingRequired = config.fields.filter((f) => f.required && !mapping[f.key]);

    const handleFile = async (file: File) => {
        setError(null);
        setParsing(true);
        try {
            const result = await parseFile(file);
            setParsed(result);
            setMapping(autoMapColumns(config, result.headers));
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
            const skipped = mappedRows.filter((r) => r.errors.length > 0).map(({ rowNumber, errors }) => ({ rowNumber, errors }));
            const source: ImportSourceFile | undefined = parsed
                ? { fileName: parsed.fileName, headers: parsed.headers, rowsByNumber: new Map(parsed.rows.map((row, idx) => [idx + 2, row])) }
                : undefined;
            const init = { importId: started.importId, entity, plural: config.plural, skipped, source };
            if (started.status === 'completed') importTracker.trackCompleted(init, started.result);
            else importTracker.track({ ...init, total: started.total });
            setImportId(started.importId);
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
            <DialogTitle sx={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--crm-slate-900)', pb: 1 }}>
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
                        onDownloadTemplate={() => downloadSampleTemplate(config)}
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

                {step === 3 && tracked && <ImportProgressPanel item={tracked} />}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--mui-palette-border-main)' }}>
                <Button onClick={onClose} disabled={starting} sx={textBtnSx}>
                    {step === 3 ? (running ? 'Run in background' : 'Close') : 'Cancel'}
                </Button>
                <Box sx={{ flex: 1 }} />
                {step === 3 && running && tracked && (
                    <Button onClick={() => void importTracker.cancel(tracked.importId)} disabled={tracked.cancelling} sx={cancelImportBtnSx}>
                        {tracked.cancelling ? 'Cancelling…' : 'Cancel import'}
                    </Button>
                )}
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
