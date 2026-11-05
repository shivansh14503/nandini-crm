'use client';

import React, { useRef, useState } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { errorMessage, inputSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { pdfTemplateService } from '@/services/pdfTemplate.service';
import type { PdfTemplateFormValues } from '@/validations/pdfTemplate.schema';

const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const TEXT_FIELDS: { key: Exclude<keyof PdfTemplateFormValues['branding'], 'accentColor' | 'logoAssetKey'>; label: string; multiline?: boolean }[] = [
    { key: 'companyName', label: 'Company name' },
    { key: 'companyAddress', label: 'Address', multiline: true },
    { key: 'companyPhone', label: 'Phone' },
    { key: 'companyEmail', label: 'Email' },
    { key: 'companyGstin', label: 'GSTIN' },
    { key: 'companyWebsite', label: 'Website' },
];

export function BrandingPanel({ form, readOnly, onError }: { form: UseFormReturn<PdfTemplateFormValues>; readOnly: boolean; onError: (message: string) => void }) {
    const { register, formState, setValue, control } = form;
    const accent = useWatch({ control, name: 'branding.accentColor' });
    const logoKey = useWatch({ control, name: 'branding.logoAssetKey' });
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const errors = formState.errors.branding;

    const upload = async (file: File) => {
        if (!LOGO_TYPES.includes(file.type)) return onError('Logos must be PNG, JPEG or WebP images.');
        if (file.size > MAX_LOGO_BYTES) return onError('Logos cannot exceed 1 MB.');
        setUploading(true);
        try {
            const asset = await pdfTemplateService.uploadAsset(file);
            setValue('branding.logoAssetKey', asset.key, { shouldDirty: true });
        } catch (err) {
            onError(errorMessage(err, 'The logo could not be uploaded.'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', mb: 0.75 }}>Logo</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 120, height: 56, borderRadius: '8px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', overflow: 'hidden' }}>
                        {logoKey ? (
                            // eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not a static asset
                            <img src={pdfTemplateService.assetUrl(logoKey)} alt="Template logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        ) : (
                            <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>No logo</Typography>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={LOGO_TYPES.join(',')}
                            hidden
                            aria-label="Upload logo"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void upload(file);
                            }}
                        />
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={readOnly || uploading}
                            startIcon={uploading ? <CircularProgress size={14} /> : <UploadOutlinedIcon sx={{ fontSize: 16 }} />}
                            onClick={() => fileRef.current?.click()}
                            sx={secondaryButtonSx}
                        >
                            {logoKey ? 'Replace' : 'Upload'}
                        </Button>
                        {logoKey && (
                            <Button
                                size="small"
                                variant="text"
                                disabled={readOnly}
                                startIcon={<DeleteOutlinedIcon sx={{ fontSize: 16 }} />}
                                onClick={() => setValue('branding.logoAssetKey', undefined, { shouldDirty: true })}
                                sx={{ textTransform: 'none', fontSize: '0.78rem', color: '#64748b' }}
                            >
                                Remove
                            </Button>
                        )}
                    </Box>
                </Box>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', mt: 0.5 }}>PNG, JPEG or WebP, up to 1 MB. Shown where the template uses the logo.</Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box
                    component="input"
                    type="color"
                    aria-label="Accent colour picker"
                    disabled={readOnly}
                    value={/^#[0-9a-f]{6}$/i.test(accent ?? '') ? accent : '#1d4ed8'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue('branding.accentColor', e.target.value, { shouldDirty: true, shouldValidate: true })}
                    sx={{ width: 40, height: 40, p: 0.25, border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#fff', cursor: readOnly ? 'default' : 'pointer' }}
                />
                <TextField
                    label="Accent colour"
                    size="small"
                    fullWidth
                    disabled={readOnly}
                    {...register('branding.accentColor')}
                    error={Boolean(errors?.accentColor)}
                    helperText={errors?.accentColor?.message ?? 'Available in CSS as var(--accent).'}
                    sx={inputSx}
                />
            </Box>

            {TEXT_FIELDS.map((f) => (
                <TextField
                    key={f.key}
                    label={f.label}
                    size="small"
                    fullWidth
                    multiline={f.multiline}
                    minRows={f.multiline ? 2 : undefined}
                    disabled={readOnly}
                    {...register(`branding.${f.key}`)}
                    error={Boolean(errors?.[f.key])}
                    helperText={errors?.[f.key]?.message}
                    sx={inputSx}
                />
            ))}
        </Box>
    );
}
