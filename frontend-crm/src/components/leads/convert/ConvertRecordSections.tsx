'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import { DynamicFormField, FormGrid } from '@/components/forms';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { groupSections } from '@/utils/formConfig';
import { convertFieldName, convertShownFields, isConvertInput } from '@/utils/convertLeadFields';
import type { FormConfigsPayload, FormFieldDefinitionDto } from '@/types/formConfig.types';
import type { ConvertModule } from '@/validations/convertLead.schema';

export interface ConvertSection {
    sectionKey: string;
    sectionLabel: string;
    /** The section's fields Convert Lead shows, in the configured order. */
    fields: FormFieldDefinitionDto[];
}

/**
 * The sections a record's Convert Lead fields fall into: Convert Lead's own sections and order (Form Builder ›
 * Convert Lead; by default the record's form's), keeping the fields an admin put on Convert Lead (built-in and
 * custom). A section with none of them is left out. The Convert Lead form and the Form Builder's Convert Lead preview
 * both lay out from this, so they match.
 */
export function convertSections(configs: FormConfigsPayload | null, module: ConvertModule): ConvertSection[] {
    return groupSections(convertShownFields(configs, module)).map((s) => ({ sectionKey: s.sectionKey, sectionLabel: s.sectionLabel, fields: s.fields }));
}

/**
 * Section heading, styled like the record forms' SectionLabel. Not SectionLabel itself: that one re-reads the name from
 * the record's form, while Convert Lead names its sections on its own.
 */
const sectionHeadingSx = {
    fontWeight: 700,
    color: 'var(--mui-palette-text-primary)',
    fontSize: '0.82rem',
    letterSpacing: '0.02em',
    mb: 1.5,
} as const;

export interface ConvertRecordSectionsProps {
    module: ConvertModule;
    /** Convert Lead's own input of each field it has one for, by the module's `fieldKey`. Other fields are drawn from their configuration. */
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
    // Before the configuration loads, Convert Lead's own inputs show in one grid.
    const groups: { sectionKey: string; sectionLabel: string; nodes: [string, React.ReactNode][] }[] = configs
        ? sections.map((s) => ({
              sectionKey: s.sectionKey,
              sectionLabel: s.sectionLabel,
              nodes: s.fields.map((f): [string, React.ReactNode] => [
                  f.fieldKey,
                  isConvertInput(module, f) ? fields[f.fieldKey] : <DynamicFormField field={f} name={convertFieldName(module, f)} />,
              ]),
          }))
        : [{ sectionKey: 'all', sectionLabel: '', nodes: Object.entries(fields) }];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {groups.map((section, index) => (
                <Box key={section.sectionKey}>
                    {/* Every section is named (as Convert Lead names it); a section with no field turned on isn't listed at all. */}
                    {section.sectionLabel && <Typography sx={sectionHeadingSx}>{section.sectionLabel}</Typography>}
                    <FormGrid columns={3}>
                        {section.nodes.map(([key, node]) => (
                            <React.Fragment key={key}>{node}</React.Fragment>
                        ))}
                        {index === groups.length - 1 && extra}
                    </FormGrid>
                </Box>
            ))}
            {groups.length === 0 && extra && <FormGrid columns={3}>{extra}</FormGrid>}
        </Box>
    );
}
