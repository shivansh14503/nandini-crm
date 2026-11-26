'use client';

import React, { useId } from 'react';
import { Box, FormControlLabel, Switch, Typography } from '@mui/material';

/**
 * A bordered settings row: label and hint on the left, a switch on the right, the whole row tappable (48 px min
 * height). The switch takes the theme's brand track (blue / green). Used by My Profile (morning summary email) and
 * Admin › Users (Flags). The hint is linked to the switch with aria-describedby so screen readers read it too.
 *
 * The PDF builder's side panel has its own compact `SwitchRow` (small switch, no border) in
 * `components/pdf/builder/panel/controls.tsx`; that is a different, denser pattern.
 */
export function SwitchRow({
    checked,
    onChange,
    label,
    hint,
    disabled,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    hint?: React.ReactNode;
    disabled?: boolean;
}) {
    const hintId = useId();
    return (
        <FormControlLabel
            disabled={disabled}
            control={
                <Switch
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    slotProps={hint ? { input: { 'aria-describedby': hintId } } : undefined}
                />
            }
            labelPlacement="start"
            label={
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{label}</Typography>
                    {hint && (
                        <Typography id={hintId} component="div" sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.45 }}>
                            {hint}
                        </Typography>
                    )}
                </Box>
            }
            sx={{
                m: 0,
                py: 0.75,
                px: 1.25,
                gap: 1,
                justifyContent: 'space-between',
                borderRadius: '10px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                minHeight: 48,
                '& .MuiFormControlLabel-label': { flex: 1, minWidth: 0 },
            }}
        />
    );
}
