'use client';

import React, { useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { CONVERT_FIELD_NAMES, type ConvertModule } from '@/validations/convertLead.schema';
import type { ConvertSectionDef, FormConfigsPayload, FormFieldDefinitionDto, UpdateFieldPayload } from '@/types/formConfig.types';
import { moduleFields } from '@/utils/formConfig';
import {
    CONVERT_SECTIONS_SETTING,
    convertBuilderSections,
    convertOrderedFields,
    convertSectionDefs,
    convertShownFields,
    hasOwnConvertOrder,
    isShownOnConvert,
    newConvertSectionKey,
    type ConvertBuilderSection,
} from '@/utils/convertLeadFields';
import {
    ConfirmDeleteDialog,
    DragHandle,
    EmptyState,
    errorMessage,
    inputSx,
    panelHeaderSx,
    primaryButtonSx,
    secondaryButtonSx,
    surfaceSx,
} from './builderUi';
import { CONVERT_GRID_COLUMNS, SectionBlock } from './FormFieldsBuilderPanel';
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

const resetButtonSx = {
    flexShrink: 0,
    textTransform: 'none',
    fontSize: '0.76rem',
    fontWeight: 600,
    borderRadius: '8px',
    px: 1.25,
    whiteSpace: 'nowrap',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

/** Dashed "add" button, like the builder's New Tab. */
const newSectionButtonSx = {
    flexShrink: 0,
    textTransform: 'none',
    fontSize: '0.78rem',
    fontWeight: 600,
    borderRadius: '8px',
    px: 1.25,
    py: 0.55,
    whiteSpace: 'nowrap',
    color: 'var(--crm-text-blue-600)',
    border: '1px dashed var(--crm-blue-300)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', borderColor: 'var(--mui-palette-primary-main)', color: 'var(--crm-text-blue-700)' },
} as const;

export interface ConvertLeadFieldsPanelProps {
    /** The record whose Convert Lead fields are shown. */
    module: ConvertModule;
    configs: FormConfigsPayload;
    canEdit: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

/**
 * Every field of one of Convert Lead's records (built-in and custom), in Convert Lead's sections and order. The
 * Convert switch, required, width, order and sections set here are Convert Lead's own (the record's form keeps its
 * settings); until set they follow the record's form (see convertOrderedFields). Sections can be renamed, added and
 * deleted here (deleting one moves its fields to the section next to it: fields always stay on Convert Lead).
 * Labels and dropdowns are the record's form's.
 */
export function ConvertLeadFieldsPanel({ module, configs, canEdit, notify }: ConvertLeadFieldsPanelProps) {
    const draft = useConfigDraftActions();
    const [busy, setBusy] = useState(false);
    const [newSectionOpen, setNewSectionOpen] = useState(false);
    const [sectionDeleteTarget, setSectionDeleteTarget] = useState<ConvertBuilderSection | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Sections as Convert Lead lays them out: its own sections, order and settings (empty sections made here last).
    const sections = useMemo(() => convertBuilderSections(configs, module), [configs, module]);
    const rows = useMemo(() => sections.flatMap((s) => s.fields), [sections]);
    const sectionKeys = useMemo(() => sections.map((s) => s.sectionKey), [sections]);
    const shownCount = useMemo(() => convertShownFields(configs, module).length, [configs, module]);
    const ownOrder = useMemo(() => hasOwnConvertOrder(configs, module), [configs, module]);
    const defs = useMemo(() => convertSectionDefs(configs, module), [configs, module]);
    /** Each field's section on the record's form (Convert Lead's rows carry their Convert Lead section). */
    const formSectionOf = useMemo(() => new Map(moduleFields(configs, module).map((f) => [f.id, f.sectionKey])), [configs, module]);
    const ownSections = defs.length > 0 || moduleFields(configs, module).some((f) => f.convertSectionKey != null);
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

    /** Stages a change right away (no busy state), reporting a refusal. */
    const stage = (action: () => void) => {
        try {
            action();
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };
    /** Puts a field in a Convert Lead section: its form's section is stored as "none" (it then follows the form). */
    const moveToSection = (fieldId: string, sectionKey: string) =>
        draft.updateField(fieldId, { convertSectionKey: formSectionOf.get(fieldId) === sectionKey ? null : sectionKey });
    const saveDefs = (next: ConvertSectionDef[], summary: string) => draft.setModuleSetting(module, CONVERT_SECTIONS_SETTING, next, `Convert Lead ${summary}`);

    // Convert Lead's own order and sections: the record's form keeps its own. Sections come in the order of their
    // first field, so dragging fields also orders sections.
    const reorder = (orderedIds: string[]) => stage(() => draft.reorderConvertFields(module, orderedIds));
    const { getRowDragProps, getGroupProps, getRowDragSx } = useDragReorder({
        items: rows,
        canDrag: canEdit && !busy,
        groups: sectionKeys,
        groupOf: (f) => f.sectionKey,
        onReorder: (orderedIds, sectionById) =>
            stage(() => {
                for (const field of rows) {
                    const target = sectionById[field.id];
                    if (target && target !== field.sectionKey) moveToSection(field.id, target);
                }
                draft.reorderConvertFields(module, orderedIds);
            }),
    });
    const sectionDragItems = useMemo(() => sections.map((s) => ({ ...s, id: s.sectionKey })), [sections]);
    const sectionDrag = useDragReorder({
        items: sectionDragItems,
        canDrag: canEdit && !busy && sections.length > 1,
        onReorder: (orderedKeys) => reorder(orderedKeys.flatMap((key) => sections.find((s) => s.sectionKey === key)?.fields.map((f) => f.id) ?? [])),
    });

    const renameSection = (section: ConvertBuilderSection, label: string) =>
        stage(() => {
            const def = defs.find((d) => d.key === section.sectionKey);
            const formLabel = moduleFields(configs, module).find((f) => f.sectionKey === section.sectionKey)?.sectionLabel;
            // A form section named as on the form again simply follows the form.
            const next =
                !def?.custom && label === formLabel
                    ? defs.filter((d) => d.key !== section.sectionKey)
                    : def
                      ? defs.map((d) => (d.key === section.sectionKey ? { ...d, label } : d))
                      : [...defs, { key: section.sectionKey, label }];
            saveDefs(next, `› ${recordLabel}: section '${section.sectionLabel}' renamed to '${label}'`);
        });

    const addSection = (label: string) => {
        const key = newConvertSectionKey(configs, module, label);
        saveDefs([...defs, { key, label, custom: true }], `› ${recordLabel}: section '${label}' added`);
        notify(`Section '${label}' added — drag fields into it, then click Save Changes`, 'info');
    };

    /** Deletes a section from Convert Lead: its fields (archived ones too) move to the section above it (or below). */
    const deleteSection = (section: ConvertBuilderSection) =>
        stage(() => {
            const index = sections.findIndex((s) => s.sectionKey === section.sectionKey);
            const target = sections[index - 1] ?? sections[index + 1];
            if (!target) throw new Error('Convert Lead needs at least one section.');
            for (const field of convertOrderedFields(configs, module)) {
                if (field.sectionKey === section.sectionKey) moveToSection(field.id, target.sectionKey);
            }
            const def = defs.find((d) => d.key === section.sectionKey);
            const next = def?.custom
                ? defs.filter((d) => d.key !== section.sectionKey)
                : def
                  ? defs.map((d) => (d.key === section.sectionKey ? { ...d, deleted: true } : d))
                  : [...defs, { key: section.sectionKey, label: section.sectionLabel, deleted: true }];
            saveDefs(next, `› ${recordLabel}: section '${section.sectionLabel}' deleted`);
            notify(`Section '${section.sectionLabel}' deleted — its fields moved to '${target.sectionLabel}'. Click Save Changes to apply it`, 'info');
        });

    /** Convert Lead's sections follow the record's form again (renames, added / deleted sections and moves undone). */
    const followFormSections = () =>
        stage(() => {
            for (const field of moduleFields(configs, module)) if (field.convertSectionKey != null) draft.updateField(field.id, { convertSectionKey: null });
            saveDefs([], `› ${recordLabel}: sections follow the form again`);
        });

    const sectionNote = (section: ConvertBuilderSection): string | undefined => {
        if (section.fields.length === 0) return 'empty: drag fields here (not shown on Convert Lead until one is turned on)';
        if (!section.fields.some((f) => isShownOnConvert(module, f))) return 'not shown on Convert Lead: no field turned on';
        return undefined;
    };
    const targetOf = (section: ConvertBuilderSection) => {
        const index = sections.findIndex((s) => s.sectionKey === section.sectionKey);
        return sections[index - 1] ?? sections[index + 1];
    };

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, backgroundColor: CONVERT_TINT.soft, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', flex: 1, minWidth: 280 }}>
                    <strong>
                        {shownCount} of {rows.length} {recordLabel} field{rows.length === 1 ? '' : 's'}
                    </strong>{' '}
                    are shown when a lead is converted. The <strong>Convert</strong> switch, required, width, order and sections set here apply to Convert
                    Lead only: the {recordLabel} form stays as it is. Until you change them here they follow the {recordLabel} form, and fields and
                    sections added to that form show here too.
                </Typography>
                {canEdit && (
                    <Button size="small" startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => setNewSectionOpen(true)} disabled={busy} sx={newSectionButtonSx}>
                        New Section
                    </Button>
                )}
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

                    {sectionDrag.orderedItems.map((section, index) => {
                        const { onPointerDown: onSectionPointerDown, ...sectionBlockProps } = sectionDrag.getRowDragProps(section);
                        return (
                            <SectionBlock
                                // Remounts with the new label after a rename.
                                key={`${section.sectionKey}:${section.sectionLabel}`}
                                module={module}
                                section={section}
                                first={index === 0}
                                canEdit={canEdit}
                                busy={busy}
                                convert
                                note={sectionNote(section)}
                                onRename={async (label) => renameSection(section, label)}
                                onPatch={patch}
                                onDeleteSection={() => {
                                    setSectionDeleteTarget(section);
                                    setDeleteOpen(true);
                                }}
                                deleteDisabledReason={sections.length <= 1 ? 'Convert Lead needs at least one section' : null}
                                headerProps={getGroupProps(section.sectionKey)}
                                rowDragProps={getRowDragProps}
                                rowDragSx={getRowDragSx}
                                sectionBlockProps={sectionBlockProps}
                                onSectionPointerDown={onSectionPointerDown}
                                canDragSection={sections.length > 1}
                                placesOf={(field) => fieldPlaces(configs, field, { includeConvert: false })}
                            />
                        );
                    })}
                </Box>
            </Box>

            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragHandle disabled title="Drag a field by its grip to reorder it" />
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', flex: 1 }}>
                    Drag a field by its grip to reorder it or move it to another section, or drag a section by its header to reorder sections (the{' '}
                    {recordLabel} form keeps its own). A section with no field turned on isn&apos;t shown on Convert Lead. Deleting a section moves its
                    fields to the section next to it. A required field that is shown must be filled in on a new {recordLabel.toLowerCase()}; an existing
                    one that is linked is not checked. Labels and dropdowns come from the {recordLabel} form, where fields are added and deleted.
                </Typography>
                {ownSections && (
                    <Tooltip title={`Use the ${recordLabel} form's sections and section names again`} arrow>
                        <span>
                            <Button
                                size="small"
                                startIcon={<RestartAltRoundedIcon sx={{ fontSize: 16 }} />}
                                disabled={!canEdit || busy}
                                onClick={followFormSections}
                                sx={resetButtonSx}
                            >
                                Use form sections
                            </Button>
                        </span>
                    </Tooltip>
                )}
                {ownOrder && (
                    <Tooltip title={`Show the fields in the ${recordLabel} form's order again`} arrow>
                        <span>
                            <Button
                                size="small"
                                startIcon={<RestartAltRoundedIcon sx={{ fontSize: 16 }} />}
                                disabled={!canEdit || busy}
                                onClick={() => reorder([])}
                                sx={resetButtonSx}
                            >
                                Use form order
                            </Button>
                        </span>
                    </Tooltip>
                )}
            </Box>

            {newSectionOpen && (
                <NewSectionDialog
                    recordLabel={recordLabel}
                    taken={sections.map((s) => s.sectionLabel)}
                    onClose={() => setNewSectionOpen(false)}
                    onCreate={(label) => {
                        addSection(label);
                        setNewSectionOpen(false);
                    }}
                />
            )}

            <ConfirmDeleteDialog
                open={deleteOpen}
                title={`Delete the '${sectionDeleteTarget?.sectionLabel ?? ''}' section from Convert Lead?`}
                confirmLabel="Delete Section"
                // The section stays set while the dialog fades out, so its text doesn't blank mid-close.
                onClose={() => setDeleteOpen(false)}
                onConfirm={() => {
                    setDeleteOpen(false);
                    if (sectionDeleteTarget) deleteSection(sectionDeleteTarget);
                }}
            >
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)' }}>
                    {sectionDeleteTarget && sectionDeleteTarget.fields.length > 0
                        ? sectionDeleteTarget.fields.length === 1
                            ? `Its field stays on Convert Lead and moves to the '${targetOf(sectionDeleteTarget)?.sectionLabel ?? ''}' section.`
                            : `Its ${sectionDeleteTarget.fields.length} fields stay on Convert Lead and move to the '${targetOf(sectionDeleteTarget)?.sectionLabel ?? ''}' section.`
                        : 'It has no fields.'}{' '}
                    The {recordLabel} form keeps the section.
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>The deletion is applied when you click Save Changes.</Typography>
            </ConfirmDeleteDialog>
        </Box>
    );
}

/** Compact dialog naming a new Convert Lead section. */
function NewSectionDialog({
    recordLabel,
    taken,
    onClose,
    onCreate,
}: {
    recordLabel: string;
    /** Names of the sections already there (a new one can't repeat them). */
    taken: string[];
    onClose: () => void;
    onCreate: (label: string) => void;
}) {
    const [name, setName] = useState('');
    const trimmed = name.trim();
    const duplicate = taken.some((t) => t.trim().toLowerCase() === trimmed.toLowerCase());
    const submit = () => {
        if (trimmed && !duplicate) onCreate(trimmed);
    };
    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', borderBottom: '1px solid var(--mui-palette-border-main)' }}>
                New Section — Convert Lead › {recordLabel}
            </DialogTitle>
            <DialogContent sx={{ pt: '20px !important' }}>
                <TextField
                    label="Section name"
                    size="small"
                    fullWidth
                    autoFocus
                    value={name}
                    placeholder="e.g. Deal Details"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    error={duplicate}
                    helperText={duplicate ? 'A section with this name is already there.' : `Only on Convert Lead: the ${recordLabel} form doesn't get it.`}
                    sx={inputSx}
                    slotProps={{ htmlInput: { maxLength: 120 } }}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--mui-palette-border-main)' }}>
                <Button onClick={onClose} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button onClick={submit} variant="contained" sx={primaryButtonSx} disabled={!trimmed || duplicate}>
                    Add Section
                </Button>
            </DialogActions>
        </Dialog>
    );
}
