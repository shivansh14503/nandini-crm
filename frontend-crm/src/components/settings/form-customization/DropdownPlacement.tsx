'use client';

import React, { useMemo, useState } from 'react';
import {
    Box,
    Button,
    Checkbox,
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
    Tooltip,
    Typography,
} from '@mui/material';
import {
    CRM_MODULE_KEYS,
    CRM_MODULE_LABELS,
    sectionKeyFromLabel,
    type CrmModuleKey,
    type DropdownCategoryDto,
    type FormConfigsPayload,
} from '@/types/formConfig.types';
import { groupSections, moduleFields } from '@/utils/formConfig';
import type { ConfigDraftActions } from './useConfigDraft';
import { useConfigDraftActions } from './useConfigDraft';
import { Badge, errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from './builderUi';

/** Where a dropdown field goes on one module's form. */
export interface Placement {
    tabKey: string;
    /** An existing section key, DEFAULT_SECTION ("Custom Fields", created if missing) or NEW_SECTION. */
    sectionChoice: string;
    newSectionLabel: string;
}

export type DropdownControlType = 'select' | 'multiselect';
export type PlacementTargets = Partial<Record<CrmModuleKey, Placement>>;

const DEFAULT_SECTION_LABEL = 'CUSTOM FIELDS';
const DEFAULT_SECTION_KEY = sectionKeyFromLabel(DEFAULT_SECTION_LABEL);
const DEFAULT_SECTION = '__custom__';
const NEW_SECTION = '__new__';

const sectionsOf = (configs: FormConfigsPayload, module: CrmModuleKey, tabKey: string) => groupSections(moduleFields(configs, module), tabKey);

/** First tab, in the existing "Custom Fields" section if the tab has one (else that section is created). */
export function defaultPlacement(configs: FormConfigsPayload, module: CrmModuleKey, tabKey?: string): Placement {
    const tab = tabKey ?? configs.moduleTabs[module]?.[0]?.key ?? 'overview';
    const hasCustom = sectionsOf(configs, module, tab).some((s) => s.sectionKey === DEFAULT_SECTION_KEY);
    return { tabKey: tab, sectionChoice: hasCustom ? DEFAULT_SECTION_KEY : DEFAULT_SECTION, newSectionLabel: '' };
}

/** The tab / section a placement resolves to, or an error message. */
export function resolvePlacement(
    configs: FormConfigsPayload,
    module: CrmModuleKey,
    p: Placement,
): { tabKey: string; sectionKey: string; sectionLabel: string } | string {
    if (p.sectionChoice === DEFAULT_SECTION) return { tabKey: p.tabKey, sectionKey: DEFAULT_SECTION_KEY, sectionLabel: DEFAULT_SECTION_LABEL };
    if (p.sectionChoice === NEW_SECTION) {
        const label = p.newSectionLabel.trim();
        if (!label) return `Enter a name for the new section on the ${CRM_MODULE_LABELS[module]} form.`;
        return { tabKey: p.tabKey, sectionKey: sectionKeyFromLabel(label) || DEFAULT_SECTION_KEY, sectionLabel: label };
    }
    const section = sectionsOf(configs, module, p.tabKey).find((s) => s.sectionKey === p.sectionChoice);
    if (!section) return `Pick a section on the ${CRM_MODULE_LABELS[module]} form.`;
    return { tabKey: p.tabKey, sectionKey: section.sectionKey, sectionLabel: section.sectionLabel };
}

/**
 * Stages one custom field per target module, all using the dropdown `categoryKey`. Every placement is checked
 * before anything is staged, so an invalid row doesn't leave half the fields added.
 */
export function stageDropdownFields(
    draft: ConfigDraftActions,
    configs: FormConfigsPayload,
    field: { label: string; fieldType: DropdownControlType; isRequired: boolean; categoryKey: string },
    targets: PlacementTargets,
): number {
    const resolved = (Object.entries(targets) as [CrmModuleKey, Placement][]).map(([module, p]) => {
        const r = resolvePlacement(configs, module, p);
        if (typeof r === 'string') throw new Error(r);
        return { module, ...r };
    });
    for (const target of resolved) {
        draft.createField({
            module: target.module,
            label: field.label,
            fieldType: field.fieldType,
            tabKey: target.tabKey,
            sectionKey: target.sectionKey,
            sectionLabel: target.sectionLabel,
            isRequired: field.isRequired,
            dropdownCategoryKey: field.categoryKey,
        });
    }
    return resolved.length;
}

/** Validation message for a set of targets (undefined when valid). */
export function placementError(configs: FormConfigsPayload, targets: PlacementTargets): string | undefined {
    for (const [module, p] of Object.entries(targets) as [CrmModuleKey, Placement][]) {
        const r = resolvePlacement(configs, module, p);
        if (typeof r === 'string') return r;
    }
    return undefined;
}

const smallLabel = (text: string) => <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', mb: 0.4 }}>{text}</Typography>;

// ── Controls ─────────────────────────────────────────────────────────────────

/** Tab + section pickers for one module (section: existing, "Custom Fields" or a new one). */
export function PlacementFields({
    configs,
    module,
    value,
    onChange,
    compact,
}: {
    configs: FormConfigsPayload;
    module: CrmModuleKey;
    value: Placement;
    onChange: (next: Placement) => void;
    compact?: boolean;
}) {
    const tabs = configs.moduleTabs[module] ?? [];
    const sections = useMemo(() => sectionsOf(configs, module, value.tabKey), [configs, module, value.tabKey]);
    const hasCustom = sections.some((s) => s.sectionKey === DEFAULT_SECTION_KEY);

    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: compact ? '1fr 1.4fr' : '1fr 1fr' }, gap: 1.25 }}>
            <Box>
                {!compact && smallLabel('Form tab')}
                <TextField
                    select
                    size="small"
                    fullWidth
                    value={value.tabKey}
                    onChange={(e) => onChange(defaultPlacement(configs, module, e.target.value))}
                    sx={inputSx}
                    slotProps={{ htmlInput: { 'aria-label': `${CRM_MODULE_LABELS[module]} form tab` } }}
                >
                    {tabs.map((t) => (
                        <MenuItem key={t.key} value={t.key} sx={{ fontSize: '0.85rem' }}>
                            {t.label}
                        </MenuItem>
                    ))}
                </TextField>
            </Box>
            <Box>
                {!compact && smallLabel('Section')}
                <TextField
                    select
                    size="small"
                    fullWidth
                    value={value.sectionChoice}
                    onChange={(e) => onChange({ ...value, sectionChoice: e.target.value })}
                    sx={inputSx}
                    slotProps={{ htmlInput: { 'aria-label': `${CRM_MODULE_LABELS[module]} form section` } }}
                >
                    {sections.map((s) => (
                        <MenuItem key={s.sectionKey} value={s.sectionKey} sx={{ fontSize: '0.85rem' }}>
                            {s.sectionLabel}
                        </MenuItem>
                    ))}
                    {!hasCustom && (
                        <MenuItem value={DEFAULT_SECTION} sx={{ fontSize: '0.85rem' }}>
                            {DEFAULT_SECTION_LABEL} (new)
                        </MenuItem>
                    )}
                    <MenuItem value={NEW_SECTION} sx={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>
                        + New section…
                    </MenuItem>
                </TextField>
            </Box>
            {value.sectionChoice === NEW_SECTION && (
                <TextField
                    size="small"
                    fullWidth
                    placeholder="New section name"
                    value={value.newSectionLabel}
                    onChange={(e) => onChange({ ...value, newSectionLabel: e.target.value })}
                    sx={{ ...inputSx, gridColumn: '1 / -1' }}
                    slotProps={{ htmlInput: { maxLength: 120, 'aria-label': `New section on the ${CRM_MODULE_LABELS[module]} form` } }}
                />
            )}
        </Box>
    );
}

/** Single select vs multi-select chips, plus Required. */
export function ControlTypePicker({
    fieldType,
    isRequired,
    onChange,
}: {
    fieldType: DropdownControlType;
    isRequired: boolean;
    onChange: (next: { fieldType: DropdownControlType; isRequired: boolean }) => void;
}) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <RadioGroup row value={fieldType} onChange={(e) => onChange({ fieldType: e.target.value as DropdownControlType, isRequired })}>
                <FormControlLabel value="select" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '0.84rem' }}>Single Select Dropdown</Typography>} />
                <FormControlLabel value="multiselect" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '0.84rem' }}>Multi-Select Chips</Typography>} />
            </RadioGroup>
            <FormControlLabel
                sx={{ m: 0 }}
                control={<Switch size="small" checked={isRequired} onChange={(e) => onChange({ fieldType, isRequired: e.target.checked })} />}
                label={<Typography sx={{ fontSize: '0.84rem' }}>Required</Typography>}
            />
        </Box>
    );
}

/** One checkbox per CRM module; each checked module gets its own tab / section row. */
export function ModuleTargetsPicker({
    configs,
    targets,
    onChange,
    linkedModules,
}: {
    configs: FormConfigsPayload;
    targets: PlacementTargets;
    onChange: (next: PlacementTargets) => void;
    /** Modules that already have a field using the dropdown. */
    linkedModules?: Set<string>;
}) {
    const toggle = (module: CrmModuleKey, checked: boolean) => {
        const next = { ...targets };
        if (checked) next[module] = defaultPlacement(configs, module);
        else delete next[module];
        onChange(next);
    };

    return (
        <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            {CRM_MODULE_KEYS.map((module, i) => {
                const placement = targets[module];
                const linked = linkedModules?.has(module) ?? false;
                return (
                    <Box key={module} sx={{ px: 1.5, py: 0.75, borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', backgroundColor: placement ? '#f8fafc' : '#fff' }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '190px minmax(0, 1fr)' }, alignItems: 'center', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Tooltip title={linked ? 'This form already has a field using this dropdown' : ''} arrow>
                                    <span>
                                        <FormControlLabel
                                            sx={{ m: 0 }}
                                            control={<Checkbox size="small" checked={Boolean(placement)} disabled={linked} onChange={(e) => toggle(module, e.target.checked)} />}
                                            label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: linked ? '#94a3b8' : '#1e293b' }}>{CRM_MODULE_LABELS[module]}</Typography>}
                                        />
                                    </span>
                                </Tooltip>
                                {linked && <Badge tone="active">Linked</Badge>}
                            </Box>
                            {placement && (
                                <PlacementFields compact configs={configs} module={module} value={placement} onChange={(p) => onChange({ ...targets, [module]: p })} />
                            )}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}

// ── "Add to Form…" dialog ────────────────────────────────────────────────────

/** Stages a field using an existing dropdown on one or more module forms. */
export function PlaceDropdownInFormsDialog({
    category,
    configs,
    module,
    onClose,
    notify,
}: {
    category: DropdownCategoryDto;
    configs: FormConfigsPayload;
    /** Module being edited: pre-checked unless it already uses the dropdown. */
    module: CrmModuleKey;
    onClose: () => void;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}) {
    const draft = useConfigDraftActions();
    const linkedModules = useMemo(() => new Set(category.usedBy.map((u) => u.module)), [category]);
    const [label, setLabel] = useState(category.label);
    const [control, setControl] = useState<{ fieldType: DropdownControlType; isRequired: boolean }>({ fieldType: 'select', isRequired: false });
    const [targets, setTargets] = useState<PlacementTargets>(() => (linkedModules.has(module) ? {} : { [module]: defaultPlacement(configs, module) }));

    const count = Object.keys(targets).length;
    const error = !label.trim() ? 'Enter a field label.' : count === 0 ? undefined : placementError(configs, targets);

    const save = () => {
        try {
            const added = stageDropdownFields(draft, configs, { label: label.trim(), ...control, categoryKey: category.key }, targets);
            notify(`'${label.trim()}' added to ${added} form${added === 1 ? '' : 's'} — click Save Changes to apply it`, 'info');
            onClose();
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>Add &lsquo;{category.label}&rsquo; to Forms</DialogTitle>
            <DialogContent sx={{ pt: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Field label" required size="small" value={label} onChange={(e) => setLabel(e.target.value)} sx={inputSx} slotProps={{ htmlInput: { maxLength: 120 } }} />
                <ControlTypePicker fieldType={control.fieldType} isRequired={control.isRequired} onChange={setControl} />
                <Box>
                    {smallLabel('Forms')}
                    <ModuleTargetsPicker configs={configs} targets={targets} onChange={setTargets} linkedModules={linkedModules} />
                </Box>
                {error && count > 0 && <Typography sx={{ fontSize: '0.78rem', color: '#b91c1c' }}>{error}</Typography>}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button onClick={save} disabled={count === 0 || Boolean(error)} variant="contained" sx={primaryButtonSx}>
                    Add to {count || ''} Form{count === 1 ? '' : 's'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
