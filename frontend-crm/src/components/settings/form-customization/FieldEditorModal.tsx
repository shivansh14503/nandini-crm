'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    InputAdornment,
    MenuItem,
    Radio,
    RadioGroup,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import { useConfigDraftActions } from './useConfigDraft';
import { customFieldKeyFor, isTempId, uniqueKey } from './configDraft';
import { formConfigService } from '@/services/formConfig.service';
import {
    apiNameOf,
    API_NAME_MAX,
    apiNameOwner,
    apiNameShapeError,
    CRM_MODULE_LABELS,
    CUSTOM_FIELD_TYPES,
    type ApiNameCheck,
    FIELD_TYPE_LABELS,
    sectionKeyFromLabel,
    tabKeyFromLabel,
    type ConfigFieldSize,
    type CrmModuleKey,
    type CustomFieldType,
    type FormConfigsPayload,
    type FormFieldDefinitionDto,
} from '@/types/formConfig.types';
import { groupSections, isBuiltInCountryField, moduleFields } from '@/utils/formConfig';
import { COUNTRY_OPTIONS, getCountryByCode, type CountryMasterItem } from '@/data/addressMaster';
import { Badge, errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from './builderUi';
import { useCodedFieldDefaults } from '@/context/CodedFieldDefaultsContext';

/**
 * What to store for a field's placeholder / hint: null (= the form's own text) while it's still the form's coded
 * text, so an untouched prefill never becomes an override; '' when the admin cleared it (the form then shows
 * none); otherwise the admin's text.
 */
const storedText = (value: string, coded: string | undefined, saved: string | null | undefined, cleared: boolean): string | null => {
    const text = value.trim();
    if (text) return text === coded?.trim() ? null : text;
    // Empty: blank only if the admin emptied the box (or it was saved blank); an untouched empty box changes nothing.
    return cleared || saved === '' ? '' : (saved ?? null);
};

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
/** What the admin types after `cf_`: lowercase, spaces / dashes as underscores, a pasted `cf_` dropped. */
/** What the admin types as an API name (TEMP-DEV-RENAME: any field, any case, `cf_` optional): spaces / dashes as underscores. */
const normalizeApiNameInput = (text: string) => text.trim().replace(/[\s-]+/g, '_');

interface Draft {
    label: string;
    /** API name of a custom field (its storage key). */
    fieldKey: string;
    /** API name of a built-in field (its column name unless an admin renamed it). */
    apiName: string;
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
    // The placeholder / hint the hand-built form codes for this built-in field: prefilled when not overridden.
    const coded = useCodedFieldDefaults(field?.isSystem ? field.fieldKey : undefined);

    const initialDraft = (): Draft => ({
        label: field?.label ?? '',
        fieldKey: field && !field.isSystem ? field.fieldKey : '',
        apiName: field?.isSystem ? apiNameOf(field) : '',
        fieldType: (field?.fieldType as CustomFieldType) ?? 'text',
        tabKey: field?.tabKey ?? defaultTabKey ?? tabs[0]?.key ?? 'overview',
        newTabLabel: '',
        sectionChoice: field?.sectionKey ?? defaultSectionKey ?? NEW_SECTION,
        newSectionLabel: '',
        fieldSize: (field?.fieldSize as ConfigFieldSize | null) ?? '',
        placeholder: field?.placeholder ?? coded.placeholder ?? '',
        hint: field?.hint ?? coded.hint ?? '',
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

    const touched = useRef(new Set<keyof Draft>());
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
        touched.current.add(key);
        setDraft((d) => ({ ...d, [key]: value }));
    };

    // The form's coded texts are read in the background; fill them in if they arrive after the editor opened.
    useEffect(() => {
        setDraft((d) => {
            const next = { ...d };
            if (field?.placeholder == null && coded.placeholder && !d.placeholder && !touched.current.has('placeholder')) next.placeholder = coded.placeholder;
            if (field?.hint == null && coded.hint && !d.hint && !touched.current.has('hint')) next.hint = coded.hint;
            return next.placeholder === d.placeholder && next.hint === d.hint ? d : next;
        });
    }, [coded.placeholder, coded.hint, field?.placeholder, field?.hint]);

    /** Helper under a prefilled text box of a built-in field. */
    const codedHelper = (value: string, codedText: string | undefined) => {
        if (!field?.isSystem) return undefined;
        if (!value.trim()) return 'Empty — the form shows no text here';
        if (codedText && value.trim() === codedText.trim()) return "The form's default text — edit or clear it";
        return undefined;
    };

    const sections = useMemo(() => groupSections(moduleFields(configs, module), draft.tabKey), [configs, module, draft.tabKey]);
    // A pre-selected section that isn't on the chosen tab falls back to "new section".
    const sectionChoice = draft.sectionChoice === NEW_SECTION || sections.some((s) => s.sectionKey === draft.sectionChoice) ? draft.sectionChoice : NEW_SECTION;

    const categories = useMemo(
        () => [...configs.categories].sort((a, b) => (a.module === module ? 0 : 1) - (b.module === module ? 0 : 1) || a.label.localeCompare(b.label)),
        [configs.categories, module],
    );

    const fieldType = draft.fieldType;
    const choice = isChoice(fieldType);
    /** Built-in fields keep their type and dropdown list (they map to fixed columns and system options). */
    const builtIn = Boolean(field?.isSystem);
    /** Address Country: the fixed ISO list; only its default country is configurable. */
    const countryField = Boolean(field && isBuiltInCountryField(field));
    /** An existing custom dropdown field can switch between single select and multi-select chips. */
    const canSwitchChoice = !isCreate && !locked && !builtIn && isChoice(field!.fieldType);
    const typeOptions: readonly CustomFieldType[] = isCreate ? CUSTOM_FIELD_TYPES : canSwitchChoice ? ['select', 'multiselect'] : [fieldType as CustomFieldType];

    // API name (custom fields): on a new field it follows the label until the admin edits it.
    const [keyTouched, setKeyTouched] = useState(false);
    const generatedKey = useMemo(() => {
        if (!isCreate) return '';
        const taken = new Set((configs.fieldsByModule[module] ?? []).map((f) => f.fieldKey));
        return uniqueKey(customFieldKeyFor(draft.label.trim()), (k) => taken.has(k));
    }, [isCreate, configs, module, draft.label]);
    const requestedKey = isCreate && !keyTouched ? generatedKey : draft.fieldKey.trim();
    /** An existing custom field's API name being renamed. */
    const keyChanged = !isCreate && !builtIn && requestedKey !== field!.fieldKey;
    /** The field is stored already, so a new API name moves data (a field new in this draft has none yet). */
    const savedField = Boolean(field && !isTempId(field.id));
    const keyError = useMemo(() => {
        if (builtIn || !(isCreate ? keyTouched : keyChanged)) return null;
        const owner = apiNameOwner(configs.fieldsByModule[module] ?? [], requestedKey, field);
        return apiNameShapeError(requestedKey) ?? (owner ? `'${requestedKey}' is already the API name of '${owner.label}'.` : null);
    }, [builtIn, isCreate, keyTouched, keyChanged, requestedKey, configs, module, field]);

    // API name (built-in fields): a name of the admin's choosing; the column (fieldKey) never changes.
    const requestedApiName = draft.apiName.trim();
    const apiNameChanged = builtIn && requestedApiName !== apiNameOf(field!);
    const apiNameError = useMemo(() => {
        if (!apiNameChanged) return null;
        const shape = apiNameShapeError(requestedApiName);
        if (shape) return shape;
        const owner = apiNameOwner(configs.fieldsByModule[module] ?? [], requestedApiName, field);
        return owner ? `'${requestedApiName}' is already the API name of '${owner.label}'.` : null;
    }, [apiNameChanged, requestedApiName, configs, module, field]);

    // The API checks what the draft can't see (record properties, a deleted field's leftover data, how many
    // records a rename moves, look-alike names) as the admin types.
    const nameToCheck = builtIn
        ? apiNameChanged && !apiNameError
            ? requestedApiName
            : null
        : (isCreate ? keyTouched : keyChanged) && !keyError
          ? requestedKey
          : null;
    /** The stored field the name is checked for (a field new in this draft is checked as a new one). */
    const savedFieldId = field && !isTempId(field.id) ? field.id : undefined;
    const [nameCheck, setNameCheck] = useState<{ name: string; result: ApiNameCheck } | null>(null);
    useEffect(() => {
        if (!nameToCheck) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            formConfigService
                .checkApiName(module, savedFieldId, nameToCheck)
                // The API checks again on save, so a failed preview only leaves the admin without its warnings.
                .catch((): ApiNameCheck => ({ error: null, warnings: [] }))
                .then((result) => {
                    if (!cancelled) setNameCheck({ name: nameToCheck, result });
                });
        }, 350);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [nameToCheck, module, savedFieldId]);
    const serverCheck = nameToCheck && nameCheck?.name === nameToCheck ? nameCheck.result : null;
    const checkingName = Boolean(nameToCheck) && !serverCheck;
    const nameError = (builtIn ? apiNameError : keyError) ?? serverCheck?.error ?? null;

    const validate = (): string | null => {
        if (!draft.label.trim()) return 'Label is required.';
        if (nameError) return `API name: ${nameError}`;
        if (checkingName) return 'Still checking the API name — try again in a moment.';
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
                    ...(keyTouched ? { fieldKey: requestedKey } : {}),
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
                    ...(keyChanged ? { fieldKey: requestedKey } : {}),
                    ...(apiNameChanged ? { apiName: requestedApiName } : {}),
                    ...(canSwitchChoice && draft.fieldType !== field!.fieldType ? { fieldType: draft.fieldType as 'select' | 'multiselect' } : {}),
                    tabKey,
                    sectionKey,
                    ...(section ? {} : { sectionLabel }),
                    fieldSize: draft.fieldSize || null,
                    placeholder: storedText(draft.placeholder, coded.placeholder, field!.placeholder, touched.current.has('placeholder')),
                    hint: storedText(draft.hint, coded.hint, field!.hint, touched.current.has('hint')),
                    defaultValue: draft.defaultValue.trim() || null,
                    ...(locked ? {} : { isRequired: draft.isRequired, isVisibleInForm: draft.isVisibleInForm }),
                    isVisibleInDrawer: draft.isVisibleInDrawer,
                    ...(choice && !builtIn && draft.dropdownCategoryKey && draft.dropdownCategoryKey !== field!.dropdownCategoryKey
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

    const label = (text: string) => <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--crm-gray-700)', mb: 0.6 }}>{text}</Typography>;

    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ borderBottom: '1px solid var(--mui-palette-border-main)', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography component="span" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                    {isCreate ? `Add Field — ${CRM_MODULE_LABELS[module]}` : `Edit Field — ${field!.label}`}
                </Typography>
                {locked && <Badge tone="locked">Locked</Badge>}
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

                    <Box sx={{ gridColumn: '1 / -1' }}>
                        {label('API Name')}
                        {builtIn ? (
                            <TextField
                                size="small"
                                fullWidth
                                value={draft.apiName}
                                onChange={(e) => set('apiName', normalizeApiNameInput(e.target.value))}
                                error={Boolean(nameError)}
                                sx={inputSx}
                                helperText={
                                    nameError ??
                                    (checkingName ? (
                                        'Checking…'
                                    ) : (
                                        <>
                                            Stored in column <b style={{ fontFamily: 'monospace' }}>{field!.fieldKey}</b>, which never changes. Record
                                            writes and imports accept this name; the column name always works too.
                                        </>
                                    ))
                                }
                                slotProps={{
                                    input: {
                                        endAdornment:
                                            requestedApiName !== field!.fieldKey ? (
                                                <InputAdornment position="end">
                                                    <Button
                                                        size="small"
                                                        onClick={() => set('apiName', field!.fieldKey)}
                                                        sx={{ minWidth: 0, fontSize: '0.72rem', textTransform: 'none' }}
                                                    >
                                                        Use column name
                                                    </Button>
                                                </InputAdornment>
                                            ) : undefined,
                                    },
                                    htmlInput: { maxLength: API_NAME_MAX, 'aria-label': 'API name', spellCheck: false, style: { fontFamily: 'monospace' } },
                                }}
                            />
                        ) : (
                            <TextField
                                size="small"
                                fullWidth
                                value={requestedKey}
                                onChange={(e) => {
                                    setKeyTouched(true);
                                    set('fieldKey', normalizeApiNameInput(e.target.value));
                                }}
                                error={Boolean(nameError)}
                                sx={inputSx}
                                helperText={
                                    nameError ??
                                    (checkingName
                                        ? 'Checking…'
                                        : isCreate && !keyTouched
                                        ? 'Generated from the label. Records store this field’s values under this name.'
                                        : !savedField
                                          ? 'Not saved yet: follows the label until you edit it here.'
                                          : 'The name records, filters, imports and PDF templates use for this field.')
                                }
                                slotProps={{
                                    htmlInput: { maxLength: API_NAME_MAX, 'aria-label': 'API name', spellCheck: false, style: { fontFamily: 'monospace' } },
                                }}
                            />
                        )}
                        {keyChanged && savedField && !nameError && (
                            <Alert severity="warning" sx={{ mt: 1, borderRadius: '8px', fontSize: '0.8rem' }}>
                                Renaming <b>{field!.fieldKey}</b> to <b>{requestedKey}</b>: when you save, every record&apos;s value, saved
                                table filters and PDF templates using this field move to the new name, and the old name is forgotten.
                                <ApiNameWarnings warnings={serverCheck?.warnings} />
                            </Alert>
                        )}
                        {!keyChanged && !apiNameChanged && serverCheck && serverCheck.warnings.length > 0 && !nameError && (
                            <Alert severity="warning" sx={{ mt: 1, borderRadius: '8px', fontSize: '0.8rem' }}>
                                <ApiNameWarnings warnings={serverCheck.warnings} />
                            </Alert>
                        )}
                        {apiNameChanged && !nameError && (
                            <Alert severity={serverCheck?.warnings.length ? 'warning' : 'info'} sx={{ mt: 1, borderRadius: '8px', fontSize: '0.8rem' }}>
                                {requestedApiName === field!.fieldKey ? (
                                    <>
                                        Restoring the column name <b>{field!.fieldKey}</b> as this field&apos;s API name.
                                    </>
                                ) : (
                                    <>
                                        <b>{field!.label}</b> will be known as <b>{requestedApiName}</b> in API writes, import mapping and the form
                                        builder. No data moves: values stay in <b>{field!.fieldKey}</b>, and the app&apos;s own screens are unaffected.
                                    </>
                                )}
                                <ApiNameWarnings warnings={serverCheck?.warnings} />
                            </Alert>
                        )}
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
                                <MenuItem value={NEW_TAB} sx={{ fontSize: '0.85rem', color: 'var(--crm-text-blue-600)', fontWeight: 600 }}>
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
                                <MenuItem value={NEW_SECTION} sx={{ fontSize: '0.85rem', color: 'var(--crm-text-blue-600)', fontWeight: 600 }}>
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
                            placeholder="Text shown inside the empty input"
                            helperText={codedHelper(draft.placeholder, coded.placeholder)}
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
                            helperText={codedHelper(draft.hint, coded.hint)}
                            sx={inputSx}
                            slotProps={{ htmlInput: { maxLength: 200 } }}
                        />
                    </Box>
                    {countryField ? (
                        <Box>
                            {label('Default Country')}
                            <Autocomplete<CountryMasterItem>
                                size="small"
                                options={COUNTRY_OPTIONS as CountryMasterItem[]}
                                value={getCountryByCode(draft.defaultValue) ?? null}
                                onChange={(_, c) => set('defaultValue', c?.iso2Code ?? '')}
                                getOptionLabel={(c) => c.countryName}
                                getOptionKey={(c) => c.iso2Code}
                                isOptionEqualToValue={(a, b) => a.iso2Code === b.iso2Code}
                                renderInput={(params) => (
                                    <TextField {...params} placeholder="No default (form's own)" sx={inputSx} helperText="Pre-selected on new records" />
                                )}
                            />
                        </Box>
                    ) : (
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

                {countryField && (
                    <Alert severity="info" sx={{ mt: 2.5, borderRadius: '8px', fontSize: '0.8rem' }}>
                        Countries come from the fixed ISO country list, so options can&apos;t be added or removed here. Pick the
                        default country above.
                    </Alert>
                )}

                {choice && !countryField && (
                    <Box sx={{ mt: 2.5, p: 2, borderRadius: '10px', border: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--mui-palette-text-primary)', mb: 1 }}>Dropdown Options</Typography>
                        {isCreate && (
                            <RadioGroup row value={draft.optionsMode} onChange={(e) => set('optionsMode', e.target.value as Draft['optionsMode'])} sx={{ mb: 1 }}>
                                <FormControlLabel value="new" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '0.82rem' }}>Create new options</Typography>} />
                                <FormControlLabel value="existing" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '0.82rem' }}>Use an existing dropdown</Typography>} />
                            </RadioGroup>
                        )}
                        {draft.optionsMode === 'existing' || !isCreate ? (
                            <TextField
                                select
                                size="small"
                                fullWidth
                                value={draft.dropdownCategoryKey}
                                onChange={(e) => set('dropdownCategoryKey', e.target.value)}
                                disabled={builtIn}
                                helperText={builtIn ? "Built-in fields keep their dropdown. Edit its options under Dropdowns." : undefined}
                                sx={inputSx}
                                label="Dropdown"
                            >
                                {categories.map((c) => (
                                    <MenuItem key={c.key} value={c.key} sx={{ fontSize: '0.85rem' }}>
                                        {c.label}
                                        <Typography component="span" sx={{ ml: 1, fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
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
                        label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-gray-700)' }}>Required</Typography>}
                    />
                    <FormControlLabel
                        control={<Switch size="small" checked={locked ? true : draft.isVisibleInForm} disabled={locked} onChange={(e) => set('isVisibleInForm', e.target.checked)} />}
                        label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-gray-700)' }}>Visible in Form</Typography>}
                    />
                    <FormControlLabel
                        control={<Switch size="small" checked={draft.isVisibleInDrawer} onChange={(e) => set('isVisibleInDrawer', e.target.checked)} />}
                        label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-gray-700)' }}>Visible in Drawer</Typography>}
                    />
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--mui-palette-border-main)' }}>
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

/** The API's notes on a requested API name, as a list under the rename notice. */
function ApiNameWarnings({ warnings }: { warnings?: string[] }) {
    if (!warnings || warnings.length === 0) return null;
    return (
        <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25 }}>
            {warnings.map((w) => (
                <li key={w}>{w}</li>
            ))}
        </Box>
    );
}
