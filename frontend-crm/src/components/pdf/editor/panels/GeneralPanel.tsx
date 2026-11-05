'use client';

import React from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { Box, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import { inputSx, LabeledSwitch } from '@/components/settings/form-customization/builderUi';
import { ORIENTATIONS, PAGE_SIZES, PDF_MODULE_LABELS, PDF_MODULES } from '@/types/pdfTemplate.types';
import type { PdfTemplateFormValues } from '@/validations/pdfTemplate.schema';

export function GeneralPanel({ form, readOnly, isNew, isCurrentDefault }: { form: UseFormReturn<PdfTemplateFormValues>; readOnly: boolean; isNew: boolean; isCurrentDefault: boolean }) {
    const { control, register, formState } = form;
    const { errors } = formState;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
                label="Name"
                size="small"
                required
                fullWidth
                disabled={readOnly}
                {...register('name')}
                error={Boolean(errors.name)}
                helperText={errors.name?.message}
                sx={inputSx}
            />
            <TextField
                label="Description"
                size="small"
                fullWidth
                multiline
                minRows={2}
                disabled={readOnly}
                {...register('description')}
                error={Boolean(errors.description)}
                helperText={errors.description?.message}
                sx={inputSx}
            />
            <Controller
                control={control}
                name="module"
                render={({ field }) => (
                    <FormControl size="small" fullWidth sx={inputSx} disabled={readOnly || !isNew}>
                        <InputLabel id="pdf-template-module">Module</InputLabel>
                        <Select labelId="pdf-template-module" label="Module" {...field}>
                            {PDF_MODULES.map((m) => (
                                <MenuItem key={m} value={m}>
                                    {PDF_MODULE_LABELS[m]}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Controller
                    control={control}
                    name="pageSize"
                    render={({ field }) => (
                        <FormControl size="small" fullWidth sx={inputSx} disabled={readOnly}>
                            <InputLabel id="pdf-template-page-size">Page size</InputLabel>
                            <Select labelId="pdf-template-page-size" label="Page size" {...field}>
                                {PAGE_SIZES.map((s) => (
                                    <MenuItem key={s} value={s}>
                                        {s}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                />
                <Controller
                    control={control}
                    name="orientation"
                    render={({ field }) => (
                        <FormControl size="small" fullWidth sx={inputSx} disabled={readOnly}>
                            <InputLabel id="pdf-template-orientation">Orientation</InputLabel>
                            <Select labelId="pdf-template-orientation" label="Orientation" {...field}>
                                {ORIENTATIONS.map((o) => (
                                    <MenuItem key={o} value={o}>
                                        {o === 'portrait' ? 'Portrait' : 'Landscape'}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <Controller
                    control={control}
                    name="isActive"
                    render={({ field }) => (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box>
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>Active</Typography>
                                <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Inactive templates are hidden from users.</Typography>
                            </Box>
                            <LabeledSwitch
                                label="Active"
                                checked={field.value}
                                onChange={field.onChange}
                                disabled={readOnly || isCurrentDefault}
                                disabledReason={isCurrentDefault ? 'The default template cannot be deactivated.' : undefined}
                            />
                        </Box>
                    )}
                />
                <Controller
                    control={control}
                    name="isDefault"
                    render={({ field }) => (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box>
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>Default</Typography>
                                <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Used when users click Print / PDF.</Typography>
                            </Box>
                            <LabeledSwitch
                                label="Default"
                                checked={field.value}
                                onChange={field.onChange}
                                disabled={readOnly || isCurrentDefault}
                                disabledReason={isCurrentDefault ? 'Set another template as the default instead.' : undefined}
                            />
                        </Box>
                    )}
                />
            </Box>
        </Box>
    );
}
