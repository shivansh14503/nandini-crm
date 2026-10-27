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
                    borderColor: dragging ? '#2563eb' : '#cbd5e1',
                    backgroundColor: dragging ? '#eff6ff' : '#f8fafc',
                    borderRadius: '12px',
                    py: 5,
                    px: 2,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
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
                    <CloudUploadOutlinedIcon sx={{ fontSize: 40, color: '#2563eb' }} />
                )}
                <Typography sx={{ mt: 1, fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                    {loading ? 'Reading file…' : 'Drag & drop your file here, or click to browse'}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b', mt: 0.4 }}>
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
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    flexWrap: 'wrap',
                }}
            >
                <Typography sx={{ fontSize: '0.78rem', color: '#475569', maxWidth: 420 }}>
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
                        borderColor: '#e2e8f0',
                        color: '#1d4ed8',
                        borderRadius: '8px',
                        '&:hover': { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
                    }}
                >
                    📄 Download Sample Template (CSV)
                </Button>
            </Box>
        </Box>
    );
}
