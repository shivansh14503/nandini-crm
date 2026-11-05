'use client';

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Box, InputAdornment, TextField, Typography } from '@mui/material';
import { inputSx } from '@/components/settings/form-customization/builderUi';
import type { PdfTemplateFormValues } from '@/validations/pdfTemplate.schema';

const MARGINS: { key: keyof PdfTemplateFormValues['margins']; label: string; help: string }[] = [
    { key: 'top', label: 'Top', help: 'Space above the body; leave room for the header.' },
    { key: 'bottom', label: 'Bottom', help: 'Space below the body; leave room for the footer.' },
    { key: 'left', label: 'Left', help: 'Also indents the header and footer.' },
    { key: 'right', label: 'Right', help: 'Also indents the header and footer.' },
    { key: 'header', label: 'Header offset', help: 'Distance of the header from the top edge.' },
    { key: 'footer', label: 'Footer offset', help: 'Distance of the footer from the bottom edge.' },
];

export function MarginsPanel({ form, readOnly }: { form: UseFormReturn<PdfTemplateFormValues>; readOnly: boolean }) {
    const { register, formState } = form;
    return (
        <Box>
            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mb: 1.5 }}>All values in millimetres (0–100).</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {MARGINS.map((m) => {
                    const error = formState.errors.margins?.[m.key];
                    return (
                        <TextField
                            key={m.key}
                            label={m.label}
                            type="number"
                            size="small"
                            disabled={readOnly}
                            {...register(`margins.${m.key}`, { valueAsNumber: true })}
                            error={Boolean(error)}
                            helperText={error?.message ?? m.help}
                            slotProps={{
                                htmlInput: { min: 0, max: 100, step: 0.5 },
                                input: { endAdornment: <InputAdornment position="end">mm</InputAdornment> },
                                formHelperText: { sx: { fontSize: '0.68rem', mx: 0.25 } },
                            }}
                            sx={inputSx}
                        />
                    );
                })}
            </Box>
        </Box>
    );
}
