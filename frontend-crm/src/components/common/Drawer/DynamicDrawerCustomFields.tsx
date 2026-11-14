'use client';

import React, { useMemo } from 'react';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { ReadOnlyField } from '@/components/forms/ReadOnlyField';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { findCategory, formatCustomValue, groupSections, isEmptyValue, moduleFields, optionLabelMap } from '@/utils/formConfig';
import { DrawerFieldGrid, DrawerSectionCard } from './DrawerPrimitives';

export interface DynamicDrawerCustomFieldsProps {
    module: CrmModuleKey;
    /** The record shown in the drawer (`customFields` from the API). */
    record?: { customFields?: Record<string, unknown> | null } | null;
}

/**
 * Admin-defined custom field values for an entity detail drawer, one card per section. Shows every custom field
 * marked "visible in drawer" that has a value, including archived fields and archived option values, so data
 * captured before an admin change stays readable. Renders nothing when there is nothing to show.
 */
export function DynamicDrawerCustomFields({ module, record }: DynamicDrawerCustomFieldsProps) {
    const configs = useFormConfigs();
    const values = record?.customFields ?? undefined;

    const sections = useMemo(() => {
        if (!values) return [];
        const fields = moduleFields(configs, module).filter(
            (f) => !f.isSystem && f.isVisibleInDrawer && !isEmptyValue(values[f.fieldKey]),
        );
        return groupSections(fields);
    }, [configs, module, values]);

    if (!values || sections.length === 0) return null;

    return (
        <>
            {sections.map((section) => (
                <DrawerSectionCard
                    key={`${section.tabKey}:${section.sectionKey}`}
                    title={section.sectionLabel}
                    icon={<TuneOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />}
                >
                    <DrawerFieldGrid>
                        {section.fields.map((field) => {
                            const labels = optionLabelMap(findCategory(configs, field.dropdownCategoryKey));
                            const isLong = field.fieldType === 'textarea' || field.fieldType === 'multiselect';
                            return (
                                <ReadOnlyField
                                    key={field.id}
                                    label={field.label}
                                    value={formatCustomValue(field, values[field.fieldKey], labels)}
                                    copyable={field.fieldType === 'phone' || field.fieldType === 'email' || field.fieldType === 'uppercase'}
                                    sx={isLong ? { gridColumn: '1 / -1' } : undefined}
                                />
                            );
                        })}
                    </DrawerFieldGrid>
                </DrawerSectionCard>
            ))}
        </>
    );
}
