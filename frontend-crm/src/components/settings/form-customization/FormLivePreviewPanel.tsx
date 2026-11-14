'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { FormProvider, useForm } from 'react-hook-form';
import { FormModeProvider } from '@/context/FormModeContext';
import { DynamicFormField } from '@/components/forms/DynamicFormField';
import { FormGrid } from '@/components/forms/FormGrid';
import { SectionLabel } from '@/components/forms/SectionLabel';
import { CRM_MODULE_LABELS, type CrmModuleKey, type FormConfigsPayload } from '@/types/formConfig.types';
import { groupSections, moduleFields } from '@/utils/formConfig';
import { EmptyState, PillTabs, panelHeaderSx, surfaceSx } from './builderUi';

export interface FormLivePreviewPanelProps {
    module: CrmModuleKey;
    configs: FormConfigsPayload;
    /** Unsaved changes included in what's shown. */
    unsavedCount?: number;
    /** Tabs with unsaved changes (orange dot on their pill). */
    unsavedTabs?: Set<string>;
}

/**
 * Interactive preview of a module form with the current configuration: labels, hints, placeholders, widths,
 * required flags, visibility, dropdown options, section names and custom fields, unsaved changes included.
 * Values typed here are never saved.
 */
export function FormLivePreviewPanel({ module, configs, unsavedCount = 0, unsavedTabs }: FormLivePreviewPanelProps) {
    const tabs = useMemo(() => configs.moduleTabs[module] ?? [], [configs, module]);
    const [selectedTab, setTabKey] = useState(tabs[0]?.key ?? 'overview');
    const tabKey = tabs.some((t) => t.key === selectedTab) ? selectedTab : (tabs[0]?.key ?? 'overview');
    const methods = useForm({ defaultValues: { customFields: {} } as Record<string, unknown>, mode: 'onTouched' });

    // Reset sample input when switching modules so values don't leak between forms.
    useEffect(() => {
        methods.reset({ customFields: {} });
    }, [module, methods]);

    const sections = useMemo(
        () => groupSections(moduleFields(configs, module).filter((f) => f.isActive && f.isVisibleInForm), tabKey),
        [configs, module, tabKey],
    );

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                <PillTabs
                    items={tabs.map((t) => ({ key: t.key, label: t.label, hasUnsaved: unsavedTabs?.has(t.key) ?? false }))}
                    value={tabKey}
                    onChange={setTabKey}
                />
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <VisibilityOutlinedIcon sx={{ fontSize: 15 }} /> Preview of the {CRM_MODULE_LABELS[module]} form
                    {unsavedCount > 0 ? ` — includes ${unsavedCount} unsaved change${unsavedCount === 1 ? '' : 's'}` : ''}
                </Typography>
            </Box>

            <FormProvider {...methods}>
                <FormModeProvider mode="create">
                    <Box sx={{ p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
                        {sections.length === 0 && (
                            <EmptyState
                                title="No configurable fields on this tab"
                                description={
                                    tabs.find((t) => t.key === tabKey) && !moduleFields(configs, module).some((f) => f.tabKey === tabKey)
                                        ? 'This tab has no fields yet. Add one under Form Fields & Sections; an empty tab is not kept when you save.'
                                        : 'This tab only holds composite blocks such as addresses or line items.'
                                }
                            />
                        )}
                        {sections.map((section) => (
                            <Box key={section.sectionKey}>
                                <SectionLabel label={section.sectionLabel} sx={{ mb: 2 }} />
                                <FormGrid columns={3}>
                                    {section.fields.map((field) => (
                                        <DynamicFormField key={field.id} field={field} />
                                    ))}
                                </FormGrid>
                            </Box>
                        ))}
                    </Box>
                </FormModeProvider>
            </FormProvider>

            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                    Lookups, date-time pickers and country / state pickers are previewed as simple inputs. Fields appear in the configured order, as on
                    the real form. Composite blocks (email lists, line items, toggles) aren&apos;t part of the preview.
                </Typography>
            </Box>
        </Box>
    );
}
