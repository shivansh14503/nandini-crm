'use client';

import React from 'react';
import { Box, FormHelperText, IconButton, InputAdornment, TextField, Tooltip, type SxProps, type TextFieldProps, type Theme } from '@mui/material';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import { useConfiguredPlaceholder, useCurrentFieldName } from '@/context/FormConfigContext';
import { fieldSx } from './FormField';
import { CharacterCounter } from './CharacterCounter';
import { LongTextEditorDialog } from './LongTextEditorDialog';

/** Every long text field starts this tall… */
export const LONG_TEXT_MIN_ROWS = 3;
/** …grows with its text up to this many lines, then scrolls inside. */
export const LONG_TEXT_MAX_ROWS = 10;

export interface LongTextInputProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    /** Field label: names the expand editor and the input for screen readers. */
    label: string;
    name?: string;
    /**
     * Character limit, shown as "120 / 250" under the field. Long text (descriptions, remarks, notes, terms, reasons)
     * has none: leave it unset. Only short multi-line values (street address, a status message) pass one.
     */
    maxLength?: number;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    autoFocus?: boolean;
    /** Error message (red, under the field, left of the counter). */
    error?: React.ReactNode;
    /** Helper text shown under the field when there is no error. */
    helperText?: React.ReactNode;
    /** Shows the expand button that opens the larger editor (default true). */
    expandable?: boolean;
    /** Override for dialogs and table rows that need a shorter resting height. */
    minRows?: number;
    maxRows?: number;
    /** Floating MUI label (for fields drawn without the {@link FormField} header, e.g. inside dialogs). */
    inputLabel?: string;
    inputRef?: React.Ref<HTMLTextAreaElement | HTMLInputElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    /** Extra props for the native textarea (aria attributes…). */
    htmlInputProps?: Record<string, unknown>;
    size?: TextFieldProps['size'];
    /** Draws the field with the CRM form styling (default true); off for pages with their own input look. */
    crmFieldStyle?: boolean;
    sx?: SxProps<Theme>;
}

/**
 * The one long text control of the CRM (descriptions, remarks, notes, terms, reasons): starts at
 * {@link LONG_TEXT_MIN_ROWS} lines, grows as the user types up to {@link LONG_TEXT_MAX_ROWS}, then scrolls inside;
 * no resize handle. No character limit; an expand button opens a larger editor for very long text. Use it through
 * `RhfTextField multiline` in React Hook Form forms.
 */
export function LongTextInput({
    value,
    onChange,
    onBlur,
    label,
    name,
    maxLength,
    placeholder,
    disabled,
    required,
    autoFocus,
    error,
    helperText,
    expandable = true,
    minRows = LONG_TEXT_MIN_ROWS,
    maxRows = LONG_TEXT_MAX_ROWS,
    inputLabel,
    inputRef,
    onKeyDown,
    htmlInputProps,
    size = 'small',
    crmFieldStyle = true,
    sx,
}: LongTextInputProps) {
    const [editorOpen, setEditorOpen] = React.useState(false);
    const counterId = React.useId();
    const text = value ?? '';
    const hasError = Boolean(error);
    const message = hasError ? error : helperText;
    const showExpand = expandable && !disabled;

    const describedBy = [htmlInputProps?.['aria-describedby'], maxLength ? counterId : undefined].filter(Boolean).join(' ') || undefined;

    return (
        <Box sx={{ minWidth: 0, width: '100%' }}>
            <TextField
                fullWidth
                multiline
                minRows={minRows}
                maxRows={maxRows}
                size={size}
                name={name}
                label={inputLabel}
                value={text}
                placeholder={placeholder}
                disabled={disabled}
                required={inputLabel ? required : undefined}
                autoFocus={autoFocus}
                error={hasError}
                inputRef={inputRef}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                onChange={(e) => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
                slotProps={{
                    htmlInput: {
                        ...htmlInputProps,
                        ...(maxLength ? { maxLength } : {}),
                        'aria-describedby': describedBy,
                        ...(inputLabel ? {} : { 'aria-label': label }),
                    },
                    input: showExpand
                        ? {
                              endAdornment: (
                                  <InputAdornment position="end" sx={{ alignSelf: 'flex-start', height: 'auto', maxHeight: 'none', mt: '-6px', mr: '-8px' }}>
                                      <Tooltip title="Open larger editor">
                                          <IconButton
                                              onClick={() => setEditorOpen(true)}
                                              aria-label={`Open ${label} in a larger editor`}
                                              size="small"
                                              sx={{
                                                  width: 32,
                                                  height: 32,
                                                  borderRadius: '6px',
                                                  color: 'var(--mui-palette-text-muted)',
                                                  transition: 'all 0.15s ease',
                                                  '&:hover': { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                                              }}
                                          >
                                              <OpenInFullRoundedIcon sx={{ fontSize: 15 }} />
                                          </IconButton>
                                      </Tooltip>
                                  </InputAdornment>
                              ),
                          }
                        : undefined,
                }}
                sx={[crmFieldStyle && fieldSx, { '& textarea': { resize: 'none', lineHeight: 1.5 } }, ...(Array.isArray(sx) ? sx : [sx])]}
            />
            {(message || maxLength) && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mt: '3px', mx: '14px' }}>
                    <FormHelperText error={hasError} sx={{ m: 0, minWidth: 0, flex: 1 }}>
                        {message}
                    </FormHelperText>
                    {maxLength ? <CharacterCounter id={counterId} length={text.length} maxLength={maxLength} /> : null}
                </Box>
            )}
            {showExpand && (
                <LongTextEditorDialog
                    open={editorOpen}
                    label={label}
                    value={text}
                    maxLength={maxLength}
                    placeholder={placeholder}
                    onApply={(next) => {
                        onChange(next);
                        onBlur?.();
                    }}
                    onClose={() => setEditorOpen(false)}
                />
            )}
        </Box>
    );
}

/**
 * {@link LongTextInput} for a built-in field drawn inside a {@link FormField} without React Hook Form: shows the
 * admin's placeholder (Form Builder) for that field, as `ConfiguredTextField` does for single-line inputs.
 */
export function ConfiguredLongTextInput(props: LongTextInputProps) {
    const fieldName = useCurrentFieldName();
    const placeholder = useConfiguredPlaceholder(fieldName ?? props.name, props.placeholder);
    return <LongTextInput {...props} placeholder={placeholder} />;
}
