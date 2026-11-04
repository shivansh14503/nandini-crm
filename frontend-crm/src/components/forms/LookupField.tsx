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
import { compareOrganizationNames } from '@/utils/organizationName';

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
    /**
     * How typed text filters `options`. `substring` (default): case-insensitive contains. `organization`: also keeps
     * names that are the same / similar legal name ("abc private limited" still shows "ABC Pvt Ltd").
     */
    matchMode?: 'substring' | 'organization';
}

const MAX_VISIBLE_OPTIONS = 50;

/** Substring matches first (in their original order), then organization-name matches ranked by closeness. */
function filterOrganizationOptions(options: string[], inputValue: string): string[] {
    const q = inputValue.trim().toLowerCase();
    if (!q) return options.slice(0, MAX_VISIBLE_OPTIONS);
    const contains: string[] = [];
    const similar: { option: string; score: number }[] = [];
    for (const option of options) {
        if (option.toLowerCase().includes(q)) {
            contains.push(option);
        } else {
            const { matchKind, score } = compareOrganizationNames(inputValue, option);
            if (matchKind !== 'none') similar.push({ option, score });
        }
    }
    similar.sort((a, b) => b.score - a.score);
    return [...contains, ...similar.map((s) => s.option)].slice(0, MAX_VISIBLE_OPTIONS);
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
    matchMode = 'substring',
}: LookupFieldProps) {
    const handleLookup = onLookupClick ?? onSelectClick;

    const handleClear = () => {
        onChange('');
        onClear?.();
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ...(fieldSize ? fieldSizeSx(fieldSize) : {}) }}>
            {/* Always an Autocomplete (even with no options yet) so the input isn't remounted, and loses focus, when suggestions load mid-typing. */}
            <Autocomplete
                freeSolo
                // The separate [X] button already clears the field; hide the Autocomplete's built-in clear icon.
                disableClearable
                disabled={disabled}
                options={options}
                value={value || ''}
                // Controlled by `value` so selections made from the lookup modal show up immediately.
                inputValue={value || ''}
                // Case-insensitive substring match on what is typed (plus legal-name / fuzzy matches for organizations);
                // capped to keep long directories snappy.
                filterOptions={(opts, { inputValue }) => {
                    if (matchMode === 'organization') return filterOrganizationOptions(opts, inputValue);
                    const q = inputValue.trim().toLowerCase();
                    return (q ? opts.filter((o) => o.toLowerCase().includes(q)) : opts).slice(0, MAX_VISIBLE_OPTIONS);
                }}
                // Only user edits propagate; 'reset' (MUI echoing `value` back) would otherwise fight a picked option.
                onInputChange={(_, newInputValue, reason) => {
                    if (reason === 'input' || reason === 'clear') onChange(newInputValue);
                }}
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
