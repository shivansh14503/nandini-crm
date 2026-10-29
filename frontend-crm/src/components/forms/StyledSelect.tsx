import React from 'react';
import { FormControl, Select, MenuItem, Typography } from '@mui/material';
import { fieldSx } from './FormField';
import { useFormMode } from '@/context/FormModeContext';
import { ReadOnlyField } from './ReadOnlyField';
import { fieldSizeSx, type FieldSize } from './fieldSizing';

export interface StyledSelectProps {
    label?: string;
    placeholder?: string;
    value: string;
    onChange: (v: string) => void;
    options: string[];
    required?: boolean;
    disabled?: boolean;
    /** Width cap for standalone use; omit inside a {@link FormField}, which sizes its children. */
    fieldSize?: FieldSize;
}

export function StyledSelect({
    label,
    placeholder,
    value,
    onChange,
    options,
    required,
    disabled,
    fieldSize,
}: StyledSelectProps) {
    const { mode } = useFormMode();
    if (mode === 'view') {
        return <ReadOnlyField label={label ?? ''} value={value} hideWhenEmpty />;
    }

    const placeholderText =
        placeholder || (label ? `Select ${label.replace(/\s*\*$/, '')}` : 'Select an option');

    return (
        <FormControl
            fullWidth
            size="small"
            sx={fieldSize ? { ...fieldSx, ...fieldSizeSx(fieldSize) } : fieldSx}
            required={required}
            disabled={disabled}
        >
            <Select
                displayEmpty
                disabled={disabled}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                renderValue={(selected) => {
                    if (!selected) {
                        return (
                            <Typography component="span" sx={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                                {placeholderText}
                            </Typography>
                        );
                    }
                    return (
                        <Typography component="span" sx={{ color: '#1e293b', fontSize: '0.85rem' }}>
                            {selected}
                        </Typography>
                    );
                }}
                sx={{ fontSize: '0.85rem' }}
            >
                <MenuItem value="" disabled sx={{ fontSize: '0.85rem', color: '#9ca3af', display: 'none' }}>
                    <em>{placeholderText}</em>
                </MenuItem>
                {options.map((o) => (
                    <MenuItem key={o} value={o} sx={{ fontSize: '0.85rem' }}>
                        {o}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}
