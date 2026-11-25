'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DefaultPropsProvider from '@mui/material/DefaultPropsProvider';

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

/** True inside DisabledFields: controls that draw their own buttons (a lookup's search and clear) hide them. */
const FieldsLockedContext = createContext(false);

/** Whether this field is locked (inside DisabledFields / LockedInputs). */
export const useFieldsLocked = (): boolean => useContext(FieldsLockedContext);

/** Renders its fields as disabled inputs that keep their values. */
export function DisabledFields({ children }: { children: React.ReactNode }) {
    const theme = useTheme();
    const value = useMemo(() => {
        const components: Record<string, { defaultProps?: Record<string, unknown> }> = { ...(theme.components as Record<string, { defaultProps?: Record<string, unknown> }>) };
        for (const name of LOCKED_COMPONENTS) {
            components[name] = { ...components[name], defaultProps: { ...components[name]?.defaultProps, disabled: true } };
        }
        return components;
    }, [theme.components]);
    return (
        <FieldsLockedContext.Provider value>
            <DefaultPropsProvider value={value as React.ComponentProps<typeof DefaultPropsProvider>['value']}>{children}</DefaultPropsProvider>
        </FieldsLockedContext.Provider>
    );
}

/**
 * The locked look (Convert Lead's values taken from the lead): a soft fill and a plain outline, so a locked input is
 * easy to tell from an editable one in both themes.
 */
export const lockedInputSx = {
    '& .MuiOutlinedInput-root:is(.Mui-disabled, :has(input[readonly]))': { backgroundColor: 'var(--mui-palette-background-subtle)' },
    '& .MuiOutlinedInput-root:is(.Mui-disabled, :has(input[readonly])) .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-border-main)' },
} as const;

/**
 * Shows its fields locked (disabled, values kept, soft fill) while `locked`, e.g. a contact's number and email once
 * that contact is picked; editable again as soon as `locked` turns off. Takes no room of its own, so it can wrap a
 * field inside a form grid.
 */
export function LockedInputs({ locked, children }: { locked: boolean; children: React.ReactNode }) {
    if (!locked) return <>{children}</>;
    return (
        <Box sx={{ display: 'contents', ...lockedInputSx }}>
            <DisabledFields>{children}</DisabledFields>
        </Box>
    );
}
