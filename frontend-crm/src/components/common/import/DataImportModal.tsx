'use client';

import React, { useMemo, useState } from 'react';
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
import { FileUploadDropzone } from './FileUploadDropzone';
import { ColumnMappingStep } from './ColumnMappingStep';
import { ImportPreviewStep } from './ImportPreviewStep';
import { autoMapColumns, downloadSampleTemplate, IMPORT_CONFIGS, importRows, mapAndValidateRows } from './importConfigs';
import { parseFile } from './parseFile';
import type { ColumnMapping, ImportEntityType, ParsedFile } from './types';

export interface DataImportModalProps {
    open: boolean;
    entity: ImportEntityType;
    onClose: () => void;
    /** Called after a successful import with the number of created records. */
    onImported: (count: number) => void;
}

const STEPS = ['Upload File', 'Map Columns', 'Preview & Import'];

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
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        setImporting(true);
        setError(null);
        try {
            const count = await importRows(entity, validRows);
            onImported(count);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={importing ? undefined : onClose}
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
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} disabled={importing} sx={textBtnSx}>
                    Cancel
                </Button>
                <Box sx={{ flex: 1 }} />
                {step > 0 && (
                    <Button onClick={() => setStep(step - 1)} disabled={importing} sx={textBtnSx}>
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
                        disabled={importing || validRows.length === 0}
                        onClick={handleImport}
                        startIcon={importing ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={primaryBtnSx}
                    >
                        {importing ? 'Importing…' : `Import ${validRows.length} Record${validRows.length === 1 ? '' : 's'}`}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
