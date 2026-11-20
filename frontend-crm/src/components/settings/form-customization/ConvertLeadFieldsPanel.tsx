'use client';

import React, { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { CONVERT_FIELD_NAMES, type ConvertModule } from '@/validations/convertLead.schema';
import type { FormConfigsPayload, FormFieldDefinitionDto, UpdateFieldPayload } from '@/types/formConfig.types';
import { moduleFields } from '@/utils/formConfig';
import { convertShownFields } from '@/utils/convertLeadFields';
import { DragHandle, EmptyState, errorMessage, panelHeaderSx, surfaceSx } from './builderUi';
import { CONVERT_GRID_COLUMNS, FieldRow } from './FormFieldsBuilderPanel';
import { fieldPlaces } from './fieldPlaces';
import { useConfigDraftActions } from './useConfigDraft';
import { useDragReorder } from './useDragReorder';

/** The three records a lead conversion creates, in the order of the Convert Lead form. */
export const CONVERT_RECORDS: readonly { module: ConvertModule; label: string }[] = [
    { module: 'contacts', label: 'Contact' },
    { module: 'organizations', label: 'Organization' },
    { module: 'opportunities', label: 'Opportunity' },
];

/**
 * `fieldKey`s of `module` that the Convert Lead form shows (Form Builder › Convert Lead). Without `configs`, the
 * fields Convert Lead has its own inputs for.
 */
export const convertFieldKeys = (module: ConvertModule, configs?: FormConfigsPayload | null): ReadonlySet<string> =>
    configs ? new Set(convertShownFields(configs, module).map((f) => f.fieldKey)) : new Set(Object.keys(CONVERT_FIELD_NAMES[module]));

/** Whether a module is one of the records the Convert Lead form collects. */
export const isConvertModule = (module: string | null): module is ConvertModule => CONVERT_RECORDS.some((r) => r.module === module);

/** Tint that sets Convert Lead apart from the forms that open on their own (used on its tile, panels and preview). */
export const CONVERT_TINT = {
    soft: 'color-mix(in srgb, var(--mui-palette-warning-main) 9%, var(--mui-palette-background-paper))',
    strong: 'color-mix(in srgb, var(--mui-palette-warning-main) 16%, var(--mui-palette-background-paper))',
    border: 'color-mix(in srgb, var(--mui-palette-warning-main) 38%, transparent)',
    text: 'var(--crm-amber-700)',
} as const;

export interface ConvertLeadFieldsPanelProps {
    /** The record whose Convert Lead fields are shown. */
    module: ConvertModule;
    configs: FormConfigsPayload;
    canEdit: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

/**
 * Every field of one of Convert Lead's records (built-in and custom), in the record's form order. The Convert switch
 * picks what Convert Lead shows, independently of the record's own form. Label, required, width and order are the
 * record's own settings, shared with its form.
 */
export function ConvertLeadFieldsPanel({ module, configs, canEdit, notify }: ConvertLeadFieldsPanelProps) {
    const draft = useConfigDraftActions();
    const [busy, setBusy] = useState(false);

    const allFields = useMemo(() => moduleFields(configs, module), [configs, module]);
    const rows = useMemo(() => allFields.filter((f) => f.isActive), [allFields]);
    const shownCount = useMemo(() => convertShownFields(configs, module).length, [configs, module]);
    const recordLabel = CONVERT_RECORDS.find((r) => r.module === module)?.label ?? module;

    const run = async (action: () => unknown) => {
        setBusy(true);
        try {
            await action();
        } catch (err) {
            notify(errorMessage(err), 'error');
        } finally {
            setBusy(false);
        }
    };
    const patch = (field: FormFieldDefinitionDto, body: UpdateFieldPayload) => run(() => draft.updateField(field.id, body));

    // The listed rows keep the module-order slots they occupy, filled in the dropped order: fields not listed stay put.
    const { orderedItems, getRowDragProps, getRowDragSx } = useDragReorder({
        items: rows,
        canDrag: canEdit && !busy,
        onReorder: (orderedIds) => {
            const shown = new Set(orderedIds);
            let next = 0;
            const ids = allFields.map((f) => (shown.has(f.id) ? orderedIds[next++] : f.id));
            try {
                draft.reorderFields(module, ids);
            } catch (err) {
                notify(errorMessage(err), 'error');
            }
        },
    });

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, backgroundColor: CONVERT_TINT.soft }}>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>
                    <strong>
                        {shownCount} of {rows.length} {recordLabel} field{rows.length === 1 ? '' : 's'}
                    </strong>{' '}
                    are shown when a lead is converted. Turn a field&apos;s <strong>Convert</strong> switch on or off to choose; this doesn&apos;t change the{' '}
                    {recordLabel} form. Required, width and order are the {recordLabel} form&apos;s own settings, shared with it.
                </Typography>
            </Box>

            <Box sx={{ overflowX: 'auto' }}>
                <Box sx={{ minWidth: 820 }}>
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: CONVERT_GRID_COLUMNS,
                            gap: 1.5,
                            alignItems: 'center',
                            px: 2,
                            py: 1,
                            borderBottom: '1px solid var(--mui-palette-border-main)',
                            '& > *': { fontSize: '0.68rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' },
                        }}
                    >
                        <span />
                        <span>Field</span>
                        <span>Type</span>
                        <span>Width</span>
                        <span>Required</span>
                        <span>Convert</span>
                    </Box>

                    {rows.length === 0 && (
                        <EmptyState title="No fields to show" description={`The ${recordLabel} form has no fields.`} />
                    )}

                    <Box sx={{ position: 'relative' }}>
                        {orderedItems.map((field) => (
                            <FieldRow
                                key={field.id}
                                field={field}
                                canEdit={canEdit}
                                busy={busy}
                                onPatch={(body) => patch(field, body)}
                                convert
                                places={fieldPlaces(configs, field, { includeConvert: false })}
                                dragProps={getRowDragProps(field, field.isActive)}
                                dragSx={getRowDragSx(field)}
                            />
                        ))}
                    </Box>
                </Box>
            </Box>

            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragHandle disabled title="Drag a field by its grip to reorder it" />
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                    Drag a field by its grip to change the order Convert Lead shows it in. A required field that is shown must be filled in on a new{' '}
                    {recordLabel.toLowerCase()}; an existing one that is linked is not checked. A required field left off Convert Lead is not asked for. Fields are
                    added and deleted, and tabs and sections managed, on the {recordLabel} form itself.
                </Typography>
            </Box>
        </Box>
    );
}
