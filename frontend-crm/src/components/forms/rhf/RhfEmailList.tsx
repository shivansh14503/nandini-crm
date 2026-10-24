'use client';

import React from 'react';
import { Box, Button, FormHelperText, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useController, type FieldValues } from 'react-hook-form';
import { EmailRow } from '../EmailRow';
import { useFormMode } from '@/context/FormModeContext';
import type { CorporateEmail } from '@/types/organization.types';

export interface RhfEmailListProps {
    /** Name of the `CorporateEmail[]` field. Defaults to `emailAddresses`. */
    name?: string;
    label?: string;
    required?: boolean;
}

/**
 * Repeatable email list bound to a `CorporateEmail[]` field.
 * Guarantees exactly one primary address whenever at least one row exists.
 */
export function RhfEmailList({
    name = 'emailAddresses',
    label = 'Email Address',
    required,
}: RhfEmailListProps) {
    const { field, fieldState } = useController<FieldValues>({ name });
    const rows: CorporateEmail[] = Array.isArray(field.value) ? field.value : [];

    const errorMessage =
        (fieldState.error as { root?: { message?: string } } | undefined)?.root?.message ??
        fieldState.error?.message;

    const isView = useFormMode().mode === 'view';

    const commit = (next: CorporateEmail[]) => field.onChange(next);

    const handleAdd = () =>
        commit([
            ...rows,
            {
                id: `eml-${Date.now()}`,
                email: '',
                isPrimary: rows.length === 0,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ]);

    const handleChange = (index: number, updated: CorporateEmail) =>
        commit(
            rows.map((row, i) => {
                if (i === index) return updated;
                return updated.isPrimary ? { ...row, isPrimary: false } : row;
            })
        );

    const handleRemove = (index: number) => {
        const next = rows.filter((_, i) => i !== index);
        if (next.length > 0 && !next.some((e) => e.isPrimary)) {
            next[0] = { ...next[0], isPrimary: true };
        }
        commit(next);
    };

    if (isView && rows.length === 0) return null;

    return (
        <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}>
                    {label}
                    {required && (
                        <Box component="span" sx={{ color: '#ef4444', ml: 0.4 }}>
                            *
                        </Box>
                    )}
                </Typography>
                {!isView && (
                <Button
                    size="small"
                    startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                    onClick={handleAdd}
                    sx={{
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#2563eb',
                        backgroundColor: '#eff6ff',
                        px: 1.2,
                        py: 0.3,
                        borderRadius: '6px',
                        border: '1px solid #bfdbfe',
                        '&:hover': { backgroundColor: '#dbeafe' },
                    }}
                >
                    Add Email
                </Button>
                )}
            </Box>

            {rows.map((row, index) => (
                <EmailRow
                    key={row.id}
                    email={row}
                    onChange={(updated) => handleChange(index, updated)}
                    onRemove={() => handleRemove(index)}
                />
            ))}

            {errorMessage && <FormHelperText error>{errorMessage}</FormHelperText>}
        </Box>
    );
}
