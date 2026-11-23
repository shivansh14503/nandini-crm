'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import DefaultPropsProvider from '@mui/material/DefaultPropsProvider';
import { useFormContext, useFormState } from 'react-hook-form';

/** Convert Lead field names (`extraFields.<module>.<key>` for extra fields) whose value came from the lead. */
const LeadPrefilledContext = createContext<ReadonlySet<string>>(new Set());

export function LeadPrefilledProvider({ fields, children }: { fields: ReadonlySet<string>; children: React.ReactNode }) {
    return <LeadPrefilledContext.Provider value={fields}>{children}</LeadPrefilledContext.Provider>;
}

/** MUI controls a locked field is made of; each starts disabled (an explicit `disabled` prop still wins). */
const LOCKED_COMPONENTS = [
    'MuiFormControl',
    'MuiTextField',
    'MuiInputBase',
    'MuiAutocomplete',
    'MuiSelect',
    'MuiButtonBase',
    'MuiButton',
    'MuiIconButton',
    'MuiCheckbox',
    'MuiRadio',
    'MuiSwitch',
    'MuiChip',
    'MuiToggleButton',
    'MuiFormControlLabel',
] as const;

/** Renders its fields as disabled inputs that keep their values (like the contact section's Organization Name). */
function DisabledFields({ children }: { children: React.ReactNode }) {
    const theme = useTheme();
    const value = useMemo(() => {
        const components: Record<string, { defaultProps?: Record<string, unknown> }> = { ...(theme.components as Record<string, { defaultProps?: Record<string, unknown> }>) };
        for (const name of LOCKED_COMPONENTS) {
            components[name] = { ...components[name], defaultProps: { ...components[name]?.defaultProps, disabled: true } };
        }
        return components;
    }, [theme.components]);
    return <DefaultPropsProvider value={value as React.ComponentProps<typeof DefaultPropsProvider>['value']}>{children}</DefaultPropsProvider>;
}

/**
 * Shows a Convert Lead field as a disabled, prefilled input when the lead supplied its value (the lead is the source of truth for it, as
 * Organization Name is in the contact section). A field the lead left blank stays editable, and so does a locked one
 * whose value fails validation, so a bad value carried from the lead can still be fixed.
 */
export function LeadLocked({ name, children }: { name: string; children: React.ReactNode }) {
    const prefilled = useContext(LeadPrefilledContext);
    const { control, getFieldState } = useFormContext();
    const formState = useFormState({ control, name });
    const locked = prefilled.has(name) && !getFieldState(name, formState).error;
    return locked ? <DisabledFields>{children}</DisabledFields> : <>{children}</>;
}
