'use client';

import React from 'react';
import {
    Box,
    TextField,
    IconButton,
    Autocomplete,
    Tooltip,
    CircularProgress,
} from '@mui/material';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ClearIcon from '@mui/icons-material/Clear';
import { fieldSx } from './FormField';
import { fieldSizeSx, type FieldSize } from './fieldSizing';

export interface LookupFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    options?: string[];
    /** Opens the record picker (the `[ > ]` directory button). */
    onLookupClick?: () => void;
    /** @deprecated Use `onLookupClick`. */
    onSelectClick?: () => void;
    /** Called after the clear button resets the value. */
    onClear?: () => void;
    /** Shows a spinner in the directory button and disables it. */
    loading?: boolean;
    disabled?: boolean;
    required?: boolean;
    lookupTooltip?: string;
    /** Width cap (input + action buttons) for standalone use; omit inside a FormField, which sizes its children. */
    fieldSize?: FieldSize;
}

const actionButtonSx = {
    width: 34,
    height: 34,
    borderRadius: '6px',
    backgroundColor: '#1e3a8a',
    color: '#fff',
    flexShrink: 0,
    '&:hover': { backgroundColor: '#1d4ed8' },
    '&.Mui-disabled': { backgroundColor: '#e2e8f0', color: '#94a3b8' },
} as const;

export function LookupField({
    value,
    onChange,
    placeholder = 'Type or select...',
    options = [],
    onLookupClick,
    onSelectClick,
    onClear,
    loading = false,
    disabled = false,
    required = false,
    lookupTooltip = 'Select from Directory',
    fieldSize,
}: LookupFieldProps) {
    const handleLookup = onLookupClick ?? onSelectClick;

    const handleClear = () => {
        onChange('');
        onClear?.();
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ...(fieldSize ? fieldSizeSx(fieldSize) : {}) }}>
            {options.length > 0 ? (
                <Autocomplete
                    freeSolo
                    disabled={disabled}
                    options={options}
                    value={value || ''}
                    // Controlled by `value` so selections made from the lookup modal show up immediately.
                    inputValue={value || ''}
                    onInputChange={(_, newInputValue) => onChange(newInputValue)}
                    onChange={(_, newValue) => onChange(newValue || '')}
                    sx={{ flex: 1, ...fieldSx }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            size="small"
                            placeholder={placeholder}
                            required={required}
                        />
                    )}
                />
            ) : (
                <TextField
                    fullWidth
                    size="small"
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    required={required}
                    sx={fieldSx}
                />
            )}

            {/* Select / Search Action Button */}
            <Tooltip title={lookupTooltip}>
                <span>
                    <IconButton
                        size="small"
                        aria-label={lookupTooltip}
                        onClick={handleLookup}
                        disabled={disabled || loading}
                        sx={actionButtonSx}
                    >
                        {loading ? (
                            <CircularProgress size={14} sx={{ color: '#94a3b8' }} />
                        ) : (
                            <ArrowForwardIosIcon sx={{ fontSize: 13 }} />
                        )}
                    </IconButton>
                </span>
            </Tooltip>

            {/* Clear Action Button */}
            <Tooltip title="Clear selection">
                <span>
                    <IconButton
                        size="small"
                        aria-label="Clear selection"
                        onClick={handleClear}
                        disabled={disabled || !value}
                        sx={actionButtonSx}
                    >
                        <ClearIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </span>
            </Tooltip>
        </Box>
    );
}
