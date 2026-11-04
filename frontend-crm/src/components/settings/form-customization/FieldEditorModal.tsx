'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import { useConfigDraftActions } from './useConfigDraft';
import {
    CRM_MODULE_LABELS,
    CUSTOM_FIELD_TYPES,
    FIELD_TYPE_LABELS,
    sectionKeyFromLabel,
    tabKeyFromLabel,
    type ConfigFieldSize,
    type CrmModuleKey,
    type CustomFieldType,
    type FormConfigsPayload,
    type FormFieldDefinitionDto,
} from '@/types/formConfig.types';
import { groupSections, moduleFields } from '@/utils/formConfig';
import { Badge, errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from './builderUi';

export interface FieldEditorModalProps {
    open: boolean;
    onClose: () => void;
    module: CrmModuleKey;
    configs: FormConfigsPayload;
    /** Field to edit; omitted → create a custom field. */
    field?: FormFieldDefinitionDto;
    /** Pre-selected tab (and section) when creating. */
    defaultTabKey?: string;
    defaultSectionKey?: string;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

const NEW_SECTION = '__new__';
const NEW_TAB = '__new_tab__';
const SIZE_OPTIONS: { value: ConfigFieldSize | ''; label: string }[] = [
    { value: '', label: 'Auto' },
    { value: 'xs', label: 'XS — 140px' },
    { value: 'sm', label: 'SM — 220px' },
    { value: 'md', label: 'MD — 340px' },
    { value: 'lg', label: 'LG — 520px' },
    { value: 'full', label: 'Full row' },
];
const isChoice = (type: string) => type === 'select' || type === 'multiselect';

interface Draft {
    label: string;
    fieldType: CustomFieldType;
    /** A tab key, or NEW_TAB (created with the field, named `newTabLabel`). */
    tabKey: string;
    newTabLabel: string;
    sectionChoice: string;
    newSectionLabel: string;
    fieldSize: ConfigFieldSize | '';
    placeholder: string;
    hint: string;
    defaultValue: string;
    isRequired: boolean;
    isVisibleInForm: boolean;
    isVisibleInDrawer: boolean;
    optionsMode: 'existing' | 'new';
    dropdownCategoryKey: string;
    newOptions: string;
}

/**
 * Create a custom field (label, type, tab, section — existing or new —, size, texts, required / visibility and,
 * for select / multi-select, an existing dropdown or new options), or edit any field. Every field can be moved
 * to any tab or section; core-locked fields stay required and visible.
 * The parent mounts it per edit (with a `key`), so each opening starts from the field's saved values.
 */
export function FieldEditorModal({ open, onClose, module, configs, field, defaultTabKey, defaultSectionKey, notify }: FieldEditorModalProps) {
    const tabs = configs.moduleTabs[module] ?? [];
    const isCreate = !field;
    const locked = Boolean(field?.isCoreLocked);

    const initialDraft = (): Draft => ({
        label: field?.label ?? '',
        fieldType: (field?.fieldType as CustomFieldType) ?? 'text',
        tabKey: field?.tabKey ?? defaultTabKey ?? tabs[0]?.key ?? 'overview',
        newTabLabel: '',
        sectionChoice: field?.sectionKey ?? defaultSectionKey ?? NEW_SECTION,
        newSectionLabel: '',
        fieldSize: (field?.fieldSize as ConfigFieldSize | null) ?? '',
        placeholder: field?.placeholder ?? '',
        hint: field?.hint ?? '',
        defaultValue: field?.defaultValue ?? '',
        isRequired: field?.isRequired ?? false,
        isVisibleInForm: field?.isVisibleInForm ?? true,
        isVisibleInDrawer: field?.isVisibleInDrawer ?? true,
        optionsMode: field?.dropdownCategoryKey || !isCreate ? 'existing' : 'new',
        dropdownCategoryKey: field?.dropdownCategoryKey ?? '',
        newOptions: '',
    });

    const [draft, setDraft] = useState<Draft>(initialDraft);
    const staged = useConfigDraftActions();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

    const sections = useMemo(() => groupSections(moduleFields(configs, module), draft.tabKey), [configs, module, draft.tabKey]);
    // A pre-selected section that isn't on the chosen tab falls back to "new section".
    const sectionChoice = draft.sectionChoice === NEW_SECTION || sections.some((s) => s.sectionKey === draft.sectionChoice) ? draft.sectionChoice : NEW_SECTION;

    const categories = useMemo(
        () => [...configs.categories].sort((a, b) => (a.module === module ? 0 : 1) - (b.module === module ? 0 : 1) || a.label.localeCompare(b.label)),
        [configs.categories, module],
    );

    const fieldType = draft.fieldType;
    const choice = isChoice(fieldType);
    /** An existing dropdown field (unless core-locked) can switch between single select and multi-select chips. */
    const canSwitchChoice = !isCreate && !locked && isChoice(field!.fieldType);
    const typeOptions: readonly CustomFieldType[] = isCreate ? CUSTOM_FIELD_TYPES : canSwitchChoice ? ['select', 'multiselect'] : [fieldType as CustomFieldType];

    const validate = (): string | null => {
        if (!draft.label.trim()) return 'Label is required.';
        if (draft.tabKey === NEW_TAB && !draft.newTabLabel.trim()) return 'Enter a name for the new tab.';
        if (sectionChoice === NEW_SECTION && !draft.newSectionLabel.trim()) return 'Enter a name for the new section.';
        if (isCreate && choice) {
            if (draft.optionsMode === 'existing' && !draft.dropdownCategoryKey) return 'Choose a dropdown for the options.';
            if (draft.optionsMode === 'new' && !draft.newOptions.split('\n').some((o) => o.trim())) return 'Add at least one option.';
        }
        return null;
    };

    /** The tab to place the field on: the chosen one, or a new tab staged now (an existing tab of that name is reused). */
    const resolveTab = (): string => {
        if (draft.tabKey !== NEW_TAB) return draft.tabKey;
        const name = draft.newTabLabel.trim();
        const existing = tabs.find((t) => t.label.trim().toLowerCase() === name.toLowerCase());
        return existing ? existing.key : staged.createTab(module, name).key;
    };

    const save = async () => {
        const problem = validate();
        if (problem) {
            setError(problem);
            return;
        }
        setSaving(true);
        setError(null);
        const section = sections.find((s) => s.sectionKey === sectionChoice);
        const sectionLabel = section ? section.sectionLabel : draft.newSectionLabel.trim();
        const sectionKey = section ? section.sectionKey : sectionKeyFromLabel(sectionLabel);
        try {
            const tabKey = resolveTab();
            if (isCreate) {
                const created = staged.createField({
                    module,
                    label: draft.label.trim(),
                    fieldType: draft.fieldType,
                    tabKey,
                    sectionKey,
                    sectionLabel,
                    fieldSize: draft.fieldSize || null,
                    placeholder: draft.placeholder.trim() || undefined,
                    hint: draft.hint.trim() || undefined,
                    defaultValue: draft.defaultValue.trim() || undefined,
                    isRequired: draft.isRequired,
                    isVisibleInForm: draft.isVisibleInForm,
                    isVisibleInDrawer: draft.isVisibleInDrawer,
                    ...(choice
                        ? draft.optionsMode === 'existing'
                            ? { dropdownCategoryKey: draft.dropdownCategoryKey }
                            : { newOptions: draft.newOptions.split('\n').map((o) => o.trim()).filter(Boolean) }
                        : {}),
                });
                notify(`Field '${created.label}' added — click Save Changes to apply it`, 'info');
            } else {
                staged.updateField(field!.id, {
                    label: draft.label.trim(),
                    ...(canSwitchChoice && draft.fieldType !== field!.fieldType ? { fieldType: draft.fieldType as 'select' | 'multiselect' } : {}),
                    tabKey,
                    sectionKey,
                    ...(section ? {} : { sectionLabel }),
                    fieldSize: draft.fieldSize || null,
                    placeholder: draft.placeholder.trim() || null,
                    hint: draft.hint.trim() || null,
                    defaultValue: draft.defaultValue.trim() || null,
                    ...(locked ? {} : { isRequired: draft.isRequired, isVisibleInForm: draft.isVisibleInForm }),
                    isVisibleInDrawer: draft.isVisibleInDrawer,
                    ...(choice && draft.dropdownCategoryKey && draft.dropdownCategoryKey !== field!.dropdownCategoryKey
                        ? { dropdownCategoryKey: draft.dropdownCategoryKey }
                        : {}),
                });
                notify(`'${draft.label.trim()}' updated — click Save Changes to apply it`, 'info');
            }
            onClose();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const label = (text: string) => <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', mb: 0.6 }}>{text}</Typography>;

    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography component="span" sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                    {isCreate ? `Add Field — ${CRM_MODULE_LABELS[module]}` : `Edit Field — ${field!.label}`}
                </Typography>
                {locked && <Badge tone="locked">Locked</Badge>}
                {field && (
                    <Typography component="span" sx={{ fontSize: '0.74rem', color: '#64748b', fontFamily: 'monospace', ml: 'auto' }}>
                        {field.fieldKey}
                    </Typography>
                )}
            </DialogTitle>
            <DialogContent sx={{ pt: '20px !important' }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>
                        {error}
                    </Alert>
                )}
                {locked && (
                    <Alert severity="info" sx={{ mb: 2, borderRadius: '8px', fontSize: '0.8rem' }}>
                        This field is locked: it always stays required and visible, and cannot be archived or deleted.
                    </Alert>
                )}

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                    <Box>
                        {label('Label *')}
                        <TextField size="small" fullWidth value={draft.label} onChange={(e) => set('label', e.target.value)} sx={inputSx} slotProps={{ htmlInput: { maxLength: 120 } }} autoFocus />
                    </Box>
                    <Box>
                        {label('Control Type')}
                        <TextField
                            select
                            size="small"
                            fullWidth
                            value={fieldType}
                            disabled={!isCreate && !canSwitchChoice}
                            onChange={(e) => set('fieldType', e.target.value as CustomFieldType)}
                            sx={inputSx}
                            helperText={canSwitchChoice ? 'Existing values are kept (a multi-select keeps its first pick when made single).' : undefined}
                        >
                            {typeOptions.map((t) => (
                                <MenuItem key={t} value={t} sx={{ fontSize: '0.85rem' }}>
                                    {FIELD_TYPE_LABELS[t]}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>

                    <Box>
                        {label('Form Tab')}
                        <TextField select size="small" fullWidth value={draft.tabKey} onChange={(e) => set('tabKey', e.target.value)} sx={inputSx}>
                            {tabs.map((t) => (
                                <MenuItem key={t.key} value={t.key} sx={{ fontSize: '0.85rem' }}>
                                    {t.label}
                                </MenuItem>
                            ))}
                            {(
                                <MenuItem value={NEW_TAB} sx={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>
                                    + New tab…
                                </MenuItem>
                            )}
                        </TextField>
                        {draft.tabKey === NEW_TAB && (
                            <TextField
                                size="small"
                                fullWidth
                                autoFocus
                                value={draft.newTabLabel}
                                onChange={(e) => set('newTabLabel', e.target.value)}
                                placeholder="New tab name, e.g. Compliance & Legal"
                                sx={{ ...inputSx, mt: 1 }}
                                helperText={draft.newTabLabel.trim() ? `Tab key: ${tabKeyFromLabel(draft.newTabLabel)}` : 'The tab appears on the form once it has a field.'}
                                slotProps={{ htmlInput: { maxLength: 60, 'aria-label': 'New tab name' } }}
                            />
                        )}
                    </Box>
                    <Box>
                        {label('Section')}
                        <TextField select size="small" fullWidth value={sectionChoice} onChange={(e) => set('sectionChoice', e.target.value)} sx={inputSx}>
                            {sections.map((s) => (
                                <MenuItem key={s.sectionKey} value={s.sectionKey} sx={{ fontSize: '0.85rem' }}>
                                    {s.sectionLabel}
                                </MenuItem>
                            ))}
                            {(
                                <MenuItem value={NEW_SECTION} sx={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>
                                    + New section…
                                </MenuItem>
                            )}
                        </TextField>
                    </Box>
                    {sectionChoice === NEW_SECTION && (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                            {label('New section name *')}
                            <TextField
                                size="small"
                                fullWidth
                                value={draft.newSectionLabel}
                                onChange={(e) => set('newSectionLabel', e.target.value)}
                                placeholder="e.g. REGIONAL DETAILS"
                                sx={inputSx}
                                slotProps={{ htmlInput: { maxLength: 120 } }}
                            />
                        </Box>
                    )}

                    <Box>
                        {label('Width')}
                        <TextField select size="small" fullWidth value={draft.fieldSize} onChange={(e) => set('fieldSize', e.target.value as ConfigFieldSize | '')} sx={inputSx}>
                            {SIZE_OPTIONS.map((o) => (
                                <MenuItem key={o.value || 'auto'} value={o.value} sx={{ fontSize: '0.85rem' }}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    <Box>
                        {label('Placeholder')}
                        <TextField
                            size="small"
                            fullWidth
                            value={draft.placeholder}
                            onChange={(e) => set('placeholder', e.target.value)}
                            placeholder="Leave empty to use the form's default"
                            sx={inputSx}
                            slotProps={{ htmlInput: { maxLength: 200 } }}
                        />
                    </Box>
                    <Box>
                        {label('Hint')}
                        <TextField
                            size="small"
                            fullWidth
                            value={draft.hint}
                            onChange={(e) => set('hint', e.target.value)}
                            placeholder="Short helper text beside the label"
                            sx={inputSx}
                            slotProps={{ htmlInput: { maxLength: 200 } }}
                        />
                    </Box>
                    {(
                        <Box>
                            {label('Default Value')}
                            <TextField
                                size="small"
                                fullWidth
                                value={draft.defaultValue}
                                onChange={(e) => set('defaultValue', e.target.value)}
                                placeholder={
                                    fieldType === 'checkbox' ? 'true / false' : fieldType === 'multiselect' ? 'Comma-separated values' : fieldType === 'date' ? 'YYYY-MM-DD or "today"' : 'Pre-filled on new records'
                                }
                                sx={inputSx}
                                slotProps={{ htmlInput: { maxLength: 500 } }}
                            />
                        </Box>
                    )}
                </Box>

                {choice && (
                    <Box sx={{ mt: 2.5, p: 2, borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', mb: 1 }}>Dropdown Options</Typography>
                        {isCreate && (
                            <RadioGroup row value={draft.optionsMode} onChange={(e) => set('optionsMode', e.target.value as Draft['optionsMode'])} sx={{ mb: 1 }}>
                                <FormControlLabel value="new" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '0.82rem' }}>Create new options</Typography>} />
                                <FormControlLabel value="existing" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '0.82rem' }}>Use an existing dropdown</Typography>} />
                            </RadioGroup>
                        )}
                        {draft.optionsMode === 'existing' || !isCreate ? (
                            <TextField select size="small" fullWidth value={draft.dropdownCategoryKey} onChange={(e) => set('dropdownCategoryKey', e.target.value)} sx={inputSx} label="Dropdown">
                                {categories.map((c) => (
                                    <MenuItem key={c.key} value={c.key} sx={{ fontSize: '0.85rem' }}>
                                        {c.label}
                                        <Typography component="span" sx={{ ml: 1, fontSize: '0.72rem', color: '#94a3b8' }}>
                                            {c.module === 'shared' ? 'Shared' : CRM_MODULE_LABELS[c.module as CrmModuleKey]} • {c.options.filter((o) => o.isActive).length} options
                                        </Typography>
                                    </MenuItem>
                                ))}
                            </TextField>
                        ) : (
                            <TextField
                                size="small"
                                fullWidth
                                multiline
                                minRows={4}
                                value={draft.newOptions}
                                onChange={(e) => set('newOptions', e.target.value)}
                                placeholder={'One option per line\ne.g.\nNorth\nSouth'}
                                sx={inputSx}
                                helperText="A new dropdown is created for this field; manage it later under Dropdowns."
                            />
                        )}
                    </Box>
                )}

                <Box sx={{ mt: 2.5, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <FormControlLabel
                        control={<Switch size="small" checked={locked ? true : draft.isRequired} disabled={locked} onChange={(e) => set('isRequired', e.target.checked)} />}
                        label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#374151' }}>Required</Typography>}
                    />
                    <FormControlLabel
                        control={<Switch size="small" checked={locked ? true : draft.isVisibleInForm} disabled={locked} onChange={(e) => set('isVisibleInForm', e.target.checked)} />}
                        label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#374151' }}>Visible in Form</Typography>}
                    />
                    <FormControlLabel
                        control={<Switch size="small" checked={draft.isVisibleInDrawer} onChange={(e) => set('isVisibleInDrawer', e.target.checked)} />}
                        label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#374151' }}>Visible in Drawer</Typography>}
                    />
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} disabled={saving} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button onClick={() => void save()} disabled={saving} variant="contained" sx={primaryButtonSx}>
                    {isCreate ? 'Add Field' : 'Apply'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
