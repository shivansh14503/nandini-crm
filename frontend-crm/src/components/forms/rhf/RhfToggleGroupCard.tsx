'use client';

import React from 'react';
import { Box, Chip, Switch, Typography } from '@mui/material';
import { useFormContext, useWatch, type FieldPath, type FieldValues, type PathValue } from 'react-hook-form';
import { useFormMode } from '@/context/FormModeContext';

export interface ToggleItem<T extends FieldValues> {
    name: FieldPath<T>;
    label: string;
    caption?: string;
}

export interface RhfToggleGroupCardProps<T extends FieldValues> {
    items: ToggleItem<T>[];
    /** Called after a switch changes, for forms that mirror values outside React Hook Form. */
    onValueChange?: (name: FieldPath<T>, checked: boolean) => void;
}

/**
 * Card of labelled on/off switches (AMC, Cloud, …) bound to boolean RHF fields; shows Yes/No pills in view mode.
 * Must be rendered inside a `FormProvider`.
 */
export function RhfToggleGroupCard<T extends FieldValues>({ items, onValueChange }: RhfToggleGroupCardProps<T>) {
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: `repeat(${Math.min(items.length, 2)}, 1fr)` },
                gap: 2,
                p: 1.75,
                mb: 2,
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                backgroundColor: '#f8fafc',
            }}
        >
            {items.map((item) => (
                <ToggleCell<T> key={item.name} item={item} onValueChange={onValueChange} />
            ))}
        </Box>
    );
}

function ToggleCell<T extends FieldValues>({
    item,
    onValueChange,
}: {
    item: ToggleItem<T>;
    onValueChange?: (name: FieldPath<T>, checked: boolean) => void;
}) {
    const { control, setValue } = useFormContext<T>();
    const isView = useFormMode().mode === 'view';
    const checked = Boolean(useWatch({ control, name: item.name }));

    const handleChange = (next: boolean) => {
        setValue(item.name, next as PathValue<T, FieldPath<T>>, { shouldDirty: true, shouldValidate: true });
        onValueChange?.(item.name, next);
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
                <Typography sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.82rem', lineHeight: 1.3 }}>{item.label}</Typography>
                {item.caption && <Typography sx={{ color: '#94a3b8', fontSize: '0.72rem' }}>{item.caption}</Typography>}
            </Box>
            {isView ? (
                <Chip
                    label={checked ? 'Yes' : 'No'}
                    size="small"
                    sx={{
                        height: 24,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'default',
                        color: checked ? '#16a34a' : '#64748b',
                        backgroundColor: checked ? '#16a34a1a' : '#64748b1a',
                    }}
                />
            ) : (
                <Switch checked={checked} onChange={(e) => handleChange(e.target.checked)} slotProps={{ input: { 'aria-label': item.label } }} />
            )}
        </Box>
    );
}
