'use client';

import React from 'react';
import { InputAdornment } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { ConfiguredTextField as TextField } from './ConfiguredTextField';
import { FormField, fieldSx } from './FormField';

export interface LockedFieldProps {
    name: string;
    label: string;
    value: string;
    hint?: React.ReactNode;
    placeholder?: string;
}

/**
 * A form value the user can't change because it follows another field (e.g. Mailing Name follows
 * Organization Name). It keeps the input-box look so the form grid stays aligned, but it can't be
 * clicked, focused, tabbed to or text-selected, so it never looks editable.
 */
export function LockedField({ name, label, value, hint, placeholder }: LockedFieldProps) {
    return (
        <FormField name={name} label={label} hint={hint}>
            <TextField
                fullWidth
                size="small"
                value={value}
                placeholder={placeholder}
                // Layered on fieldSx (not spread over it) so the input keeps the standard size and font.
                sx={[
                    fieldSx,
                    {
                        cursor: 'default',
                        '& .MuiOutlinedInput-root': {
                            pointerEvents: 'none',
                            userSelect: 'none',
                            backgroundColor: 'var(--mui-palette-background-subtle)',
                            color: 'var(--crm-slate-600)',
                        },
                    },
                ]}
                slotProps={{
                    htmlInput: { readOnly: true, tabIndex: -1, 'aria-readonly': true },
                    input: {
                        endAdornment: (
                            <InputAdornment position="end">
                                <LockOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)' }} />
                            </InputAdornment>
                        ),
                    },
                }}
            />
        </FormField>
    );
}
