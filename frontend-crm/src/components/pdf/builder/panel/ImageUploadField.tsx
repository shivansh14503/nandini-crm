'use client';

import React, { useRef, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { pdfTemplateService } from '@/services/pdfTemplate.service';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';

const MAX_BYTES = 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Upload (PNG / JPEG / WebP ≤ 1 MB) with a preview; stores the returned asset key. */
export function ImageUploadField({
    value,
    onChange,
    onError,
    disabled,
    emptyLabel = 'No image',
    removable = true,
}: {
    value: string | undefined;
    onChange: (key: string | undefined) => void;
    onError: (message: string) => void;
    disabled?: boolean;
    emptyLabel?: string;
    removable?: boolean;
}) {
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);

    const upload = async (file: File) => {
        if (!TYPES.includes(file.type)) return onError('Images must be PNG, JPEG or WebP.');
        if (file.size > MAX_BYTES) return onError('Images cannot exceed 1 MB.');
        setUploading(true);
        try {
            const asset = await pdfTemplateService.uploadAsset(file);
            onChange(asset.key);
        } catch (err) {
            onError(errorMessage(err, 'The image could not be uploaded.'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 120, height: 56, borderRadius: '8px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', overflow: 'hidden', flexShrink: 0 }}>
                    {value ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not a static asset
                        <img src={pdfTemplateService.assetUrl(value)} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : (
                        <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>{emptyLabel}</Typography>
                    )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <input
                        ref={fileRef}
                        type="file"
                        accept={TYPES.join(',')}
                        hidden
                        aria-label="Upload image"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void upload(file);
                        }}
                    />
                    <Button
                        size="small"
                        variant="outlined"
                        disabled={disabled || uploading}
                        startIcon={uploading ? <CircularProgress size={14} /> : <UploadOutlinedIcon sx={{ fontSize: 16 }} />}
                        onClick={() => fileRef.current?.click()}
                        sx={secondaryButtonSx}
                    >
                        {value ? 'Replace' : 'Upload'}
                    </Button>
                    {value && removable && (
                        <Button size="small" variant="text" disabled={disabled} startIcon={<DeleteOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => onChange(undefined)} sx={{ textTransform: 'none', fontSize: '0.78rem', color: '#64748b' }}>
                            Remove
                        </Button>
                    )}
                </Box>
            </Box>
            <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', mt: 0.5 }}>PNG, JPEG or WebP, up to 1 MB.</Typography>
        </Box>
    );
}
