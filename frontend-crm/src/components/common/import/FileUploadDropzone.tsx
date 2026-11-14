'use client';

import React, { useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { ACCEPTED_EXTENSIONS } from './parseFile';

export interface FileUploadDropzoneProps {
    loading: boolean;
    error: string | null;
    entityPlural: string;
    onFileSelected: (file: File) => void;
    onDownloadTemplate: () => void;
}

export function FileUploadDropzone({ loading, error, entityPlural, onFileSelected, onDownloadTemplate }: FileUploadDropzoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const handleFiles = (files: FileList | null) => {
        const file = files?.[0];
        if (file) onFileSelected(file);
    };

    return (
        <Box>
            <Box
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        inputRef.current?.click();
                    }
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    handleFiles(e.dataTransfer.files);
                }}
                sx={{
                    border: '2px dashed',
                    borderColor: dragging ? 'var(--mui-palette-primary-main)' : 'var(--mui-palette-border-strong)',
                    backgroundColor: dragging ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-subtle)',
                    borderRadius: '12px',
                    py: 5,
                    px: 2,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': { borderColor: 'var(--mui-palette-primary-main)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    hidden
                    accept={ACCEPTED_EXTENSIONS.join(',')}
                    onChange={(e) => {
                        handleFiles(e.target.files);
                        e.target.value = '';
                    }}
                />
                {loading ? (
                    <CircularProgress size={32} />
                ) : (
                    <CloudUploadOutlinedIcon sx={{ fontSize: 40, color: 'var(--crm-text-blue-600)' }} />
                )}
                <Typography sx={{ mt: 1, fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)' }}>
                    {loading ? 'Reading file…' : 'Drag & drop your file here, or click to browse'}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', mt: 0.4 }}>
                    Supports .csv, .xlsx and .xls (max 10 MB)
                </Typography>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mt: 2, fontSize: '0.8rem' }}>
                    {error}
                </Alert>
            )}

            <Box
                sx={{
                    mt: 2.5,
                    p: 1.8,
                    border: '1px solid var(--mui-palette-border-main)',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    flexWrap: 'wrap',
                }}
            >
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)', maxWidth: 420 }}>
                    Not sure about the format? Use our template: the first row must contain column headers, followed by one {entityPlural.toLowerCase().replace(/s$/, '')} per row.
                </Typography>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={onDownloadTemplate}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        borderColor: 'var(--mui-palette-border-main)',
                        color: 'var(--crm-text-blue-700)',
                        borderRadius: '8px',
                        '&:hover': { borderColor: 'var(--mui-palette-primary-softBorder)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                    }}
                >
                    📄 Download Sample Template (CSV)
                </Button>
            </Box>
        </Box>
    );
}
