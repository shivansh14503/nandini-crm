'use client';

import React, { useRef, useState } from 'react';
import { Autocomplete, Box, Button, Popover, TextField, Typography, type PopperProps, type SxProps, type Theme } from '@mui/material';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import type { PdfFieldDefinition } from '@/types/pdfTemplate.types';
import { inputSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';

/** Renders the option list in normal flow under the search box (a floating Popper inside a Popover misplaces it). */
function InlineListPopper({ children, open, className }: PopperProps) {
    if (!open) return null;
    return (
        <Box className={className} sx={{ mt: 1 }}>
            {children as React.ReactNode}
        </Box>
    );
}

/** Searchable, grouped list of record fields (image fields excluded). */
export function FieldSearchList({ fields, onPick, autoFocusRef }: { fields: PdfFieldDefinition[]; onPick: (field: PdfFieldDefinition) => void; autoFocusRef?: React.Ref<HTMLInputElement> }) {
    const options = fields.filter((f) => f.type !== 'image');
    return (
        <Autocomplete<PdfFieldDefinition>
            open
            autoHighlight
            options={options}
            groupBy={(f) => f.group}
            getOptionLabel={(f) => `${f.label} (${f.path})`}
            onChange={(_e, field) => field && onPick(field)}
            renderOption={(props, f) => {
                const { key, ...rest } = props;
                return (
                    <Box component="li" key={key} {...rest} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important' }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{f.label}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)', fontFamily: 'monospace' }}>{f.path}</Typography>
                    </Box>
                );
            }}
            slots={{ popper: InlineListPopper }}
            slotProps={{ listbox: { sx: { maxHeight: 300, py: 0 } }, paper: { sx: { boxShadow: 'none', border: 0, borderRadius: 0, m: 0 } } }}
            renderInput={(params) => <TextField {...params} inputRef={autoFocusRef} size="small" placeholder="Search fields…" sx={inputSx} />}
        />
    );
}

/** Button that opens the field search in a popover. */
export function FieldPickerButton({
    fields,
    onPick,
    label = 'Insert field',
    disabled,
    sx,
    variant = 'button',
}: {
    fields: PdfFieldDefinition[];
    onPick: (field: PdfFieldDefinition) => void;
    label?: string;
    disabled?: boolean;
    sx?: SxProps<Theme>;
    variant?: 'button' | 'compact';
}) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);
    return (
        <>
            <Button
                size="small"
                variant="outlined"
                startIcon={<DataObjectOutlinedIcon sx={{ fontSize: 16 }} />}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                    e.stopPropagation();
                    setAnchor(e.currentTarget);
                }}
                aria-haspopup="dialog"
                sx={[{ ...secondaryButtonSx, height: variant === 'compact' ? 26 : 30, fontSize: variant === 'compact' ? '0.72rem' : '0.8rem', px: 1 }, ...(Array.isArray(sx) ? sx : [sx])]}
            >
                {label}
            </Button>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                onClick={(e) => e.stopPropagation()}
                disableAutoFocus
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{
                    paper: { sx: { mt: 0.5, p: 1.5, width: 360, borderRadius: '10px', border: '1px solid var(--mui-palette-border-main)', boxShadow: '0 8px 24px rgba(15,23,42,0.10)' } },
                    transition: { onEntered: () => searchRef.current?.focus() },
                }}
            >
                <FieldSearchList
                    fields={fields}
                    autoFocusRef={searchRef}
                    onPick={(field) => {
                        setAnchor(null);
                        onPick(field);
                    }}
                />
            </Popover>
        </>
    );
}
