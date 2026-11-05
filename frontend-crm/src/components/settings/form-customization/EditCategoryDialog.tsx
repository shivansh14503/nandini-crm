'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Radio,
    RadioGroup,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    CRM_MODULE_LABELS,
    type CrmModuleKey,
    type DropdownCategoryDto,
    type FormConfigsPayload,
    type FormFieldDefinitionDto,
    type UpdateCategoryPayload,
    type UpdateFieldPayload,
} from '@/types/formConfig.types';
import { useConfigDraftActions } from './useConfigDraft';
import { allFields } from './configDraft';
import {
    ControlTypePicker,
    ModuleGroupList,
    PlacementFields,
    defaultPlacement,
    placementError,
    stageDropdownFields,
    type DropdownControlType,
    type PlacementTargets,
} from './DropdownPlacement';
import { Badge, dangerColor, errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from './builderUi';

const isChoiceType = (t: string): t is DropdownControlType => t === 'select' || t === 'multiselect';
const smallLabel = (text: string) => <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', mb: 0.4 }}>{text}</Typography>;

/**
 * Edits an existing dropdown in one go: name, scope (one module / shared), the control type and
 * Required flag of the fields using it, and which forms use it (check to add a field, uncheck to delete
 * that form's field). Everything is staged in the draft and saved with "Save Changes".
 */
export function EditCategoryDialog({
    category,
    configs,
    module,
    onClose,
    notify,
}: {
    category: DropdownCategoryDto;
    configs: FormConfigsPayload;
    /** Module being edited (the "<Module> only" scope for a shared dropdown). */
    module: CrmModuleKey;
    onClose: () => void;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}) {
    const draft = useConfigDraftActions();

    const linked = useMemo(() => allFields(configs).filter((f) => f.dropdownCategoryKey === category.key), [configs, category.key]);
    const linkedByModule = useMemo(() => {
        const map = new Map<CrmModuleKey, FormFieldDefinitionDto[]>();
        for (const f of linked) map.set(f.module, [...(map.get(f.module) ?? []), f]);
        return map;
    }, [linked]);
    // Fields that may follow the dropdown's edits (control type, Required, removal): every field but core-locked ones.
    const customLinked = linked.filter((f) => !f.isCoreLocked);
    const initialType: DropdownControlType = [...customLinked, ...linked].map((f) => f.fieldType).find(isChoiceType) ?? 'select';
    const initialRequired = customLinked[0]?.isRequired ?? false;
    const mixedTypes = new Set(customLinked.map((f) => f.fieldType)).size > 1;
    const homeModule: CrmModuleKey = category.module !== 'shared' ? category.module : module;

    const [label, setLabel] = useState(category.label);
    const [scope, setScope] = useState<'module' | 'shared'>(category.module === 'shared' ? 'shared' : 'module');
    const [control, setControl] = useState({ fieldType: initialType, isRequired: initialRequired });
    const [touched, setTouched] = useState({ fieldType: false, isRequired: false });
    const [kept, setKept] = useState<Set<CrmModuleKey>>(() => new Set(linkedByModule.keys()));
    const [newTargets, setNewTargets] = useState<PlacementTargets>({});

    const effective = [...kept, ...(Object.keys(newTargets) as CrmModuleKey[])];
    const forcedShared = effective.length > 1;
    const scopeValue = forcedShared ? 'shared' : scope;
    const onlyModule = effective.length === 1 ? effective[0] : homeModule;
    // Every dropdown can change scope (e.g. made Global to place it on other forms).
    const nextModule: DropdownCategoryDto['module'] = scopeValue === 'shared' ? 'shared' : onlyModule;
    const removedModules = [...linkedByModule.keys()].filter((m) => !kept.has(m));
    const removesAll = !category.isSystem && linked.length > 0 && effective.length === 0;

    const error = !label.trim() ? 'Enter a dropdown name.' : placementError(configs, newTargets);

    const apply = () => {
        const name = label.trim();
        try {
            // 1. The dropdown itself.
            const payload: UpdateCategoryPayload = {};
            if (name !== category.label) payload.label = name;
            if (nextModule !== category.module) payload.module = nextModule;
            if (Object.keys(payload).length > 0) draft.updateCategory(category.key, payload);

            // 2. New forms (before any removal, so the dropdown is never left unused in between).
            const added = stageDropdownFields(draft, configs, { label: name, ...control, categoryKey: category.key }, newTargets);

            // 3. Fields that stay. A renamed dropdown renames every field using it — built-in ones too, whose label
            //    rarely equals the dropdown's ("Designation" vs "Lead Designation"). Core-locked fields can't be
            //    removed, so they always stay, and only their label follows; control type / Required stay as built.
            for (const field of linked.filter((f) => f.isCoreLocked || kept.has(f.module))) {
                const update: UpdateFieldPayload = {};
                if (!field.isCoreLocked) {
                    if (touched.fieldType && field.fieldType !== control.fieldType) update.fieldType = control.fieldType;
                    if (touched.isRequired && field.isRequired !== control.isRequired) update.isRequired = control.isRequired;
                }
                if (name !== category.label && field.label !== name) update.label = name;
                if (Object.keys(update).length > 0) draft.updateField(field.id, update);
            }

            // 4. Forms unchecked: their fields go.
            for (const m of removedModules) for (const field of linkedByModule.get(m) ?? []) if (!field.isCoreLocked) draft.deleteField(field.id);

            const changes = [added > 0 && `added to ${added} form${added === 1 ? '' : 's'}`, removedModules.length > 0 && `removed from ${removedModules.length}`]
                .filter(Boolean)
                .join(', ');
            notify(`Dropdown '${name}' updated${changes ? ` (${changes})` : ''} — click Save Changes to apply it`, 'info');
            onClose();
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };

    const toggleNew = (m: CrmModuleKey, checked: boolean) => {
        const next = { ...newTargets };
        if (checked) next[m] = defaultPlacement(configs, m);
        else delete next[m];
        setNewTargets(next);
    };
    const toggleKept = (m: CrmModuleKey, checked: boolean) => {
        const next = new Set(kept);
        if (checked) next.add(m);
        else next.delete(m);
        setKept(next);
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
                Edit Dropdown
            </DialogTitle>
            <DialogContent sx={{ pt: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Dropdown name" required size="small" value={label} onChange={(e) => setLabel(e.target.value)} sx={inputSx} slotProps={{ htmlInput: { maxLength: 120 } }} />

                <Box>
                    {smallLabel('Scope')}
                    <Tooltip
                        title={forcedShared ? 'Used on more than one form, so it is shared' : ''}
                        arrow
                        placement="top-start"
                    >
                        <RadioGroup row value={scopeValue} onChange={(e) => setScope(e.target.value as 'module' | 'shared')}>
                            <FormControlLabel
                                value="module"
                                disabled={forcedShared}
                                control={<Radio size="small" />}
                                label={<Typography sx={{ fontSize: '0.84rem' }}>{CRM_MODULE_LABELS[onlyModule]} only</Typography>}
                            />
                            <FormControlLabel
                                value="shared"
                                control={<Radio size="small" />}
                                label={<Typography sx={{ fontSize: '0.84rem' }}>Shared across modules (Global)</Typography>}
                            />
                        </RadioGroup>
                    </Tooltip>
                </Box>

                <Box>
                    {smallLabel('Control type & Required (fields using this dropdown, and new ones)')}
                    <ControlTypePicker
                        fieldType={control.fieldType}
                        isRequired={control.isRequired}
                        onChange={(next) => {
                            setTouched((t) => ({
                                fieldType: t.fieldType || next.fieldType !== control.fieldType,
                                isRequired: t.isRequired || next.isRequired !== control.isRequired,
                            }));
                            setControl(next);
                        }}
                    />
                    {mixedTypes && !touched.fieldType && (
                        <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }}>
                            The fields using it mix single and multi-select; pick a type to apply it to all of them.
                        </Typography>
                    )}
                </Box>

                <Box>
                    {smallLabel('Use in forms')}
                    <ModuleGroupList
                        renderRow={(m, moduleName) => {
                            const fields = linkedByModule.get(m);
                            const builtIn = fields?.some((f) => f.isCoreLocked) ?? false;
                            const placement = newTargets[m];
                            const checked = fields ? kept.has(m) : Boolean(placement);
                            const removing = Boolean(fields) && !checked;
                            return (
                                <Box sx={{ px: 1.5, py: 0.75, backgroundColor: removing ? '#fef2f2' : checked ? '#f8fafc' : '#fff' }}>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '190px minmax(0, 1fr)' }, alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Tooltip title={builtIn ? 'A locked field on this form always uses this dropdown' : ''} arrow>
                                                <span>
                                                    <FormControlLabel
                                                        sx={{ m: 0 }}
                                                        control={
                                                            <Checkbox
                                                                size="small"
                                                                checked={checked}
                                                                disabled={builtIn}
                                                                onChange={(e) => (fields ? toggleKept(m, e.target.checked) : toggleNew(m, e.target.checked))}
                                                            />
                                                        }
                                                        label={<Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>{moduleName}</Typography>}
                                                    />
                                                </span>
                                            </Tooltip>
                                            {fields && <Badge tone={builtIn ? 'locked' : 'active'}>{builtIn ? 'Locked' : 'Linked'}</Badge>}
                                        </Box>
                                        {fields && (
                                            <Typography sx={{ fontSize: '0.78rem', color: removing ? dangerColor : '#64748b' }}>
                                                {removing ? 'Will be deleted: ' : 'Field: '}
                                                {fields.map((f) => `${f.label}${f.isActive ? '' : ' (archived)'}`).join(', ')}
                                            </Typography>
                                        )}
                                        {!fields && placement && (
                                            <PlacementFields compact configs={configs} module={m} value={placement} onChange={(p) => setNewTargets({ ...newTargets, [m]: p })} />
                                        )}
                                    </Box>
                                </Box>
                            );
                        }}
                    />
                </Box>

                {removesAll && (
                    <Alert severity="warning" sx={{ borderRadius: '8px', fontSize: '0.8rem' }}>
                        No form will use this dropdown any more, so it is deleted together with its last field when you save.
                    </Alert>
                )}
                {error && <Typography sx={{ fontSize: '0.78rem', color: '#b91c1c' }}>{error}</Typography>}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button onClick={apply} disabled={Boolean(error)} variant="contained" sx={primaryButtonSx}>
                    Apply
                </Button>
            </DialogActions>
        </Dialog>
    );
}
