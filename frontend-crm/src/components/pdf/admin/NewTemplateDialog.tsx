'use client';

import React, { useMemo, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Select,
    Typography,
} from '@mui/material';
import { PDF_MODULE_LABELS, PDF_MODULES, type PdfModule, type PdfTemplateListItem } from '@/types/pdfTemplate.types';
import { inputSx, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';

const BLANK = '__blank__';

/** Choose the module and a starting point (a system template or blank) for a new template. */
export function NewTemplateDialog({
    open,
    templates,
    onClose,
    onContinue,
}: {
    open: boolean;
    templates: PdfTemplateListItem[];
    onClose: () => void;
    onContinue: (module: PdfModule, sourceTemplateId: string | null) => void;
}) {
    const [module, setModule] = useState<PdfModule>('QUOTATION');
    const [source, setSource] = useState<string>(BLANK);
    const systemTemplates = useMemo(() => templates.filter((t) => t.isSystem && t.module === module), [templates, module]);
    const sourceValue = source === BLANK || systemTemplates.some((t) => t.id === source) ? source : BLANK;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>New PDF template</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
                <FormControl size="small" fullWidth sx={inputSx}>
                    <InputLabel id="new-template-module">Module</InputLabel>
                    <Select labelId="new-template-module" label="Module" value={module} onChange={(e) => setModule(e.target.value as PdfModule)}>
                        {PDF_MODULES.map((m) => (
                            <MenuItem key={m} value={m}>
                                {PDF_MODULE_LABELS[m]}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Box>
                    <Typography id="new-template-source" sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-700)', mb: 0.5 }}>
                        Start from
                    </Typography>
                    <RadioGroup aria-labelledby="new-template-source" value={sourceValue} onChange={(e) => setSource(e.target.value)}>
                        {systemTemplates.map((t) => (
                            <FormControlLabel
                                key={t.id}
                                value={t.id}
                                control={<Radio size="small" />}
                                label={
                                    <Box>
                                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{t.name}</Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>{t.description}</Typography>
                                    </Box>
                                }
                                sx={{ alignItems: 'flex-start', mb: 0.75, '& .MuiRadio-root': { pt: 0.25 } }}
                            />
                        ))}
                        <FormControlLabel
                            value={BLANK}
                            control={<Radio size="small" />}
                            label={
                                <Box>
                                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>Blank</Typography>
                                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>A minimal starting point with the line-items table.</Typography>
                                </Box>
                            }
                            sx={{ alignItems: 'flex-start', '& .MuiRadio-root': { pt: 0.25 } }}
                        />
                    </RadioGroup>
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button variant="outlined" onClick={onClose} sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={() => onContinue(module, sourceValue === BLANK ? null : sourceValue)} sx={primaryButtonSx}>
                    Continue
                </Button>
            </DialogActions>
        </Dialog>
    );
}
