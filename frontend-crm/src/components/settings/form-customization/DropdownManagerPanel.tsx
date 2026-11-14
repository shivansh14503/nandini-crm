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
    InputAdornment,
    Radio,
    RadioGroup,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { DefaultBookmarkOffIcon, DefaultBookmarkOnIcon } from './defaultOptionIcons';
import { EditCategoryDialog } from './EditCategoryDialog';
import { useConfigDraftActions, useHasUnsavedChanges } from './useConfigDraft';
import { CRM_MODULE_LABELS, type CrmModuleKey, type DropdownCategoryDto, type DropdownOptionDto, type FormConfigsPayload } from '@/types/formConfig.types';
import { useDragReorder, type RowDragProps } from './useDragReorder';
import {
    ControlTypePicker,
    ModuleTargetsPicker,
    PlaceDropdownInFormsDialog,
    PlacementFields,
    defaultPlacement,
    placementError,
    stageDropdownFields,
    type DropdownControlType,
    type PlacementTargets,
} from './DropdownPlacement';
import {
    Badge,
    ConfirmDeleteDialog,
    EmptyState,
    LabeledSwitch,
    DragHandle,
    dangerColor,
    errorMessage,
    inputSx,
    panelHeaderSx,
    primaryButtonSx,
    secondaryButtonSx,
    surfaceSx,
} from './builderUi';

export interface DropdownManagerPanelProps {
    module: CrmModuleKey;
    configs: FormConfigsPayload;
    canEdit: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

const moduleLabel = (m: string) => CRM_MODULE_LABELS[m as CrmModuleKey] ?? m;

/**
 * Dropdowns listed under a module: those a field of the module uses, plus not-yet-placed ones that are this
 * module's or shared. A dropdown whose only field on this form was deleted therefore leaves this list while
 * staying under the modules that still use it.
 */
export function categoriesForModule(configs: FormConfigsPayload, module: CrmModuleKey): DropdownCategoryDto[] {
    return configs.categories
        .filter((c) => c.usedBy.some((u) => u.module === module) || (c.usedBy.length === 0 && (c.module === module || c.module === 'shared')))
        .sort((a, b) => (a.module === module ? 0 : 1) - (b.module === module ? 0 : 1) || a.label.localeCompare(b.label));
}

/** Left sidebar + option editor for the selected module's dropdowns. */
export function DropdownManagerPanel({ module, configs, canEdit, notify }: DropdownManagerPanelProps) {
    const categories = useMemo(() => categoriesForModule(configs, module), [configs, module]);
    const [selectedKey, setSelectedKey] = useState<string | undefined>(categories[0]?.key);
    const [search, setSearch] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DropdownCategoryDto | null>(null);
    const draft = useConfigDraftActions();

    // Falls back to the first dropdown when the module changes (or the selected one is gone).
    const activeKey = categories.some((c) => c.key === selectedKey) ? selectedKey : categories[0]?.key;
    const visible = categories.filter((c) => !search.trim() || c.label.toLowerCase().includes(search.trim().toLowerCase()));
    const selected = categories.find((c) => c.key === activeKey);

    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
            {/* ── Category list ── */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
                <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>Dropdowns ({categories.length})</Typography>
                    {canEdit && (
                        <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setCreateOpen(true)} sx={{ ...secondaryButtonSx, py: 0.3 }} variant="outlined">
                            New
                        </Button>
                    )}
                </Box>
                <Box sx={{ p: 1.25, borderBottom: '1px solid #f1f5f9' }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Search dropdowns…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        sx={inputSx}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchRoundedIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                </Box>
                <Box sx={{ maxHeight: { md: 560 }, overflowY: 'auto', p: 0.75 }}>
                    {visible.length === 0 && <EmptyState title="No dropdowns found" />}
                    {visible.map((c) => {
                        const active = c.key === activeKey;
                        const activeCount = c.options.filter((o) => o.isActive).length;
                        // A module-owned dropdown placed on another module's form becomes shared between them.
                        const modules = new Set<string>(c.usedBy.map((u) => u.module));
                        if (c.module !== 'shared') modules.add(c.module);
                        const otherModules = [...modules].filter((m) => m !== module);
                        const isShared = c.module === 'shared' || otherModules.length > 0;
                        return (
                            <Box
                                key={c.key}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedKey(c.key)}
                                onKeyDown={(e) => e.key === 'Enter' && setSelectedKey(c.key)}
                                sx={{
                                    px: 1.25,
                                    py: 1,
                                    mb: 0.4,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    border: `1px solid ${active ? '#bfdbfe' : 'transparent'}`,
                                    backgroundColor: active ? '#eff6ff' : 'transparent',
                                    '&:hover': { backgroundColor: active ? '#eff6ff' : '#f8fafc' },
                                    outline: 'none',
                                    '&:focus-visible': { boxShadow: '0 0 0 2px #bfdbfe' },
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                    <Typography sx={{ fontSize: '0.84rem', fontWeight: active ? 700 : 600, color: active ? '#1e3a8a' : '#1e293b' }} noWrap>
                                        {c.label}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.72rem', color: '#64748b', flexShrink: 0 }}>{activeCount}</Typography>
                                </Box>
                                {isShared && (
                                    <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        <Badge
                                            tone="shared"
                                            title={`Shared by: ${[...new Set(c.usedBy.map((u) => moduleLabel(u.module)))].join(', ') || 'not linked to a field yet'}`}
                                        >
                                            Shared{otherModules.length > 0 ? ` · ${otherModules.map(moduleLabel).join(', ')}` : ''}
                                        </Badge>
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            </Box>

            {/* ── Option editor ── */}
            {selected ? (
                <CategoryEditor
                    key={selected.key}
                    category={selected}
                    configs={configs}
                    module={module}
                    canEdit={canEdit}
                    notify={notify}
                    onDelete={() => setDeleteTarget(selected)}
                />
            ) : (
                <Box sx={surfaceSx}>
                    <EmptyState icon={<ListAltOutlinedIcon />} title="No dropdown selected" description="Pick a dropdown on the left, or create a new one." />
                </Box>
            )}

            {createOpen && (
            <CreateCategoryDialog
                open
                module={module}
                configs={configs}
                onClose={() => setCreateOpen(false)}
                onCreated={(key) => {
                    setCreateOpen(false);
                    setSelectedKey(key);
                }}
                notify={notify}
            />
            )}

            {deleteTarget && (
                <DeleteCategoryDialog
                    category={deleteTarget}
                    configs={configs}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={() => {
                        const target = deleteTarget;
                        setDeleteTarget(null);
                        try {
                            draft.deleteCategory(target.key);
                            notify(`Dropdown '${target.label}' deleted — click Save Changes to apply it`, 'info');
                        } catch (err) {
                            notify(errorMessage(err), 'error');
                        }
                    }}
                />
            )}
        </Box>
    );
}

/** Lists what deleting a dropdown takes with it; blocked while a locked field still uses it. */
function DeleteCategoryDialog({
    category,
    configs,
    onClose,
    onConfirm,
}: {
    category: DropdownCategoryDto;
    configs: FormConfigsPayload;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const linked = Object.values(configs.fieldsByModule)
        .flat()
        .filter((f) => f.dropdownCategoryKey === category.key);
    const builtIn = linked.filter((f) => f.isSystem);
    const custom = linked.filter((f) => !f.isSystem);
    const describe = (f: (typeof linked)[number]) => `${moduleLabel(f.module)} › ${f.label}${f.isActive ? '' : ' (archived)'}`;

    return (
        <ConfirmDeleteDialog
            open
            title={`Delete '${category.label}' permanently?`}
            confirmLabel="Delete Dropdown"
            confirmDisabled={Boolean(category.lockReason)}
            onClose={onClose}
            onConfirm={onConfirm}
        >
            <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                The dropdown and all {category.options.length} of its options are removed. Values already stored on records stay as plain text.
            </Typography>
            {category.lockReason && (
                <Box sx={{ p: 1.25, borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                    <Typography sx={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 600 }}>Can&apos;t delete: {category.lockReason}</Typography>
                </Box>
            )}
            {category.isSystem && !category.lockReason && (
                <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Once deleted it stays deleted (it isn&apos;t recreated on restart).
                </Typography>
            )}
            {!category.lockReason && builtIn.length > 0 && (
                <Box sx={{ p: 1.25, borderRadius: '8px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <Typography sx={{ fontSize: '0.8rem', color: '#c2410c', fontWeight: 600 }}>
                        {builtIn.length} field{builtIn.length === 1 ? '' : 's'} using it will be unlinked and hidden from the form:
                    </Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: '#c2410c', mt: 0.5 }}>
                        {builtIn.map(describe).join(' • ')}. To keep one, link it to another dropdown (Form Fields › Edit) and show it again.
                    </Typography>
                </Box>
            )}
            {!category.lockReason && custom.length > 0 && (
                <Box sx={{ p: 1.25, borderRadius: '8px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <Typography sx={{ fontSize: '0.8rem', color: '#c2410c', fontWeight: 600 }}>
                        {custom.length} field{custom.length === 1 ? '' : 's'} using it will also be deleted:
                    </Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: '#c2410c', mt: 0.5 }}>{custom.map(describe).join(' • ')}</Typography>
                </Box>
            )}
            {linked.length === 0 && <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>No form field uses this dropdown.</Typography>}
            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>The deletion is applied when you click Save Changes.</Typography>
        </ConfirmDeleteDialog>
    );
}

// ── Option editor ────────────────────────────────────────────────────────────

function CategoryEditor({
    category,
    configs,
    module,
    canEdit,
    notify,
    onDelete,
}: {
    category: DropdownCategoryDto;
    configs: FormConfigsPayload;
    module: CrmModuleKey;
    canEdit: boolean;
    notify: DropdownManagerPanelProps['notify'];
    onDelete: () => void;
}) {
    const [newOption, setNewOption] = useState('');
    const [busy, setBusy] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [placeOpen, setPlaceOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const draft = useConfigDraftActions();

    const sorted = [...category.options].sort((a, b) => a.sortOrder - b.sortOrder);
    const active = sorted.filter((o) => o.isActive);
    const archived = sorted.filter((o) => !o.isActive);
    const defaults = active.filter((o) => o.isDefault);
    // Several defaults only make sense when every field using the dropdown is a multi-select; otherwise picking
    // a default replaces the previous one.
    const linkedFields = Object.values(configs.fieldsByModule)
        .flat()
        .filter((f) => f.dropdownCategoryKey === category.key && !f.isDeleted);
    const allowsSeveralDefaults = linkedFields.length > 0 && linkedFields.every((f) => f.fieldType === 'multiselect');

    /** Marks an option as pre-selected on new records, or clears it (the field then shows its placeholder). */
    const setDefault = (option: DropdownOptionDto, isDefault: boolean) =>
        run(() => {
            if (isDefault && !allowsSeveralDefaults) {
                for (const other of category.options) {
                    if (other.isDefault && other.id !== option.id) draft.updateOption(other.id, { isDefault: false });
                }
            }
            draft.updateOption(option.id, { isDefault });
        });
    const {
        orderedItems: orderedActive,
        getRowDragProps,
        getRowDragSx,
    } = useDragReorder({
        items: active,
        canDrag: canEdit && !busy,
        onReorder: (ids) => void run(() => draft.reorderOptions(category.key, [...ids, ...archived.map((o) => o.id)])),
    });

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

    const addOption = async () => {
        const value = newOption.trim();
        if (!value) return;
        if (active.some((o) => o.value.toLowerCase() === value.toLowerCase())) {
            notify(`'${value}' is already in ${category.label}.`, 'warning');
            return;
        }
        await run(() => draft.addOption(category.key, { value }));
        setNewOption('');
    };

    const rows = showArchived ? [...orderedActive, ...archived] : orderedActive;

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, py: 1.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{category.label}</Typography>
                    <Badge tone={category.module === module ? 'custom' : 'shared'}>
                        {category.module === 'shared' ? 'Shared list' : moduleLabel(category.module)}
                    </Badge>
                    {category.lockReason && (
                        <Badge tone="locked" icon={<LockOutlinedIcon sx={{ fontSize: 11 }} />} title={`Can't be deleted: ${category.lockReason}`}>
                            Locked
                        </Badge>
                    )}
                    {canEdit && (
                        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)} sx={{ ...secondaryButtonSx, py: 0.3 }}>
                                Edit
                            </Button>
                            <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setPlaceOpen(true)} sx={{ ...secondaryButtonSx, py: 0.3 }}>
                                Add to Form…
                            </Button>
                            <Tooltip title={category.lockReason ? `Can't be deleted: ${category.lockReason}` : ''} arrow>
                                <span>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<DeleteOutlineOutlinedIcon />}
                                        onClick={onDelete}
                                        disabled={Boolean(category.lockReason)}
                                        sx={{ ...secondaryButtonSx, py: 0.3, color: dangerColor, borderColor: '#fecaca', '&:hover': { borderColor: dangerColor, backgroundColor: '#fef2f2' } }}
                                    >
                                        Delete Dropdown
                                    </Button>
                                </span>
                            </Tooltip>
                        </Box>
                    )}
                </Box>
            </Box>

            {canEdit && (
                <Box sx={{ p: 2, borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder={`Add a new option to ${category.label}…`}
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void addOption();
                            }
                        }}
                        disabled={busy}
                        sx={inputSx}
                        slotProps={{ htmlInput: { maxLength: 200, 'aria-label': 'New option' } }}
                    />
                    <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => void addOption()} disabled={busy || !newOption.trim()} sx={{ ...primaryButtonSx, flexShrink: 0 }}>
                        Add Option
                    </Button>
                </Box>
            )}

            <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9' }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {active.length} active{archived.length > 0 ? ` • ${archived.length} archived` : ''}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mt: 0.25 }}>
                        {defaults.length > 0
                            ? `Default on new records: ${defaults.map((o) => o.label).join(', ')}`
                            : 'No default: new records start empty and show the field’s placeholder.'}
                        {canEdit && (allowsSeveralDefaults ? ' Click the bookmark to add or remove defaults.' : ' Click the bookmark to set or remove the default.')}
                    </Typography>
                </Box>
                {archived.length > 0 && (
                    <FormControlLabel
                        sx={{ m: 0 }}
                        control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />}
                        label={<Typography sx={{ fontSize: '0.76rem', color: '#475569' }}>Show archived</Typography>}
                    />
                )}
            </Box>

            <Box sx={{ position: 'relative' }}>
                {rows.length === 0 && <EmptyState title="No options yet" description="Add the first option above." />}
                {rows.map((option) => {
                    return (
                        <OptionRow
                            // Remounts with the saved label after a rename.
                            key={`${option.id}:${option.label}`}
                            option={option}
                            canEdit={canEdit}
                            busy={busy}
                            // Forms store an option's value, so a regular option's value follows its new name; a system
                            // option's value drives CRM logic and stays fixed (only its label changes).
                            onRename={(next) =>
                                run(() => draft.updateOption(option.id, option.isSystem ? { label: next } : { value: next, label: next }))
                            }
                            onToggleActive={(isActive) => run(() => draft.updateOption(option.id, { isActive }))}
                            onToggleDefault={(isDefault) => setDefault(option, isDefault)}
                            onDelete={() => run(() => draft.deleteOption(option.id))}
                            dragProps={getRowDragProps(option, option.isActive)}
                            dragSx={getRowDragSx(option)}
                        />
                    );
                })}
            </Box>

            {placeOpen && <PlaceDropdownInFormsDialog category={category} configs={configs} module={module} onClose={() => setPlaceOpen(false)} notify={notify} />}
            {editOpen && <EditCategoryDialog category={category} configs={configs} module={module} onClose={() => setEditOpen(false)} notify={notify} />}
        </Box>
    );
}

function OptionRow({
    option,
    canEdit,
    busy,
    onRename,
    onToggleActive,
    onToggleDefault,
    onDelete,
    dragProps,
    dragSx,
}: {
    option: DropdownOptionDto;
    canEdit: boolean;
    busy: boolean;
    onRename: (label: string) => Promise<void>;
    onToggleActive: (isActive: boolean) => Promise<void>;
    onToggleDefault: (isDefault: boolean) => Promise<void>;
    onDelete: () => Promise<void>;
    dragProps: RowDragProps;
    dragSx: Record<string, unknown>;
}) {
    const [label, setLabel] = useState(option.label);
    const unsaved = useHasUnsavedChanges(option.id);

    const commit = () => {
        const next = label.trim();
        if (!next) {
            setLabel(option.label);
            return;
        }
        // Only an actual edit is staged: merely focusing a legacy option whose value differs from its label must not
        // silently re-key it (records storing the old value would stop resolving). Any real edit syncs both.
        if (next === option.label) return;
        void onRename(next);
    };

    return (
        <Box
            {...(canEdit ? dragProps : {})}
            sx={{
                display: 'grid',
                gridTemplateColumns: canEdit ? '28px minmax(0, 1fr) auto auto auto auto' : 'minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 1.25,
                px: 2,
                py: 0.9,
                borderBottom: '1px solid #f1f5f9',
                backgroundColor: option.isActive ? '#ffffff' : '#fafafa',
                opacity: option.isActive ? 1 : 0.75,
                transition: 'background-color 0.12s, box-shadow 0.12s',
                ...dragSx,
            }}
        >
            {canEdit && (
                <DragHandle disabled={!option.isActive || busy} />
            )}
            <Box sx={{ minWidth: 0 }}>
                {canEdit ? (
                    <TextField
                        size="small"
                        fullWidth
                        variant="standard"
                        value={label}
                        disabled={busy}
                        onChange={(e) => setLabel(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setLabel(option.label);
                        }}
                        slotProps={{ input: { disableUnderline: false, sx: { fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' } }, htmlInput: { maxLength: 200, 'aria-label': `Label for ${option.value}` } }}
                    />
                ) : (
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{option.label}</Typography>
                )}
                {option.isSystem && option.label !== option.value && (
                    <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8', mt: 0.25 }}>
                        Stored value: <span style={{ fontFamily: 'monospace' }}>{option.value}</span>
                    </Typography>
                )}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {unsaved && (
                    <Badge tone="unsaved" title="Changed in this session: click Save Changes to apply it">
                        Unsaved
                    </Badge>
                )}
                {option.isDefault && option.isActive && (
                    <Badge tone="custom" title="Pre-selected when a new record is created">
                        Default
                    </Badge>
                )}
                {option.isSystem && (
                    <Badge tone="locked" icon={<LockOutlinedIcon sx={{ fontSize: 11 }} />} title="Drives CRM business logic: can be relabelled and reordered, but not archived or renamed.">
                        Locked
                    </Badge>
                )}
                <Badge tone={option.isActive ? 'active' : 'archived'}>{option.isActive ? 'Active' : 'Archived'}</Badge>
            </Box>
            {canEdit && (
                <Tooltip
                    title={
                        !option.isActive
                            ? 'Restore the option to make it the default'
                            : option.isDefault
                              ? 'Remove as default (new records show the placeholder)'
                              : 'Set as default (pre-selected on new records)'
                    }
                    arrow
                >
                    <span>
                        <IconButton
                            size="small"
                            aria-label={option.isDefault ? `Remove ${option.label} as default` : `Set ${option.label} as default`}
                            aria-pressed={option.isDefault && option.isActive}
                            disabled={!option.isActive || busy}
                            onClick={() => void onToggleDefault(!option.isDefault)}
                        >
                            {option.isDefault && option.isActive ? (
                                <DefaultBookmarkOnIcon sx={{ fontSize: 19, color: busy ? undefined : '#f59e0b' }} />
                            ) : (
                                <DefaultBookmarkOffIcon sx={{ fontSize: 19 }} />
                            )}
                        </IconButton>
                    </span>
                </Tooltip>
            )}
            {canEdit && (
                <Tooltip title={option.isSystem ? 'Locked options cannot be archived' : option.isActive ? 'Archive (existing records keep this value)' : 'Restore'} arrow>
                    <span>
                        <LabeledSwitch
                            label={`${option.label} active`}
                            checked={option.isActive}
                            disabled={option.isSystem || busy}
                            onChange={(checked) => void onToggleActive(checked)}
                        />
                    </span>
                </Tooltip>
            )}
            {canEdit && (
                <Tooltip title={option.isSystem ? 'Locked options cannot be deleted' : 'Delete permanently (archive instead to keep it for existing records)'} arrow>
                    <span>
                        <IconButton size="small" aria-label={`Delete ${option.label}`} disabled={option.isSystem || busy} onClick={() => void onDelete()}>
                            <DeleteOutlineOutlinedIcon sx={{ fontSize: 17, color: option.isSystem || busy ? undefined : dangerColor }} />
                        </IconButton>
                    </span>
                </Tooltip>
            )}
        </Box>
    );
}

// ── New dropdown dialog ──────────────────────────────────────────────────────

function CreateCategoryDialog({
    open,
    module,
    configs,
    onClose,
    onCreated,
    notify,
}: {
    open: boolean;
    module: CrmModuleKey;
    configs: FormConfigsPayload;
    onClose: () => void;
    onCreated: (key: string) => void;
    notify: DropdownManagerPanelProps['notify'];
}) {
    const [label, setLabel] = useState('');
    const [options, setOptions] = useState('');
    const [scope, setScope] = useState<'module' | 'shared'>('module');
    const [control, setControl] = useState<{ fieldType: DropdownControlType; isRequired: boolean }>({ fieldType: 'select', isRequired: false });
    // "<Module> only": optionally placed on this module's form.
    const [placeOnForm, setPlaceOnForm] = useState(true);
    const [placement, setPlacement] = useState(() => defaultPlacement(configs, module));
    // "Shared": placed on every checked module's form (the current one pre-checked).
    const [sharedTargets, setSharedTargets] = useState<PlacementTargets>(() => ({ [module]: defaultPlacement(configs, module) }));
    const [saving, setSaving] = useState(false);
    const draft = useConfigDraftActions();

    const targets: PlacementTargets = scope === 'shared' ? sharedTargets : placeOnForm ? { [module]: placement } : {};
    const targetCount = Object.keys(targets).length;
    const targetError = placementError(configs, targets);

    const save = async () => {
        if (!label.trim() || targetError) return;
        setSaving(true);
        try {
            const created = draft.createCategory({
                label: label.trim(),
                module: scope === 'shared' ? 'shared' : module,
                options: options.split('\n').map((o) => o.trim()).filter(Boolean),
            });
            const placed = stageDropdownFields(draft, configs, { label: label.trim(), ...control, categoryKey: created.key }, targets);
            notify(
                `Dropdown '${created.label}' added${placed > 0 ? ` to ${placed} form${placed === 1 ? '' : 's'}` : ''} — click Save Changes to apply it`,
                'info',
            );
            onCreated(created.key);
        } catch (err) {
            notify(errorMessage(err), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth={scope === 'shared' ? 'md' : 'sm'} slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>New Dropdown</DialogTitle>
            <DialogContent sx={{ pt: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Dropdown name" required size="small" value={label} onChange={(e) => setLabel(e.target.value)} sx={inputSx} slotProps={{ htmlInput: { maxLength: 120 } }} autoFocus />
                <TextField
                    label="Options (one per line)"
                    size="small"
                    multiline
                    minRows={4}
                    value={options}
                    onChange={(e) => setOptions(e.target.value)}
                    sx={inputSx}
                    placeholder={'North\nSouth\nEast\nWest'}
                />
                <RadioGroup row value={scope} onChange={(e) => setScope(e.target.value as 'module' | 'shared')}>
                    <FormControlLabel value="module" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '0.84rem' }}>{moduleLabel(module)} only</Typography>} />
                    <FormControlLabel value="shared" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '0.84rem' }}>Shared across modules</Typography>} />
                </RadioGroup>

                {/* ── Add to Form(s) ── */}
                <Box sx={{ borderTop: '1px solid #e2e8f0', pt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>Add to Form(s)</Typography>
                        <Typography sx={{ fontSize: '0.76rem', color: '#64748b' }}>
                            Places a field named &lsquo;{label.trim() || 'Dropdown name'}&rsquo; that uses this dropdown.
                        </Typography>
                    </Box>
                    {scope === 'module' && (
                        <FormControlLabel
                            sx={{ m: 0 }}
                            control={<Switch size="small" checked={placeOnForm} onChange={(e) => setPlaceOnForm(e.target.checked)} />}
                            label={<Typography sx={{ fontSize: '0.84rem' }}>Place as a field on the {moduleLabel(module)} form</Typography>}
                        />
                    )}
                    {targetCount > 0 && <ControlTypePicker fieldType={control.fieldType} isRequired={control.isRequired} onChange={setControl} />}
                    {scope === 'module' && placeOnForm && <PlacementFields configs={configs} module={module} value={placement} onChange={setPlacement} />}
                    {scope === 'shared' && <ModuleTargetsPicker configs={configs} targets={sharedTargets} onChange={setSharedTargets} />}
                    {scope === 'shared' && targetCount === 0 && (
                        <Typography sx={{ fontSize: '0.76rem', color: '#64748b' }}>No form selected: the dropdown is only created (add it to forms later).</Typography>
                    )}
                    {targetError && <Typography sx={{ fontSize: '0.78rem', color: '#b91c1c' }}>{targetError}</Typography>}
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} disabled={saving} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button onClick={() => void save()} disabled={saving || !label.trim() || Boolean(targetError)} variant="contained" sx={primaryButtonSx}>
                    {targetCount > 0 ? `Add Dropdown to ${targetCount} Form${targetCount === 1 ? '' : 's'}` : 'Add Dropdown'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
