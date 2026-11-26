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
import { useTabSelect } from './useTabSelect';
import { useFieldsLocked } from './LockedInputs';
import { rewriteValueKeepingCaret, upperCase, useUndoSafeSanitizer } from './undoSafeInput';

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
    /** Uppercases typed / pasted text (organization names are stored uppercase). */
    uppercase?: boolean;
    /** Re-formats the whole typed value, e.g. name-casing a person's name (must keep the length). */
    formatValue?: (value: string) => string;
    /** Most characters the input accepts (typed or pasted), e.g. the field's schema limit. */
    maxLength?: number;
    /**
     * Extra content after a suggestion's text in the dropdown (e.g. a user's "Out of office until …" chip); null for
     * none. Omit to keep the default option rendering.
     */
    optionAdornment?: (option: string) => React.ReactNode;
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
    backgroundColor: 'var(--crm-fill-blue-600)',
    color: '#fff',
    flexShrink: 0,
    transition: 'background-color 0.15s ease',
    '&:hover': { backgroundColor: 'var(--crm-fill-blue-700)' },
    '&.Mui-disabled': { backgroundColor: 'var(--crm-slate-200)', color: 'var(--mui-palette-text-muted)' },
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
    disabled,
    required = false,
    lookupTooltip = 'Select from Directory',
    fieldSize,
    matchMode = 'substring',
    uppercase = false,
    formatValue,
    maxLength,
    optionAdornment,
}: LookupFieldProps) {
    const handleLookup = onLookupClick ?? onSelectClick;
    // A locked field (e.g. Organization Name filled from the picked contact) can't be searched or cleared: no buttons.
    const locked = useFieldsLocked();
    const inputDisabled = disabled || locked;
    const sanitizerRef = useUndoSafeSanitizer(uppercase ? upperCase : undefined);
    // Typed names are allowed: Tab keeps the typed text unless the user arrowed to a suggestion.
    const tabSelect = useTabSelect({
        freeText: true,
        // Only user edits propagate; 'reset' (MUI echoing `value` back) would otherwise fight a picked option.
        onInputChange: (event, newInputValue, reason) => {
            if (reason !== 'input' && reason !== 'clear') return;
            let next = uppercase ? newInputValue.toUpperCase() : newInputValue;
            if (formatValue) {
                next = formatValue(next);
                if (event?.target instanceof HTMLInputElement) rewriteValueKeepingCaret(event.target, next);
            }
            onChange(next);
        },
    });

    const handleClear = () => {
        onChange('');
        onClear?.();
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ...(fieldSize ? fieldSizeSx(fieldSize) : {}) }}>
            {/* Always an Autocomplete (even with no options yet) so the input isn't remounted, and loses focus, when suggestions load mid-typing. */}
            <Autocomplete
                {...tabSelect}
                freeSolo
                // The separate [X] button already clears the field; hide the Autocomplete's built-in clear icon.
                disableClearable
                disabled={inputDisabled}
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
                onChange={(_, newValue) => onChange(newValue || '')}
                renderOption={
                    optionAdornment
                        ? (props, option) => {
                              const { key, ...optionProps } = props;
                              const adornment = optionAdornment(option);
                              return (
                                  <li key={key} {...optionProps}>
                                      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                                          <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                                              {option}
                                          </Box>
                                          {adornment}
                                      </Box>
                                  </li>
                              );
                          }
                        : undefined
                }
                sx={{ flex: 1, ...fieldSx }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        size="small"
                        placeholder={placeholder}
                        required={required}
                        inputRef={sanitizerRef}
                        slotProps={
                            maxLength
                                ? { ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, maxLength } }
                                : params.slotProps
                        }
                    />
                )}
            />


            {/* Select / Search Action Button */}
            {!locked && (
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
                                <CircularProgress size={14} sx={{ color: 'var(--mui-palette-text-muted)' }} />
                            ) : (
                                <ArrowForwardIosIcon sx={{ fontSize: 13 }} />
                            )}
                        </IconButton>
                    </span>
                </Tooltip>
            )}

            {/* Clear Action Button */}
            {!locked && (
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
            )}
        </Box>
    );
}
