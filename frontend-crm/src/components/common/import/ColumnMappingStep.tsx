'use client';

import React from 'react';
import { Alert, Box, MenuItem, Select, Typography } from '@mui/material';
import type { ColumnMapping, ImportEntityConfig, ParsedFile } from './types';

export interface ColumnMappingStepProps {
    config: ImportEntityConfig;
    parsed: ParsedFile;
    mapping: ColumnMapping;
    onChange: (mapping: ColumnMapping) => void;
}

export function ColumnMappingStep({ config, parsed, mapping, onChange }: ColumnMappingStepProps) {
    const anyMapped = Object.values(mapping).some(Boolean);

    return (
        <Box>
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mb: 1.5 }}>
                Match the columns found in <strong>{parsed.fileName}</strong> ({parsed.rows.length} rows) to CRM fields.
            </Typography>

            {!anyMapped && (
                <Alert severity="warning" sx={{ mb: 2, fontSize: '0.8rem' }}>
                    None of the file headers matched automatically. Please map the columns manually.
                </Alert>
            )}

            <Box sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', overflow: 'hidden' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', backgroundColor: 'var(--mui-palette-background-subtle)', px: 2, py: 1, borderBottom: '1px solid var(--mui-palette-border-main)' }}>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', letterSpacing: 0.4 }}>CRM FIELD</Typography>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', letterSpacing: 0.4 }}>COLUMN IN FILE</Typography>
                </Box>
                {config.fields.map((f, i) => (
                    <Box
                        key={f.key}
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            alignItems: 'center',
                            gap: 2,
                            px: 2,
                            py: 1,
                            borderBottom: i === config.fields.length - 1 ? 'none' : '1px solid var(--mui-palette-border-light)',
                        }}
                    >
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                            {f.label}
                            {f.required && <Box component="span" sx={{ color: 'var(--mui-palette-error-main)', ml: 0.4 }}>*</Box>}
                        </Typography>
                        <Select
                            size="small"
                            displayEmpty
                            value={mapping[f.key] ?? ''}
                            onChange={(e) => onChange({ ...mapping, [f.key]: e.target.value })}
                            error={f.required && !mapping[f.key]}
                            sx={{ fontSize: '0.82rem', backgroundColor: 'var(--mui-palette-background-paper)' }}
                        >
                            <MenuItem value="" sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-muted)' }}>
                                — Don&apos;t import —
                            </MenuItem>
                            {parsed.headers.map((h) => (
                                <MenuItem key={h} value={h} sx={{ fontSize: '0.82rem' }}>
                                    {h}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
