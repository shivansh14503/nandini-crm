'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    MenuItem,
    Select,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ViewQuiltOutlinedIcon from '@mui/icons-material/ViewQuiltOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { SectionLabel } from '@/components/forms/SectionLabel';
import { useConfigDraftActions, useHasUnsavedChanges } from './useConfigDraft';
import {
    CRM_MODULE_LABELS,
    FIELD_TYPE_LABELS,
    tabKeyFromLabel,
    type ConfigFieldSize,
    type ConfiguredSection,
    type CrmModuleKey,
    type FormConfigsPayload,
    type FormFieldDefinitionDto,
    type UpdateFieldPayload,
} from '@/types/formConfig.types';
import { groupSections, moduleFields } from '@/utils/formConfig';
import {
    Badge,
    ConfirmDeleteDialog,
    EmptyState,
    LabeledSwitch,
    PillTabs,
    DragHandle,
    dangerColor,
    errorMessage,
    inputSx,
    panelHeaderSx,
    primaryButtonSx,
    secondaryButtonSx,
    surfaceSx,
} from './builderUi';
import { FieldEditorModal } from './FieldEditorModal';
import { useDragReorder, type GroupDragProps, type RowDragProps } from './useDragReorder';
import { categoryAfterFieldRemoval } from './configDraft';

export interface FormFieldsBuilderPanelProps {
    module: CrmModuleKey;
    configs: FormConfigsPayload;
    canEdit: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
    /** Form tabs of the module with unsaved changes (orange dot on their pill). */
    unsavedTabs?: Set<string>;
}

const SIZES: (ConfigFieldSize | '')[] = ['', 'xs', 'sm', 'md', 'lg', 'full'];
const GRID_COLUMNS = '28px minmax(180px, 1.6fr) 120px 92px 70px 70px 70px 104px';

/** Every field of a module grouped by tab and section, with inline toggles and the field editor. */
export function FormFieldsBuilderPanel({ module, configs, canEdit, notify, unsavedTabs }: FormFieldsBuilderPanelProps) {
    const tabs = useMemo(() => configs.moduleTabs[module] ?? [], [configs, module]);
    const [selectedTab, setTabKey] = useState(tabs[0]?.key ?? 'overview');
    // Falls back to the first tab when the module changes.
    const tabKey = tabs.some((t) => t.key === selectedTab) ? selectedTab : (tabs[0]?.key ?? 'overview');
    const [showArchived, setShowArchived] = useState(false);
    const [editor, setEditor] = useState<{ open: boolean; field?: FormFieldDefinitionDto; sectionKey?: string }>({ open: false });
    const [deleteTarget, setDeleteTarget] = useState<FormFieldDefinitionDto | null>(null);
    const [newTabOpen, setNewTabOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const draft = useConfigDraftActions();

    const allFields = useMemo(() => moduleFields(configs, module), [configs, module]);
    const sections = useMemo(
        () => groupSections(allFields.filter((f) => f.isActive || showArchived), tabKey),
        [allFields, showArchived, tabKey],
    );
    const archivedCount = allFields.filter((f) => !f.isActive).length;
    const activeTab = tabs.find((t) => t.key === tabKey);
    const tabIsEmpty = !allFields.some((f) => f.tabKey === tabKey);

    /** Stages a change in the draft (saved with "Save Changes"). */
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

    // ── Drag and drop across the sections of the tab ──
    /** Every row shown on the tab, section by section (archived rows can't be dragged but slide aside). */
    const tabRows = useMemo(() => sections.flatMap((s) => s.fields), [sections]);
    const sectionKeys = useMemo(() => sections.map((s) => s.sectionKey), [sections]);
    const sectionOfField = useCallback((f: FormFieldDefinitionDto) => f.sectionKey, []);

    /**
     * Applies a drop: a field dropped into another section moves there, and the tab's rows keep the module-order slots they occupy, filled in the new order, so other tabs
     * stay where they are.
     */
    const applyTabReorder = (orderedIds: string[], sectionById: Record<string, string>) => {
        const shown = new Set(orderedIds);
        let next = 0;
        const ids = allFields.map((f) => (shown.has(f.id) ? orderedIds[next++] : f.id));
        try {
            for (const field of tabRows) {
                const target = sectionById[field.id];
                if (!target || target === field.sectionKey) continue;
                const section = sections.find((s) => s.sectionKey === target);
                draft.updateField(field.id, { sectionKey: target, sectionLabel: section?.sectionLabel ?? field.sectionLabel });
            }
            draft.reorderFields(module, ids);
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };

    const { getRowDragProps, getGroupProps, getRowDragSx } = useDragReorder({
        items: tabRows,
        canDrag: canEdit && !busy,
        groups: sectionKeys,
        groupOf: sectionOfField,
        onReorder: applyTabReorder,
    });

    // ── Drag and drop of whole sections within the tab ──
    // Section order is the order of each section's first field, so a section drop regroups the tab's fields.
    const sectionDragItems = useMemo(() => sections.map((s) => ({ ...s, id: s.sectionKey })), [sections]);
    const sectionDrag = useDragReorder({
        items: sectionDragItems,
        canDrag: canEdit && !busy && sections.length > 1,
        onReorder: (orderedSectionKeys) => {
            try {
                draft.reorderFields(module, reorderTabSections(allFields, tabKey, orderedSectionKeys));
            } catch (err) {
                notify(errorMessage(err), 'error');
            }
        },
    });

    // ── Deleting sections and tabs ──
    const [sectionDeleteTarget, setSectionDeleteTarget] = useState<{ sectionKey: string; sectionLabel: string; fields: FormFieldDefinitionDto[] } | null>(null);
    const [tabDeleteTarget, setTabDeleteTarget] = useState<string | null>(null);
    /** Every field of a section of this tab, archived ones included (what deleting it removes). */
    const sectionFields = (sectionKey: string) => allFields.filter((f) => f.tabKey === tabKey && f.sectionKey === sectionKey);
    const tabFields = (key: string) => allFields.filter((f) => f.tabKey === key);
    const tabDeleteDisabledReason = (key: string): string | null => {
        if (tabs.length <= 1) return 'Cannot delete tab: the form needs at least one tab';
        const locked = tabFields(key).filter((f) => f.isCoreLocked);
        return locked.length > 0 ? `Cannot delete tab: contains core-locked field(s): ${locked.map((f) => f.label).join(', ')}` : null;
    };
    const tabToDelete = tabs.find((t) => t.key === tabDeleteTarget);
    const tabToDeleteFieldCount = tabToDelete ? tabFields(tabToDelete.key).length : 0;

    const tabItems = tabs.map((t) => ({
        key: t.key,
        label: t.label,
        count: allFields.filter((f) => f.tabKey === t.key && f.isActive).length,
        hasUnsaved: unsavedTabs?.has(t.key) ?? false,
        unsavedTooltip: 'Unsaved changes on this tab',
    }));

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexWrap: 'wrap' }}>
                    <PillTabs
                        items={tabItems}
                        value={tabKey}
                        onChange={setTabKey}
                        onDeleteTab={canEdit && !busy ? setTabDeleteTarget : undefined}
                        getDeleteTabDisabledReason={tabDeleteDisabledReason}
                    />
                    {canEdit && (
                        <Button
                            size="small"
                            startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
                            onClick={() => setNewTabOpen(true)}
                            disabled={busy}
                            sx={{
                                textTransform: 'none',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                borderRadius: '8px',
                                px: 1.25,
                                py: 0.55,
                                color: '#2563eb',
                                border: '1px dashed #93c5fd',
                                backgroundColor: '#ffffff',
                                whiteSpace: 'nowrap',
                                '&:hover': { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
                            }}
                        >
                            New Tab
                        </Button>
                    )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    {archivedCount > 0 && (
                        <FormControlLabel
                            sx={{ m: 0, mr: 1 }}
                            control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />}
                            label={<Typography sx={{ fontSize: '0.76rem', color: '#475569' }}>Show archived ({archivedCount})</Typography>}
                        />
                    )}
                    {canEdit && (
                        <>
                            <Button variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={() => setEditor({ open: true })} sx={primaryButtonSx}>
                                Add Field
                            </Button>
                        </>
                    )}
                </Box>
            </Box>

            <Box sx={{ overflowX: 'auto' }}>
                <Box sx={{ minWidth: 820 }}>
                    {/* Column headings */}
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: GRID_COLUMNS,
                            gap: 1.5,
                            alignItems: 'center',
                            px: 2,
                            py: 1,
                            borderBottom: '1px solid #e2e8f0',
                            '& > *': { fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' },
                        }}
                    >
                        <span />
                        <span>Field</span>
                        <span>Type</span>
                        <span>Width</span>
                        <span>Required</span>
                        <span>Form</span>
                        <span>Drawer</span>
                        <span />
                    </Box>

                    {sections.length === 0 &&
                        (tabIsEmpty && unsavedTabs?.has(tabKey) ? (
                            <EmptyState
                                icon={<ViewQuiltOutlinedIcon />}
                                title={`Welcome to your new tab${activeTab ? ` '${activeTab.label}'` : ''}`}
                                description="Add a field to start its first section. The tab shows on the form, in the Live Preview and on the real CRM form once it has a field (an empty tab is not kept when you save)."
                                action={
                                    canEdit ? (
                                        <Button variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={() => setEditor({ open: true })} sx={primaryButtonSx}>
                                            Add First Field to {activeTab?.label ?? 'this tab'}
                                        </Button>
                                    ) : undefined
                                }
                            />
                        ) : (
                            <EmptyState
                                icon={<ViewQuiltOutlinedIcon />}
                                title="No configurable fields on this tab"
                                description="Composite blocks (addresses, email lists, line items) aren't listed. Add a field to extend this tab."
                            />
                        ))}

                    {sectionDrag.orderedItems.map((section, index) => {
                        const allSectionFields = sectionFields(section.sectionKey);
                        const { onPointerDown: onSectionPointerDown, ...sectionBlockProps } = sectionDrag.getRowDragProps(section);
                        return (
                            <SectionBlock
                                // Remounts with the saved label after a rename.
                                key={`${section.sectionKey}:${section.sectionLabel}`}
                                module={module}
                                section={section}
                                first={index === 0}
                                canEdit={canEdit}
                                busy={busy}
                                onRename={(label) => run(() => draft.renameSection(module, section.sectionKey, label))}
                                onAddField={() => setEditor({ open: true, sectionKey: section.sectionKey })}
                                onEdit={(field) => setEditor({ open: true, field })}
                                onPatch={patch}
                                onDelete={setDeleteTarget}
                                onDeleteSection={() =>
                                    setSectionDeleteTarget({ sectionKey: section.sectionKey, sectionLabel: section.sectionLabel, fields: allSectionFields })
                                }
                                lockedFields={allSectionFields.filter((f) => f.isCoreLocked)}
                                headerProps={getGroupProps(section.sectionKey)}
                                rowDragProps={getRowDragProps}
                                rowDragSx={getRowDragSx}
                                sectionBlockProps={sectionBlockProps}
                                onSectionPointerDown={onSectionPointerDown}
                                canDragSection={sections.length > 1}
                            />
                        );
                    })}
                </Box>
            </Box>

            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Drag a field by its grip to reorder it or to move it into another section of this tab, or drag a section by its
                    header to reorder whole sections: the form shows the fields in the order and sections listed here. Any field can also
                    be moved to another tab from Edit. Composite blocks (email lists, line items, toggles) keep their place.
                </Typography>
            </Box>

            {newTabOpen && (
                <NewTabDialog
                    module={module}
                    onClose={() => setNewTabOpen(false)}
                    onCreate={(label) => {
                        const tab = draft.createTab(module, label);
                        setTabKey(tab.key);
                        setNewTabOpen(false);
                        notify(`Tab '${tab.label}' added — add a field to it, then click Save Changes`, 'info');
                    }}
                />
            )}

            {editor.open && (
            <FieldEditorModal
                key={editor.field?.id ?? `new:${editor.sectionKey ?? ''}`}
                open
                onClose={() => setEditor({ open: false })}
                module={module}
                configs={configs}
                field={editor.field}
                defaultTabKey={tabKey}
                defaultSectionKey={editor.sectionKey}
                notify={notify}
            />
            )}


            <ConfirmDeleteDialog
                open={Boolean(deleteTarget)}
                title={`Delete '${deleteTarget?.label ?? ''}' permanently?`}
                confirmLabel="Delete Field"
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => {
                    const target = deleteTarget;
                    setDeleteTarget(null);
                    if (target) void run(() => draft.deleteField(target.id));
                }}
            >
                <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                    The field is removed from the {CRM_MODULE_LABELS[module]} form and drawer for good. Values already stored on records are no
                    longer shown. To hide it but keep it restorable, use Archive instead.
                </Typography>
                {deleteTarget?.dropdownCategoryKey && (
                    <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>{dropdownFateMessage(configs, module, deleteTarget)}</Typography>
                )}
                <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>The deletion is applied when you click Save Changes.</Typography>
            </ConfirmDeleteDialog>

            <ConfirmDeleteDialog
                open={Boolean(sectionDeleteTarget)}
                title={`Delete the '${sectionDeleteTarget?.sectionLabel ?? ''}' section?`}
                confirmLabel="Delete Section"
                onClose={() => setSectionDeleteTarget(null)}
                onConfirm={() => {
                    const target = sectionDeleteTarget;
                    setSectionDeleteTarget(null);
                    if (!target) return;
                    void run(() => {
                        draft.deleteSection(module, tabKey, target.sectionKey);
                        notify(`Section '${target.sectionLabel}' deleted — click Save Changes to apply it`, 'info');
                    });
                }}
            >
                <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                    {deletionSummary(sectionDeleteTarget?.fields.length ?? 0, 'section')}
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>{DELETION_NOTE}</Typography>
            </ConfirmDeleteDialog>

            <ConfirmDeleteDialog
                open={Boolean(tabToDelete)}
                title={`Delete "${tabToDelete?.label ?? ''}" tab?`}
                confirmLabel="Delete Tab"
                onClose={() => setTabDeleteTarget(null)}
                onConfirm={() => {
                    const target = tabToDelete;
                    setTabDeleteTarget(null);
                    if (!target) return;
                    void run(() => {
                        draft.deleteTab(module, target.key);
                        if (target.key === tabKey) setTabKey(tabs.find((t) => t.key !== target.key)?.key ?? 'overview');
                        notify(`Tab '${target.label}' deleted — click Save Changes to apply it`, 'info');
                    });
                }}
            >
                <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                    {tabToDeleteFieldCount === 0
                        ? `The tab is removed from the ${CRM_MODULE_LABELS[module]} form. It has no fields.`
                        : `The tab is removed from the ${CRM_MODULE_LABELS[module]} form. ${deletionSummary(tabToDeleteFieldCount, 'tab')}`}
                </Typography>
                {tabToDeleteFieldCount > 0 && <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>{DELETION_NOTE}</Typography>}
            </ConfirmDeleteDialog>
        </Box>
    );
}

const DELETION_NOTE =
    'This cannot be undone: deleted tabs, sections and fields cannot be brought back. Values already stored on existing records are kept. The deletion is applied when you click Save Changes.';

/** What deleting a section / tab with `count` fields does to them. */
function deletionSummary(count: number, scope: 'section' | 'tab'): string {
    const fields = count === 1 ? 'The 1 field' : `All ${count} fields`;
    return `${fields} in this ${scope} ${count === 1 ? 'is' : 'are'} permanently deleted from the form.`;
}

/**
 * Module field ids in the order that puts the sections of `tabKey` in `orderedSectionKeys` order: each section's
 * fields stay together in their own order, and the tab's fields keep the module-order slots they occupy, so fields
 * of other tabs don't move. Sections not listed (e.g. ones only holding archived fields) follow in their old order.
 */
export function reorderTabSections(allModuleFields: FormFieldDefinitionDto[], tabKey: string, orderedSectionKeys: string[]): string[] {
    const sorted = [...allModuleFields].sort((a, b) => a.sortOrder - b.sortOrder);
    const bySection = new Map<string, string[]>();
    for (const field of sorted) {
        if (field.tabKey !== tabKey) continue;
        bySection.set(field.sectionKey, [...(bySection.get(field.sectionKey) ?? []), field.id]);
    }
    const keys = [...orderedSectionKeys.filter((k) => bySection.has(k)), ...[...bySection.keys()].filter((k) => !orderedSectionKeys.includes(k))];
    const tabIds = keys.flatMap((k) => bySection.get(k) ?? []);
    let next = 0;
    return sorted.map((field) => (field.tabKey === tabKey ? tabIds[next++] : field.id));
}

/** What deleting `field` does to its dropdown (same rule the draft and the API apply). */
function dropdownFateMessage(configs: FormConfigsPayload, module: CrmModuleKey, field: FormFieldDefinitionDto): string {
    const fate = categoryAfterFieldRemoval(configs, field);
    if (fate.action === 'delete') return "Its dropdown list is only used here and will also be deleted from this form's dropdowns.";
    const others = Object.values(configs.fieldsByModule)
        .flat()
        .filter((f) => f.id !== field.id && f.dropdownCategoryKey === field.dropdownCategoryKey);
    if (others.length > 0 && others.every((f) => f.module !== module)) {
        return `Its dropdown will be removed from the ${CRM_MODULE_LABELS[module]} form, but kept on the other form(s) that use it.`;
    }
    return others.length > 0 ? 'Its dropdown list is kept: other fields on this form still use it.' : 'Its dropdown list is kept.';
}

// ── Section ──────────────────────────────────────────────────────────────────

/** Compact dialog naming a new custom tab (its key is a slug of the name). */
function NewTabDialog({ module, onClose, onCreate }: { module: CrmModuleKey; onClose: () => void; onCreate: (label: string) => void }) {
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const submit = () => {
        if (!name.trim()) {
            setError('Enter a name for the tab.');
            return;
        }
        try {
            onCreate(name.trim());
        } catch (err) {
            setError(errorMessage(err));
        }
    };
    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', borderBottom: '1px solid #e2e8f0' }}>New Tab — {CRM_MODULE_LABELS[module]}</DialogTitle>
            <DialogContent sx={{ pt: '20px !important', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                    label="Tab name"
                    size="small"
                    fullWidth
                    autoFocus
                    value={name}
                    placeholder="e.g. Compliance & Legal"
                    onChange={(e) => {
                        setName(e.target.value);
                        setError(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    error={Boolean(error)}
                    helperText={error ?? (name.trim() ? `Tab key: ${tabKeyFromLabel(name)}` : 'Shown on the form next to the other tabs.')}
                    sx={inputSx}
                    slotProps={{ htmlInput: { maxLength: 60 } }}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button onClick={submit} variant="contained" sx={primaryButtonSx} disabled={!name.trim()}>
                    Create Tab
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function SectionBlock({
    section,
    first,
    canEdit,
    busy,
    onRename,
    onAddField,
    onEdit,
    onPatch,
    onDelete,
    onDeleteSection,
    lockedFields,
    headerProps,
    rowDragProps,
    rowDragSx,
    sectionBlockProps,
    onSectionPointerDown,
    canDragSection,
}: {
    module: CrmModuleKey;
    section: ConfiguredSection;
    /** First section of the tab (no divider above it). */
    first: boolean;
    canEdit: boolean;
    busy: boolean;
    onRename: (label: string) => Promise<void>;
    onAddField: () => void;
    onEdit: (field: FormFieldDefinitionDto) => void;
    onPatch: (field: FormFieldDefinitionDto, body: UpdateFieldPayload) => Promise<void>;
    onDelete: (field: FormFieldDefinitionDto) => void;
    /** Opens the confirmation for deleting the whole section. */
    onDeleteSection: () => void;
    /** Core-locked fields of the section (archived ones included): while any, it can't be deleted. */
    lockedFields: FormFieldDefinitionDto[];
    /** Tab-level drag and drop: the header is the boundary a row crosses to enter this section. */
    headerProps: GroupDragProps;
    rowDragProps: (field: FormFieldDefinitionDto, isDraggable?: boolean) => RowDragProps;
    rowDragSx: (field: FormFieldDefinitionDto) => Record<string, unknown>;
    /** Section drag and drop: spread on the whole block (what moves)… */
    sectionBlockProps: Omit<RowDragProps, 'onPointerDown'>;
    /** …which is picked up by its header. */
    onSectionPointerDown: RowDragProps['onPointerDown'];
    /** False when this is the tab's only section. */
    canDragSection: boolean;
}) {
    const canDeleteSection = lockedFields.length === 0;
    const sectionDragDisabled = !canEdit || busy || !canDragSection;
    const [renaming, setRenaming] = useState(false);
    const [label, setLabel] = useState(section.sectionLabel);

    const commit = () => {
        const next = label.trim();
        setRenaming(false);
        if (next && next !== section.sectionLabel) void onRename(next);
        else setLabel(section.sectionLabel);
    };

    return (
        // The block is what moves in a section drag (styled by useDragReorder like a lifted field row); the drag
        // starts from its header only, so pressing a field row still drags just that field.
        <Box {...sectionBlockProps} sx={{ backgroundColor: '#ffffff' }}>
            {/* Divider lives on the header so it slides with the header while a row is dragged past it. */}
            <Box
                {...headerProps}
                onPointerDown={sectionDragDisabled ? undefined : onSectionPointerDown}
                sx={{
                    px: 2,
                    pt: 2,
                    pb: 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderTop: first ? 'none' : '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    cursor: sectionDragDisabled ? undefined : 'grab',
                }}
            >
                {canEdit && (
                    <Box sx={{ ml: -0.75 }}>
                        <DragHandle
                            disabled={sectionDragDisabled}
                            title={canDragSection ? 'Drag to reorder section' : 'Only section on this tab'}
                        />
                    </Box>
                )}
                {renaming ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <TextField
                            size="small"
                            value={label}
                            autoFocus
                            onChange={(e) => setLabel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commit();
                                if (e.key === 'Escape') {
                                    setLabel(section.sectionLabel);
                                    setRenaming(false);
                                }
                            }}
                            sx={{ ...inputSx, width: 300 }}
                            slotProps={{ htmlInput: { maxLength: 120, 'aria-label': 'Section name' } }}
                        />
                        <IconButton size="small" aria-label="Save section name" onClick={commit}>
                            <CheckRoundedIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                        </IconButton>
                        <IconButton
                            size="small"
                            aria-label="Cancel rename"
                            onClick={() => {
                                setLabel(section.sectionLabel);
                                setRenaming(false);
                            }}
                        >
                            <CloseRoundedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>
                ) : (
                    <>
                        <SectionLabel label={section.sectionLabel} sx={{ mb: 0 }} />
                        {canEdit && (
                            <Tooltip title="Rename section" arrow>
                                <IconButton size="small" aria-label={`Rename ${section.sectionLabel}`} onClick={() => setRenaming(true)} disabled={busy}>
                                    <EditOutlinedIcon sx={{ fontSize: 15, color: '#64748b' }} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </>
                )}
                <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {section.fields.length} field{section.fields.length === 1 ? '' : 's'}
                </Typography>
                {canEdit && (
                    <Button size="small" startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />} onClick={onAddField} sx={{ ml: 'auto', textTransform: 'none', fontSize: '0.76rem', fontWeight: 600 }}>
                        Add field here
                    </Button>
                )}
                {canEdit && (
                    <Tooltip
                        arrow
                        title={
                            canDeleteSection
                                ? 'Delete section'
                                : `Cannot delete section: contains core-locked field(s): ${lockedFields.map((f) => f.label).join(', ')}`
                        }
                    >
                        {/* span: a disabled button fires no events, so the tooltip hangs on its wrapper. */}
                        <span>
                            <IconButton
                                size="small"
                                aria-label={canDeleteSection ? `Delete section ${section.sectionLabel}` : `Section ${section.sectionLabel} can't be deleted: it holds core-locked fields`}
                                disabled={busy || !canDeleteSection}
                                onClick={onDeleteSection}
                            >
                                <DeleteOutlineOutlinedIcon sx={{ fontSize: 17, color: busy || !canDeleteSection ? undefined : dangerColor }} />
                            </IconButton>
                        </span>
                    </Tooltip>
                )}
            </Box>

            <Box sx={{ position: 'relative' }}>
                {section.fields.map((field) => (
                    <FieldRow
                        key={field.id}
                        field={field}
                        canEdit={canEdit}
                        busy={busy}
                        onEdit={() => onEdit(field)}
                        onPatch={(body) => onPatch(field, body)}
                        onDelete={() => onDelete(field)}
                        dragProps={rowDragProps(field, field.isActive)}
                        dragSx={rowDragSx(field)}
                    />
                ))}
            </Box>
        </Box>
    );
}

// ── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
    field,
    canEdit,
    busy,
    onEdit,
    onPatch,
    onDelete,
    dragProps,
    dragSx,
}: {
    field: FormFieldDefinitionDto;
    canEdit: boolean;
    busy: boolean;
    onEdit: () => void;
    onPatch: (body: UpdateFieldPayload) => Promise<void>;
    onDelete: () => void;
    dragProps: RowDragProps;
    dragSx: Record<string, unknown>;
}) {
    const locked = field.isCoreLocked;
    const unsaved = useHasUnsavedChanges(field.id);
    const disabled = !canEdit || busy || !field.isActive;
    const lockReason = 'Core field: always required and visible';

    return (
        <Box
            {...dragProps}
            sx={{
                display: 'grid',
                gridTemplateColumns: GRID_COLUMNS,
                gap: 1.5,
                alignItems: 'center',
                px: 2,
                py: 0.9,
                borderTop: '1px solid #f1f5f9',
                opacity: field.isActive ? 1 : 0.6,
                backgroundColor: field.isActive ? 'transparent' : '#fafafa',
                transition: 'background-color 0.12s, box-shadow 0.12s',
                '&:hover': { backgroundColor: '#f8fafc' },
                ...dragSx,
            }}
        >
            <DragHandle disabled={disabled} />

            <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }} noWrap>
                        {field.label}
                    </Typography>
                    {locked && (
                        <Badge tone="locked" icon={<LockOutlinedIcon sx={{ fontSize: 11 }} />} title={lockReason}>
                            Locked
                        </Badge>
                    )}
                    {!field.isActive && <Badge tone="archived">Archived</Badge>}
                    {unsaved && (
                        <Badge tone="unsaved" title="Changed in this session: click Save Changes to apply it">
                            Unsaved
                        </Badge>
                    )}
                </Box>
                <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }} noWrap>
                    {field.fieldKey}
                    {field.dropdownCategoryKey ? ` · ${field.dropdownCategoryKey}` : ''}
                </Typography>
            </Box>

            <Box>
                <Badge tone="neutral">{FIELD_TYPE_LABELS[field.fieldType] ?? field.fieldType}</Badge>
            </Box>

            <Select
                size="small"
                value={field.fieldSize ?? ''}
                displayEmpty
                disabled={disabled}
                onChange={(e) => void onPatch({ fieldSize: (e.target.value as ConfigFieldSize) || null })}
                sx={{ fontSize: '0.78rem', height: 30, borderRadius: '8px' }}
                inputProps={{ 'aria-label': `Width of ${field.label}` }}
            >
                {SIZES.map((s) => (
                    <MenuItem key={s || 'auto'} value={s} sx={{ fontSize: '0.8rem' }}>
                        {s ? s.toUpperCase() : 'Auto'}
                    </MenuItem>
                ))}
            </Select>

            <LabeledSwitch
                label={`${field.label} required`}
                checked={field.isRequired}
                disabled={disabled || locked}
                disabledReason={locked ? lockReason : undefined}
                onChange={(isRequired) => void onPatch({ isRequired })}
            />
            <LabeledSwitch
                label={`${field.label} visible in form`}
                checked={field.isVisibleInForm}
                disabled={disabled || locked}
                disabledReason={locked ? lockReason : undefined}
                onChange={(isVisibleInForm) => void onPatch({ isVisibleInForm })}
            />
            <LabeledSwitch
                label={`${field.label} visible in drawer`}
                checked={field.isVisibleInDrawer}
                disabled={disabled}
                onChange={(isVisibleInDrawer) => void onPatch({ isVisibleInDrawer })}
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                {canEdit && field.isActive && (
                    <Tooltip title="Edit field" arrow>
                        <IconButton size="small" aria-label={`Edit ${field.label}`} onClick={onEdit} disabled={busy}>
                            <EditOutlinedIcon sx={{ fontSize: 17, color: '#2563eb' }} />
                        </IconButton>
                    </Tooltip>
                )}
                {canEdit && !locked && (
                    <Tooltip title={field.isActive ? 'Archive (values on existing records are kept)' : 'Restore'} arrow>
                        <IconButton
                            size="small"
                            aria-label={field.isActive ? `Archive ${field.label}` : `Restore ${field.label}`}
                            disabled={busy}
                            onClick={() => void onPatch({ isActive: !field.isActive })}
                        >
                            {field.isActive ? <ArchiveOutlinedIcon sx={{ fontSize: 17, color: '#b45309' }} /> : <UnarchiveOutlinedIcon sx={{ fontSize: 17, color: '#16a34a' }} />}
                        </IconButton>
                    </Tooltip>
                )}
                {canEdit && !locked && (
                    <Tooltip title="Delete permanently" arrow>
                        <span>
                            <IconButton size="small" aria-label={`Delete ${field.label}`} disabled={busy} onClick={onDelete}>
                                <DeleteOutlineOutlinedIcon sx={{ fontSize: 17, color: busy ? undefined : dangerColor }} />
                            </IconButton>
                        </span>
                    </Tooltip>
                )}
            </Box>
        </Box>
    );
}
