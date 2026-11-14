'use client';

import React from 'react';
import { Box, Button, FormHelperText, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useController, type FieldValues } from 'react-hook-form';
import { EmailRow } from '../EmailRow';
import { fieldSizeSx, type FieldSize } from '../fieldSizing';
import { useFormMode } from '@/context/FormModeContext';
import { useFieldOverride } from '@/context/FormConfigContext';

/** Width of the email cards when the form builder leaves Width on "Auto". */
const DEFAULT_SIZE: FieldSize = 'lg';
import type { CorporateEmail } from '@/types/organization.types';

export interface RhfEmailListProps {
    /** Name of the `CorporateEmail[]` field. Defaults to `emailAddresses`. */
    name?: string;
    label?: string;
    required?: boolean;
    hint?: React.ReactNode;
    /** Placeholder of each address input. */
    placeholder?: string;
    /**
     * Width token, for renderers outside a module form (the builder preview passes the admin's choice). Inside a
     * module form the form builder's Width wins; "Auto" (or none) keeps `lg`.
     */
    fieldSize?: FieldSize | null;
    /** Informational (non-error) notes keyed by lowercased email address, shown under the matching row. */
    emailNotices?: Record<string, React.ReactNode>;
}

/**
 * Repeatable email list bound to a `CorporateEmail[]` field.
 * Guarantees exactly one primary address whenever at least one row exists.
 */
export function RhfEmailList({
    name = 'emailAddresses',
    label: baseLabel = 'Email Address',
    required: baseRequired,
    hint: baseHint,
    placeholder: basePlaceholder,
    fieldSize: baseSize,
    emailNotices,
}: RhfEmailListProps) {
    const { field, fieldState } = useController<FieldValues>({ name });
    // Form builder settings for this field: label, hint, placeholder, width, required (only tightened), visibility.
    const override = useFieldOverride(name, {
        label: baseLabel,
        required: baseRequired,
        hint: baseHint,
        placeholder: basePlaceholder,
        fieldSize: DEFAULT_SIZE,
    });
    const label = override?.label ?? baseLabel;
    const required = override?.required ?? baseRequired;
    const hint = override ? override.hint : baseHint;
    const placeholder = (override ? override.placeholder : basePlaceholder) || undefined;
    // "Auto" keeps the card width that fits an address plus its flags.
    const size: FieldSize = override
        ? override.sizeIsAuto
            ? DEFAULT_SIZE
            : (override.fieldSize ?? DEFAULT_SIZE)
        : (baseSize ?? DEFAULT_SIZE);
    const savedRows: CorporateEmail[] = Array.isArray(field.value) ? field.value : [];
    // The list always shows at least one address input and the last one can't be removed. An empty list shows a
    // blank primary row that is only written to the form once the user fills it, so it never dirties the form.
    const blankRowId = `eml-${React.useId()}`;
    const rows: CorporateEmail[] =
        savedRows.length > 0
            ? savedRows
            : [{ id: blankRowId, email: '', isPrimary: true, isOptedOut: false, isInvalidBounce: false }];
    const canRemove = rows.length > 1;

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
        if (!canRemove) return;
        const next = rows.filter((_, i) => i !== index);
        if (next.length > 0 && !next.some((e) => e.isPrimary)) {
            next[0] = { ...next[0], isPrimary: true };
        }
        commit(next);
    };

    if (override?.hidden || (isView && savedRows.length === 0)) return null;

    return (
        // Capped so the email cards (address + flags) don't stretch across wide layouts.
        // A grid cell like any other field: `data-field-size="full"` makes FormGrid span the whole row.
        <Box data-field={name} data-field-size={size} sx={{ mb: 1, minWidth: 0, ...fieldSizeSx(size) }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, color: 'var(--crm-gray-700)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {label}
                        {required && (
                            <Box component="span" sx={{ color: 'var(--crm-red-500)', ml: 0.4 }}>
                                *
                            </Box>
                        )}
                    </Typography>
                    {hint && !isView && (
                        <Typography variant="caption" noWrap sx={{ color: 'var(--crm-gray-400)', fontSize: '0.72rem' }}>
                            {hint}
                        </Typography>
                    )}
                </Box>
                {!isView && (
                <Button
                    size="small"
                    startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                    onClick={handleAdd}
                    sx={{
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--crm-text-blue-600)',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        px: 1.2,
                        py: 0.3,
                        borderRadius: '6px',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        '&:hover': { backgroundColor: 'var(--crm-blue-100)' },
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
                    onRemove={canRemove ? () => handleRemove(index) : undefined}
                    notice={emailNotices?.[(row.email ?? '').trim().toLowerCase()]}
                    placeholder={placeholder}
                />
            ))}

            {errorMessage && <FormHelperText error>{errorMessage}</FormHelperText>}
        </Box>
    );
}
