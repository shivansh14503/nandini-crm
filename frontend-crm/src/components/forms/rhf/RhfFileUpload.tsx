'use client';

import React, { useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, Link, Tooltip, Typography } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField } from '../FormField';
import type { FieldSize } from '../fieldSizing';
import { recordFileService } from '@/services/recordFile.service';
import { RECORD_FILE_ACCEPT, formatFileSize, isRecordFile, type RecordFile, type RecordFileModule } from '@/types/recordFile.types';

export interface RhfFileUploadProps<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    /** Module the file is uploaded for (the API keeps it with the file). */
    module: RecordFileModule;
    required?: boolean;
    hint?: React.ReactNode;
    disabled?: boolean;
    /** Width token (default `lg`). */
    fieldSize?: FieldSize;
}

const iconButtonSx = {
    width: 32,
    height: 32,
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    borderRadius: '8px',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

const removeButtonSx = {
    ...iconButtonSx,
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

/** Link that opens the uploaded file (PDFs and images in the browser, other files download). */
function FileLink({ file }: { file: RecordFile }) {
    return (
        <Link
            href={recordFileService.fileUrl(file)}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            title={file.fileName}
            sx={{
                color: 'var(--crm-text-blue-700)',
                fontWeight: 600,
                fontSize: '0.85rem',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                '&:hover': { color: 'var(--crm-text-blue-600)' },
            }}
        >
            {file.fileName}
        </Link>
    );
}

/**
 * A file field: pick or drop one file (PDF, image, Word or Excel, up to 10 MB). It uploads at once and the field
 * holds the uploaded file (`{ id, fileName, … }`), which the record links when it saves. The file can be opened,
 * replaced or removed; view mode shows a link to it.
 */
export function RhfFileUpload<T extends FieldValues>({ name, label, module, required, hint, disabled, fieldSize = 'lg' }: RhfFileUploadProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const value: unknown = field.value;
    const file = isRecordFile(value) ? value : null;
    const error = uploadError ?? fieldState.error?.message;

    const pick = () => {
        if (!disabled && !uploading) inputRef.current?.click();
    };

    const upload = async (picked: File | undefined) => {
        if (!picked || disabled) return;
        setUploading(true);
        setUploadError(null);
        try {
            field.onChange(await recordFileService.upload(picked, module));
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'The file could not be uploaded.');
        } finally {
            setUploading(false);
            field.onBlur();
        }
    };

    const frameSx = {
        minHeight: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.25,
        py: 0.5,
        borderRadius: '8px',
        border: `1px ${file ? 'solid' : 'dashed'} ${error ? 'var(--mui-palette-error-main)' : dragging ? 'var(--crm-blue-300)' : 'var(--mui-palette-border-strong)'}`,
        backgroundColor: dragging ? 'var(--mui-palette-primary-soft)' : disabled ? 'var(--mui-palette-background-subtle)' : 'var(--mui-palette-background-paper)',
        transition: 'all 0.15s ease',
        minWidth: 0,
    } as const;

    return (
        <FormField
            name={name}
            label={label}
            required={required}
            hint={hint}
            size={fieldSize}
            fit={null}
            viewValue={file ? <FileLink file={file} /> : ''}
        >
            <input
                ref={inputRef}
                type="file"
                hidden
                accept={RECORD_FILE_ACCEPT}
                onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = '';
                }}
            />
            {file ? (
                <Box sx={frameSx}>
                    <InsertDriveFileOutlinedIcon sx={{ fontSize: 20, color: 'var(--crm-text-blue-600)', flexShrink: 0 }} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <FileLink file={file} />
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>{formatFileSize(file.sizeBytes)}</Typography>
                    </Box>
                    {uploading && <CircularProgress size={18} sx={{ color: 'var(--mui-palette-primary-main)' }} />}
                    {!disabled && !uploading && (
                        <>
                            <Tooltip title="Replace file">
                                <IconButton size="small" aria-label="Replace file" onClick={pick} sx={iconButtonSx}>
                                    <SwapHorizRoundedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove file">
                                <IconButton
                                    size="small"
                                    aria-label="Remove file"
                                    onClick={() => {
                                        setUploadError(null);
                                        field.onChange(null);
                                        field.onBlur();
                                    }}
                                    sx={removeButtonSx}
                                >
                                    <CloseRoundedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}
                </Box>
            ) : (
                <Box
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled || undefined}
                    aria-label={`${label}: choose a file`}
                    onClick={pick}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            pick();
                        }
                    }}
                    onDragOver={(e) => {
                        if (disabled) return;
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        void upload(e.dataTransfer.files?.[0]);
                    }}
                    sx={{
                        ...frameSx,
                        cursor: disabled ? 'default' : 'pointer',
                        outline: 'none',
                        ...(!disabled && {
                            '&:hover, &:focus-visible': {
                                borderColor: 'var(--crm-blue-300)',
                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                '& .file-upload-title': { color: 'var(--crm-text-blue-700)' },
                            },
                            '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                        }),
                    }}
                >
                    {uploading ? (
                        <CircularProgress size={18} sx={{ color: 'var(--mui-palette-primary-main)', flexShrink: 0 }} />
                    ) : (
                        <CloudUploadOutlinedIcon sx={{ fontSize: 20, color: 'var(--mui-palette-text-muted)', flexShrink: 0 }} />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                        <Typography className="file-upload-title" sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--crm-slate-700)', lineHeight: 1.3 }}>
                            {uploading ? 'Uploading…' : 'Choose a file or drop it here'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)', lineHeight: 1.3 }}>
                            PDF, image, Word or Excel · up to 10 MB
                        </Typography>
                    </Box>
                </Box>
            )}
            {error && (
                <Typography role="alert" sx={{ mt: 0.5, mx: '14px', fontSize: '0.75rem', color: 'var(--mui-palette-error-main)' }}>
                    {error}
                </Typography>
            )}
        </FormField>
    );
}
