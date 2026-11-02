'use client';

import React, { useMemo, useState } from 'react';
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
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ViewQuiltOutlinedIcon from '@mui/icons-material/ViewQuiltOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { SectionLabel } from '@/components/forms/SectionLabel';
import { useConfigDraftActions, useHasUnsavedChanges } from './useConfigDraft';
import {
    CRM_MODULE_LABELS,
    FIELD_TYPE_LABELS,
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
import { useDragReorder, type RowDragProps } from './useDragReorder';
import { categoryAfterFieldRemoval } from './configDraft';

export interface FormFieldsBuilderPanelProps {
    module: CrmModuleKey;
    configs: FormConfigsPayload;
    canEdit: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

const SIZES: (ConfigFieldSize | '')[] = ['', 'xs', 'sm', 'md', 'lg', 'full'];
const GRID_COLUMNS = '28px minmax(180px, 1.6fr) 120px 92px 70px 70px 70px 104px';

/** Every field of a module grouped by tab and section, with inline toggles and the custom field editor. */
export function FormFieldsBuilderPanel({ module, configs, canEdit, notify }: FormFieldsBuilderPanelProps) {
    const tabs = useMemo(() => configs.moduleTabs[module] ?? [], [configs, module]);
    const [selectedTab, setTabKey] = useState(tabs[0]?.key ?? 'overview');
    // Falls back to the first tab when the module changes.
    const tabKey = tabs.some((t) => t.key === selectedTab) ? selectedTab : (tabs[0]?.key ?? 'overview');
    const [showArchived, setShowArchived] = useState(false);
    const [editor, setEditor] = useState<{ open: boolean; field?: FormFieldDefinitionDto; sectionKey?: string }>({ open: false });
    const [resetOpen, setResetOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<FormFieldDefinitionDto | null>(null);
    const [busy, setBusy] = useState(false);
    const draft = useConfigDraftActions();

    const allFields = useMemo(() => moduleFields(configs, module), [configs, module]);
    const sections = useMemo(
        () => groupSections(allFields.filter((f) => f.isActive || showArchived), tabKey),
        [allFields, showArchived, tabKey],
    );
    const archivedCount = allFields.filter((f) => !f.isActive).length;

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

    /**
     * Applies a dragged order of a section's active fields to the module order: the section's fields keep the
     * slots they occupy, filled in the new order, so every other section and tab stays where it is.
     */
    const reorderSection = (orderedIds: string[]) => {
        const inSection = new Set(orderedIds);
        let next = 0;
        const ids = allFields.map((f) => (inSection.has(f.id) ? orderedIds[next++] : f.id));
        void run(() => draft.reorderFields(module, ids));
    };

    const tabItems = tabs.map((t) => ({
        key: t.key,
        label: t.label,
        count: allFields.filter((f) => f.tabKey === t.key && f.isActive).length,
    }));

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                <PillTabs items={tabItems} value={tabKey} onChange={setTabKey} />
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
                            <Button variant="outlined" size="small" startIcon={<RestartAltRoundedIcon />} onClick={() => setResetOpen(true)} sx={secondaryButtonSx} disabled={busy}>
                                Reset Built-in
                            </Button>
                            <Button variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={() => setEditor({ open: true })} sx={primaryButtonSx}>
                                Add Custom Field
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

                    {sections.length === 0 && (
                        <EmptyState
                            icon={<ViewQuiltOutlinedIcon />}
                            title="No configurable fields on this tab"
                            description="Built-in composite blocks (addresses, email lists, line items) aren't listed. Add a custom field to extend this tab."
                        />
                    )}

                    {sections.map((section) => (
                        <SectionBlock
                            // Remounts with the saved label after a rename.
                            key={`${section.sectionKey}:${section.sectionLabel}`}
                            module={module}
                            section={section}
                            canEdit={canEdit}
                            busy={busy}
                            onRename={(label) => run(() => draft.renameSection(module, section.sectionKey, label))}
                            onAddField={() => setEditor({ open: true, sectionKey: section.sectionKey })}
                            onEdit={(field) => setEditor({ open: true, field })}
                            onReorder={reorderSection}
                            onPatch={patch}
                            onDelete={setDeleteTarget}
                        />
                    ))}
                </Box>
            </Box>

            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Drag a field by its grip to move it within its section: the form shows the fields in the order listed here, custom fields
                    included. Built-in fields stay in their own section; custom fields can be moved to another section from Edit. Composite blocks
                    (email lists, line items, toggles) keep their place.
                </Typography>
            </Box>

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

            <Dialog open={resetOpen} onClose={() => setResetOpen(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Reset {CRM_MODULE_LABELS[module]} built-in fields?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                        Labels, hints, placeholders, widths, required flags, visibility and section names of the built-in fields go back to their defaults. Custom
                        fields and dropdown options are kept. The reset shows in the preview right away and is applied when you click Save Changes.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setResetOpen(false)} variant="outlined" sx={secondaryButtonSx}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        sx={{ ...primaryButtonSx, background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' }}
                        onClick={() => {
                            setResetOpen(false);
                            void run(() => draft.resetModule(module));
                        }}
                    >
                        Reset
                    </Button>
                </DialogActions>
            </Dialog>

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
                    The custom field is removed from the {CRM_MODULE_LABELS[module]} form and drawer for good. Values already stored on records are no
                    longer shown. To hide it but keep it restorable, use Archive instead.
                </Typography>
                {deleteTarget?.dropdownCategoryKey && (
                    <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>{dropdownFateMessage(configs, module, deleteTarget)}</Typography>
                )}
                <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>The deletion is applied when you click Save Changes.</Typography>
            </ConfirmDeleteDialog>
        </Box>
    );
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
    return others.length > 0 ? 'Its dropdown list is kept: other fields on this form still use it.' : 'Its built-in dropdown list is kept.';
}

// ── Section ──────────────────────────────────────────────────────────────────

function SectionBlock({
    section,
    canEdit,
    busy,
    onRename,
    onAddField,
    onEdit,
    onReorder,
    onPatch,
    onDelete,
}: {
    module: CrmModuleKey;
    section: ConfiguredSection;
    canEdit: boolean;
    busy: boolean;
    onRename: (label: string) => Promise<void>;
    onAddField: () => void;
    onEdit: (field: FormFieldDefinitionDto) => void;
    /** New order of the section's active fields (drag and drop). */
    onReorder: (orderedIds: string[]) => void;
    onPatch: (field: FormFieldDefinitionDto, body: UpdateFieldPayload) => Promise<void>;
    onDelete: (field: FormFieldDefinitionDto) => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [label, setLabel] = useState(section.sectionLabel);
    const movable = section.fields.filter((f) => f.isActive);
    const { orderedItems, getRowDragProps, getRowDragSx } = useDragReorder({ items: movable, canDrag: canEdit && !busy, onReorder });
    // Active fields in their (optimistic) dragged order; archived ones keep their slots.
    let nextActive = 0;
    const rows = section.fields.map((f) => (f.isActive ? (orderedItems[nextActive++] ?? f) : f));

    const commit = () => {
        const next = label.trim();
        setRenaming(false);
        if (next && next !== section.sectionLabel) void onRename(next);
        else setLabel(section.sectionLabel);
    };

    return (
        <Box sx={{ borderBottom: '1px solid #e2e8f0' }}>
            <Box sx={{ px: 2, pt: 2, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
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
            </Box>

            <Box sx={{ position: 'relative' }}>
            {rows.map((field) => {
                return (
                    <FieldRow
                        key={field.id}
                        field={field}
                        canEdit={canEdit}
                        busy={busy}
                        onEdit={() => onEdit(field)}
                        onPatch={(body) => onPatch(field, body)}
                        onDelete={() => onDelete(field)}
                        dragProps={getRowDragProps(field, field.isActive)}
                        dragSx={getRowDragSx(field)}
                    />
                );
            })}
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
                    <Badge tone={field.isSystem ? 'system' : 'custom'}>{field.isSystem ? 'System' : 'Custom'}</Badge>
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
                disabled={disabled || field.isSystem}
                disabledReason={field.isSystem ? 'Detail drawers lay out built-in fields themselves' : undefined}
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
                {canEdit && !field.isSystem && (
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
                {canEdit && !field.isSystem && (
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
