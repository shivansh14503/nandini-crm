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

const capitalize = (text: string) => text.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());

export function ColumnMappingStep({ config, parsed, mapping, onChange }: ColumnMappingStepProps) {
    const anyMapped = Object.values(mapping).some(Boolean);
    const mappedCount = config.fields.filter((f) => mapping[f.key]).length;

    return (
        <Box>
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mb: 1.5 }}>
                Match the columns found in <strong>{parsed.fileName}</strong> ({parsed.rows.length} rows) to CRM fields. Every field of the{' '}
                {config.singular.toLowerCase()} form can be imported; {mappedCount} of {config.fields.length} are mapped.
            </Typography>

            {!anyMapped && (
                <Alert severity="warning" sx={{ mb: 2, fontSize: '0.8rem' }}>
                    None of the file headers matched automatically. Please map the columns manually.
                </Alert>
            )}

            <Box sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', overflow: 'hidden' }}>
                <Box
                    sx={{
                        display: { xs: 'none', sm: 'grid' },
                        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                        px: 2,
                        py: 1,
                        borderBottom: '1px solid var(--mui-palette-border-main)',
                    }}
                >
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', letterSpacing: 0.4 }}>CRM FIELD</Typography>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', letterSpacing: 0.4 }}>COLUMN IN FILE</Typography>
                </Box>
                {config.fields.map((f, i) => {
                    const newSection = f.section && f.section !== config.fields[i - 1]?.section;
                    return (
                        <React.Fragment key={f.key}>
                            {newSection && (
                                <Typography
                                    sx={{
                                        px: 2,
                                        pt: 1.25,
                                        pb: 0.5,
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        letterSpacing: 0.4,
                                        color: 'var(--mui-palette-text-muted)',
                                        backgroundColor: 'var(--mui-palette-background-subtle)',
                                        borderBottom: '1px solid var(--mui-palette-border-light)',
                                    }}
                                >
                                    {capitalize(f.section ?? '').toUpperCase()}
                                </Typography>
                            )}
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' },
                                    alignItems: 'center',
                                    gap: { xs: 0.75, sm: 2 },
                                    px: 2,
                                    py: 1,
                                    borderBottom: i === config.fields.length - 1 ? 'none' : '1px solid var(--mui-palette-border-light)',
                                }}
                            >
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                        {f.label}
                                        {f.required && <Box component="span" sx={{ color: 'var(--mui-palette-error-main)', ml: 0.4 }}>*</Box>}
                                    </Typography>
                                    {f.hint && (
                                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)', overflowWrap: 'anywhere' }}>{f.hint}</Typography>
                                    )}
                                </Box>
                                <Select
                                    size="small"
                                    displayEmpty
                                    value={mapping[f.key] ?? ''}
                                    onChange={(e) => onChange({ ...mapping, [f.key]: e.target.value })}
                                    error={f.required && !mapping[f.key]}
                                    inputProps={{ 'aria-label': `Column for ${f.label}` }}
                                    sx={{ minWidth: 0, fontSize: '0.82rem', backgroundColor: 'var(--mui-palette-background-paper)' }}
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
                        </React.Fragment>
                    );
                })}
            </Box>
        </Box>
    );
}
