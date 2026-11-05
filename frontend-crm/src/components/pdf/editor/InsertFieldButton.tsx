'use client';

import React, { useState } from 'react';
import { Autocomplete, Box, Button, Popover, TextField, Typography } from '@mui/material';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import type { PdfFieldDefinition } from '@/types/pdfTemplate.types';
import { inputSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';

/** "Insert field" popover: searchable, grouped field picker that inserts `{{path}}`. */
export function InsertFieldButton({ fields, disabled, onInsert }: { fields: PdfFieldDefinition[]; disabled?: boolean; onInsert: (text: string) => void }) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);

    return (
        <>
            <Button
                size="small"
                variant="outlined"
                startIcon={<DataObjectOutlinedIcon sx={{ fontSize: 16 }} />}
                disabled={disabled}
                onClick={(e) => setAnchor(e.currentTarget)}
                aria-haspopup="dialog"
                sx={{ ...secondaryButtonSx, height: 30 }}
            >
                Insert field
            </Button>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{ paper: { sx: { mt: 0.5, p: 1.5, width: 380, borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,0.10)' } } }}
            >
                <Autocomplete<PdfFieldDefinition>
                    open
                    autoHighlight
                    disablePortal
                    options={fields}
                    groupBy={(f) => f.group}
                    getOptionLabel={(f) => `${f.label} (${f.path})`}
                    onChange={(_e, field) => {
                        if (!field) return;
                        onInsert(field.type === 'multiline' ? `{{nl2br ${field.path}}}` : `{{${field.path}}}`);
                        setAnchor(null);
                    }}
                    renderOption={(props, f) => {
                        const { key, ...rest } = props;
                        return (
                            <Box component="li" key={key} {...rest} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important' }}>
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>{f.label}</Typography>
                                <Typography sx={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>{`{{${f.path}}}`}</Typography>
                            </Box>
                        );
                    }}
                    slotProps={{ listbox: { sx: { maxHeight: 320 } }, paper: { sx: { boxShadow: 'none', border: 0 } } }}
                    renderInput={(params) => <TextField {...params} autoFocus size="small" placeholder="Search fields…" sx={inputSx} />}
                />
                <Box sx={{ height: 330 }} />
            </Popover>
        </>
    );
}
