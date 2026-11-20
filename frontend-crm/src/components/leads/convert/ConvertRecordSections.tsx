'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import { FormGrid } from '@/components/forms';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { groupSections, moduleFields } from '@/utils/formConfig';
import type { FormConfigsPayload } from '@/types/formConfig.types';
import { CONVERT_FIELD_NAMES, type ConvertModule } from '@/validations/convertLead.schema';

export interface ConvertSection {
    sectionKey: string;
    sectionLabel: string;
    /** Module `fieldKey`s in the section, in the configured order. */
    fieldKeys: string[];
}

/**
 * The sections a record's Convert Lead fields fall into, as the record's own form shows them: the module's sections
 * and field order from the Form Builder, keeping only the fields Convert Lead collects that are shown on the form.
 * The Convert Lead form and the Form Builder's Convert Lead preview both lay out from this, so they match.
 */
export function convertSections(configs: FormConfigsPayload | null, module: ConvertModule): ConvertSection[] {
    const keys = new Set(Object.keys(CONVERT_FIELD_NAMES[module]));
    const fields = configs
        ? moduleFields(configs, module).filter((f) => f.isSystem && keys.has(f.fieldKey) && f.isActive && f.isVisibleInForm)
        : [];
    return groupSections(fields).map((s) => ({ sectionKey: s.sectionKey, sectionLabel: s.sectionLabel, fieldKeys: s.fields.map((f) => f.fieldKey) }));
}

const sectionHeadingSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--mui-palette-text-secondary)',
    mb: 1.5,
} as const;

export interface ConvertRecordSectionsProps {
    module: ConvertModule;
    /** The input of each field the section collects, by the module's `fieldKey`. */
    fields: Readonly<Record<string, React.ReactNode>>;
    /** Conversion-only inputs (no field on the module's form): added after the record's own fields. */
    extra?: React.ReactNode;
}

/**
 * Lays out one record of the Convert Lead form the way the record's own form does: one 3-column grid per section of
 * that form (named as configured), fields in the configured order and at the width they have there. Must be rendered
 * inside the record's borrowed FormConfigProvider.
 */
export function ConvertRecordSections({ module, fields, extra }: ConvertRecordSectionsProps) {
    const configs = useFormConfigs();
    const sections = convertSections(configs, module);
    // Before the configuration loads (or if it lists none of them), every field shows in one grid.
    const placed = new Set(sections.flatMap((s) => s.fieldKeys));
    const unplaced = Object.keys(fields).filter((key) => !placed.has(key) && !configs);
    const groups: ConvertSection[] = unplaced.length > 0 ? [{ sectionKey: 'all', sectionLabel: '', fieldKeys: unplaced }] : sections;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {groups.map((section, index) => (
                <Box key={section.sectionKey}>
                    {groups.length > 1 && section.sectionLabel && <Typography sx={sectionHeadingSx}>{section.sectionLabel}</Typography>}
                    <FormGrid columns={3}>
                        {section.fieldKeys.map((key) => (
                            <React.Fragment key={key}>{fields[key]}</React.Fragment>
                        ))}
                        {index === groups.length - 1 && extra}
                    </FormGrid>
                </Box>
            ))}
            {groups.length === 0 && extra && <FormGrid columns={3}>{extra}</FormGrid>}
        </Box>
    );
}
