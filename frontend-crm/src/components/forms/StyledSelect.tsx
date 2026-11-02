import React from 'react';
import { FormControl, Select, MenuItem, Typography, Box } from '@mui/material';
import { fieldSx } from './FormField';
import { useFormMode } from '@/context/FormModeContext';
import { useCurrentFieldName, useFieldOverride } from '@/context/FormConfigContext';
import { ReadOnlyField } from './ReadOnlyField';
import { fieldSizeSx, type FieldSize } from './fieldSizing';

export interface StyledSelectProps {
    label?: string;
    placeholder?: string;
    value: string;
    onChange: (v: string) => void;
    options: string[];
    /** Display labels for values whose label differs from the stored value. */
    optionLabels?: Record<string, string>;
    required?: boolean;
    disabled?: boolean;
    /** Width cap for standalone use; omit inside a {@link FormField}, which sizes its children. */
    fieldSize?: FieldSize;
}

/**
 * Shared dropdown. Inside a module form's FormConfigProvider it takes the admin-configured options of the
 * field it sits in (via the enclosing FormField's name). A saved value that is no longer offered (an option an
 * admin archived) is still listed, flagged "Archived", so historical records keep showing and saving it.
 */
export function StyledSelect({
    label,
    placeholder: basePlaceholder,
    value,
    onChange,
    options: baseOptions,
    optionLabels: baseOptionLabels,
    required,
    disabled,
    fieldSize,
}: StyledSelectProps) {
    const { mode } = useFormMode();
    const fieldName = useCurrentFieldName();
    const override = useFieldOverride(fieldName, { label: label ?? '', options: baseOptions, placeholder: basePlaceholder });
    const options = override?.options ?? baseOptions;
    const optionLabels = override?.optionLabels ?? baseOptionLabels;
    const placeholder = override ? override.placeholder : basePlaceholder;
    const display = (v: string) => optionLabels?.[v] ?? v;

    if (mode === 'view') {
        return <ReadOnlyField label={label ?? ''} value={value ? display(value) : value} hideWhenEmpty />;
    }

    const isArchivedValue = Boolean(value) && !options.includes(value);
    const menuOptions = isArchivedValue ? [...options, value] : options;

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
                            {display(selected)}
                        </Typography>
                    );
                }}
                sx={{ fontSize: '0.85rem' }}
            >
                <MenuItem value="" disabled sx={{ fontSize: '0.85rem', color: '#9ca3af', display: 'none' }}>
                    <em>{placeholderText}</em>
                </MenuItem>
                {menuOptions.map((o) => {
                    const archived = isArchivedValue && o === value;
                    return (
                        <MenuItem key={o} value={o} sx={{ fontSize: '0.85rem' }}>
                            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                <span>{display(o)}</span>
                                {archived && (
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 'auto',
                                            fontSize: '0.64rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.04em',
                                            textTransform: 'uppercase',
                                            color: '#b45309',
                                            backgroundColor: '#fef3c7',
                                            border: '1px solid #fde68a',
                                            borderRadius: '4px',
                                            px: 0.6,
                                            py: 0.1,
                                        }}
                                    >
                                        Archived
                                    </Box>
                                )}
                            </Box>
                        </MenuItem>
                    );
                })}
            </Select>
        </FormControl>
    );
}
