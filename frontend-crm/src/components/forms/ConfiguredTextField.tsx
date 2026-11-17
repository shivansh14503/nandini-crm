'use client';

import React from 'react';
import { TextField, type TextFieldProps } from '@mui/material';
import { useConfiguredPlaceholder, useCurrentFieldName } from '@/context/FormConfigContext';

/**
 * MUI `TextField` that shows the admin's placeholder (form builder) for the built-in field it sits in.
 *
 * `FormField` applies the admin's label / hint / required / size, but a plain `TextField` placed inside it kept its
 * coded placeholder, so edits to those fields' placeholders (Trade Name, SAP Code, GSTIN, …) never reached the form.
 * This reads the field from the surrounding `FormField` (or an explicit `name`) and swaps in the configured text.
 * Outside a FormField / FormConfigProvider it behaves exactly like `TextField`.
 *
 * Forms import it as `TextField` so every raw text input inside a `FormField` picks up the setting.
 */
export const ConfiguredTextField = React.forwardRef<HTMLDivElement, TextFieldProps>(function ConfiguredTextField(props, ref) {
    const fieldName = useCurrentFieldName();
    const placeholder = useConfiguredPlaceholder(fieldName ?? props.name, props.placeholder);
    return <TextField {...props} ref={ref} placeholder={placeholder} />;
});
