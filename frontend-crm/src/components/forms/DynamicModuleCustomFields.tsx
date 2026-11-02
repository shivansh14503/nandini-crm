'use client';

import React, { useMemo } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';
import { useWatch } from 'react-hook-form';
import { useFormMode } from '@/context/FormModeContext';
import { sectionIdOf, useFormConfigContext } from '@/context/FormConfigContext';
import { useModuleFormConfig } from '@/hooks/queries/useFormConfigs';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { CUSTOM_FIELDS_KEY, groupSections, isEmptyValue } from '@/utils/formConfig';
import { DynamicFormField } from './DynamicFormField';
import { FormGrid } from './FormGrid';
import { SectionLabel } from './SectionLabel';

export { useConfiguredFieldProps } from '@/hooks/queries/useFormConfigs';

export interface DynamicModuleCustomFieldsProps {
    module: CrmModuleKey;
    /** Form tab whose custom fields to render. */
    tabKey: string;
    /** Wrapper spacing; defaults to the padding of the module forms' tab panels. */
    sx?: SxProps<Theme>;
}

/**
 * Renders the admin-added custom fields (and admin-created sections) of one form tab, grouped by section in
 * admin order. Active custom fields of a built-in section are shown by the form inside that section's own grid,
 * between its built-in fields (useConfiguredChildren); this lists the rest under their section labels. Archived or hidden fields are omitted, except archived fields that already hold a value on
 * this record: those stay visible (never required) so historical data isn't lost.
 * Must be rendered inside the form's `FormProvider`.
 */
export function DynamicModuleCustomFields({ module, tabKey, sx }: DynamicModuleCustomFieldsProps) {
    const { customFields } = useModuleFormConfig(module);
    const { mode } = useFormMode();
    const sectionClaims = useFormConfigContext()?.sectionClaims;
    const values = useWatch({ name: CUSTOM_FIELDS_KEY }) as Record<string, unknown> | undefined;

    const sections = useMemo(() => {
        const visible = customFields.filter((field) => {
            if (field.tabKey !== tabKey) return false;
            // Already shown inside its section's grid.
            if (field.isActive && field.isVisibleInForm && sectionClaims?.[sectionIdOf(field)]?.length) return false;
            if (field.isActive) return field.isVisibleInForm;
            return mode !== 'create' && !isEmptyValue(values?.[field.fieldKey]);
        });
        return groupSections(visible);
    }, [customFields, tabKey, mode, values, sectionClaims]);

    if (sections.length === 0) return null;

    return (
        <Box sx={[{ px: { xs: 2.5, md: 3.5 }, pb: 3.5, display: 'flex', flexDirection: 'column', gap: 3.5 }, ...(Array.isArray(sx) ? sx : [sx])]}>
            {sections.map((section) => (
                <Box key={`${section.tabKey}:${section.sectionKey}`}>
                    <SectionLabel label={section.sectionLabel} sx={{ mb: 2 }} />
                    <FormGrid columns={3}>
                        {section.fields.map((field) => (
                            <DynamicFormField key={field.id} field={field} required={field.isActive ? field.isRequired : false} />
                        ))}
                    </FormGrid>
                </Box>
            ))}
        </Box>
    );
}
