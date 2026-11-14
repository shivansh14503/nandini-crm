'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { quotationService } from '@/services/quotation.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import type { Quotation } from '@/types/quotation.types';
import { inputSx } from '@/components/settings/form-customization/builderUi';

export interface PickedRecord {
    id: string;
    label: string;
}

/** Server-side quotation search (code / title / customer), 10 results at a time. */
export function QuotationPicker({ value, onChange }: { value: PickedRecord | null; onChange: (record: PickedRecord | null) => void }) {
    const [input, setInput] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(input.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [input]);

    const params = { page: 1, limit: 10, search: search || undefined, sortBy: 'createdAt', sortOrder: 'desc' as const };
    const { data, isFetching } = useQuery({
        queryKey: queryKeys.quotations.list({ ...params, picker: 'pdf' }),
        queryFn: () => quotationService.list(params),
        staleTime: 30_000,
    });

    const options: (Quotation | PickedRecord)[] = data?.data ?? [];
    const toPicked = (q: Quotation | PickedRecord): PickedRecord =>
        'label' in q ? q : { id: q.id, label: `${q.quotationCode} · ${q.organizationName || q.contactName || q.quotationTitle}` };

    return (
        <Autocomplete<Quotation | PickedRecord>
            size="small"
            options={options}
            value={value}
            loading={isFetching}
            filterOptions={(x) => x}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            getOptionLabel={(o) => toPicked(o).label}
            onInputChange={(_e, next, reason) => {
                if (reason === 'input') setInput(next);
            }}
            onChange={(_e, next) => onChange(next ? toPicked(next) : null)}
            renderOption={(props, o) => {
                const { key, ...rest } = props;
                const q = 'label' in o ? null : o;
                return (
                    <Box component="li" key={key} {...rest} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important' }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{q ? q.quotationCode : toPicked(o).label}</Typography>
                        {q && <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>{[q.quotationTitle, q.organizationName || q.contactName].filter(Boolean).join(' · ')}</Typography>}
                    </Box>
                );
            }}
            noOptionsText={search ? 'No matching quotations' : 'Type to search quotations'}
            renderInput={(params) => <TextField {...params} placeholder="Search quotations…" sx={{ ...inputSx, minWidth: 220 }} slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, 'aria-label': 'Preview record' } }} />}
        />
    );
}
