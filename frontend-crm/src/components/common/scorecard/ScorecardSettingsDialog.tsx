'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    ButtonBase,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    MenuItem,
    Popover,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ColorizeOutlinedIcon from '@mui/icons-material/ColorizeOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useResetScorecard, useSaveScorecard, useScorecard } from '@/hooks/queries/useScorecards';
import { CRM_MODULE_LABELS, type CrmModuleKey, type FormConfigsPayload } from '@/types/formConfig.types';
import type { ScorecardConfig, ScorecardOption } from '@/types/scorecard.types';
import { findCategory } from '@/utils/formConfig';
import {
    SCORECARD_PALETTE,
    scorecardChipSx,
    scorecardCurrencyFields,
    scorecardDropdownFields,
    suggestColor,
} from './scorecardUtils';

interface DraftOption extends ScorecardOption {
    label: string;
    removed: boolean;
}

interface Draft {
    fieldKey: string;
    currencyFieldKey: string;
    options: DraftOption[];
    listViewColor: boolean;
    drawerViewColor: boolean;
}

/** The field's options in admin order (removed ones only when the saved scorecard still colors them). */
function optionsFor(
    configs: FormConfigsPayload | null,
    module: CrmModuleKey,
    fieldKey: string,
    saved: readonly ScorecardOption[]
): DraftOption[] {
    const field = scorecardDropdownFields(configs, module).find((f) => f.fieldKey === fieldKey);
    const category = findCategory(configs, field?.dropdownCategoryKey);
    const savedByValue = new Map(saved.map((o) => [o.value, o]));
    return (category?.options ?? [])
        .filter((o) => o.isActive || savedByValue.has(o.value))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o, index) => {
            const prev = savedByValue.get(o.value);
            return {
                value: o.value,
                label: o.label || o.value,
                color: prev?.color ?? suggestColor(o.label || o.value, index),
                hidden: prev?.hidden ?? false,
                removed: !o.isActive,
            };
        });
}

/** Saved scorecard, or a starting point: the module's status / stage dropdown with suggested colors. */
function initialDraft(configs: FormConfigsPayload | null, module: CrmModuleKey, config: ScorecardConfig | null): Draft {
    const fields = scorecardDropdownFields(configs, module);
    const savedField = config && fields.some((f) => f.fieldKey === config.fieldKey) ? config.fieldKey : '';
    const fieldKey = savedField || (fields.find((f) => /status|stage/i.test(f.fieldKey)) ?? fields[0])?.fieldKey || '';
    const saved = savedField ? config?.options ?? [] : [];
    return {
        fieldKey,
        currencyFieldKey: (savedField && config?.currencyFieldKey) || '',
        options: fieldKey ? optionsFor(configs, module, fieldKey, saved) : [],
        listViewColor: config?.listViewColor ?? true,
        drawerViewColor: config?.drawerViewColor ?? true,
    };
}

const sectionLabelSx = { fontSize: '0.78rem', fontWeight: 700, color: 'var(--crm-slate-700)', mb: 0.75 } as const;
const panelSx = {
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '10px',
    backgroundColor: 'var(--mui-palette-background-paper)',
} as const;

export interface ScorecardSettingsDialogProps {
    open: boolean;
    module: CrmModuleKey;
    onClose: () => void;
    /** After a save or reset, e.g. to show a toast. */
    onSaved?: (message: string) => void;
}

/**
 * Admin settings of a list screen's scorecard: the dropdown field the cards count by, an optional currency field
 * each card totals, a color per option (and which options get a card), and whether the colors also mark the field
 * in the list column and record view. Mounted only while open, so it always starts from the saved settings.
 */
export function ScorecardSettingsDialog(props: ScorecardSettingsDialogProps) {
    return (
        <Dialog
            open={props.open}
            onClose={props.onClose}
            maxWidth="md"
            fullWidth
            slotProps={{
                paper: {
                    sx: {
                        borderRadius: '14px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        backgroundImage: 'none',
                    },
                },
            }}
        >
            {props.open && <ScorecardSettingsBody {...props} />}
        </Dialog>
    );
}

function ScorecardSettingsBody({ module, onClose, onSaved }: ScorecardSettingsDialogProps) {
    const configs = useFormConfigs();
    const config = useScorecard(module);
    const saveMutation = useSaveScorecard(module);
    const resetMutation = useResetScorecard(module);
    const [draft, setDraft] = useState<Draft>(() => initialDraft(configs, module, config));
    const [error, setError] = useState<string | null>(null);
    const [colorAnchor, setColorAnchor] = useState<{ el: HTMLElement; value: string } | null>(null);

    const dropdownFields = useMemo(() => scorecardDropdownFields(configs, module), [configs, module]);
    const currencyFields = useMemo(() => scorecardCurrencyFields(configs, module), [configs, module]);
    const busy = saveMutation.isPending || resetMutation.isPending;
    const shownCount = draft.options.filter((o) => !o.hidden).length;

    const changeField = (fieldKey: string) => {
        setDraft((prev) => ({
            ...prev,
            fieldKey,
            // Same value under a different field keeps its color.
            options: optionsFor(configs, module, fieldKey, prev.options),
        }));
    };

    const updateOption = (value: string, patch: Partial<DraftOption>) =>
        setDraft((prev) => ({ ...prev, options: prev.options.map((o) => (o.value === value ? { ...o, ...patch } : o)) }));

    const handleSave = async () => {
        setError(null);
        if (!draft.fieldKey) {
            setError('Select a dropdown field.');
            return;
        }
        try {
            await saveMutation.mutateAsync({
                fieldKey: draft.fieldKey,
                currencyFieldKey: draft.currencyFieldKey || null,
                options: draft.options.map(({ value, color, hidden }) => ({ value, color, ...(hidden ? { hidden } : {}) })),
                listViewColor: draft.listViewColor,
                drawerViewColor: draft.drawerViewColor,
            });
            onSaved?.('Scorecard saved.');
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the scorecard.');
        }
    };

    const handleReset = async () => {
        if (!confirm('Reset this scorecard? The list goes back to its default cards and the saved colors are removed.')) return;
        setError(null);
        try {
            await resetMutation.mutateAsync();
            onSaved?.('Scorecard reset to default.');
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not reset the scorecard.');
        }
    };

    const pickingOption = colorAnchor ? draft.options.find((o) => o.value === colorAnchor.value) : undefined;

    return (
        <>
            <DialogTitle
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 1.75,
                    px: 2.5,
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--crm-slate-900)', letterSpacing: '0.02em' }}>
                        Scorecard
                    </Typography>
                    <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)' }}>
                        Summary cards above the {CRM_MODULE_LABELS[module]} list
                    </Typography>
                </Box>
                <IconButton
                    onClick={onClose}
                    size="small"
                    aria-label="Close"
                    sx={{
                        color: 'var(--mui-palette-text-secondary)',
                        '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
                    }}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ px: 2.5, pt: '20px !important', pb: 1 }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
                    {/* ── Left: field + colors ── */}
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={sectionLabelSx}>
                            Select Dropdown Field <Box component="span" sx={{ color: 'var(--mui-palette-error-main)' }}>*</Box>
                        </Typography>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            value={draft.fieldKey}
                            onChange={(e) => changeField(e.target.value)}
                            disabled={busy || dropdownFields.length === 0}
                            helperText={dropdownFields.length === 0 ? 'This module has no dropdown fields.' : 'One card per option of this field.'}
                        >
                            {dropdownFields.map((f) => (
                                <MenuItem key={f.fieldKey} value={f.fieldKey}>
                                    {f.label}
                                </MenuItem>
                            ))}
                        </TextField>

                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mt: 2.25 }}>
                            <Typography sx={sectionLabelSx}>Set Colors</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                                {shownCount} of {draft.options.length} shown as cards
                            </Typography>
                        </Box>
                        <Box sx={{ ...panelSx, maxHeight: 320, overflowY: 'auto', py: 0.5 }}>
                            {draft.options.length === 0 ? (
                                <Typography sx={{ p: 2, fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                                    {draft.fieldKey ? 'This dropdown has no options yet.' : 'Select a field to set its colors.'}
                                </Typography>
                            ) : (
                                draft.options.map((option) => (
                                    <Box
                                        key={option.value}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            px: 1,
                                            py: 0.5,
                                            '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
                                        }}
                                    >
                                        <Tooltip title={option.hidden ? 'Show a card for this option' : 'Hide its card'}>
                                            <Checkbox
                                                size="small"
                                                checked={!option.hidden}
                                                onChange={(e) => updateOption(option.value, { hidden: !e.target.checked })}
                                                disabled={busy}
                                                slotProps={{ input: { 'aria-label': `Show a card for ${option.label}` } }}
                                            />
                                        </Tooltip>
                                        <Box sx={{ flex: 1, minWidth: 0, opacity: option.hidden ? 0.55 : 1 }}>
                                            <Box component="span" sx={scorecardChipSx(option.color)}>
                                                <Box
                                                    component="span"
                                                    sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: option.color, flexShrink: 0 }}
                                                />
                                                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {option.label}
                                                </Box>
                                            </Box>
                                            {option.removed && (
                                                <Typography component="span" sx={{ ml: 1, fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)' }}>
                                                    removed
                                                </Typography>
                                            )}
                                        </Box>
                                        <Tooltip title="Change color">
                                            <ButtonBase
                                                onClick={(e) => setColorAnchor({ el: e.currentTarget, value: option.value })}
                                                disabled={busy}
                                                aria-label={`Color for ${option.label}`}
                                                sx={{
                                                    width: 46,
                                                    height: 26,
                                                    borderRadius: '7px',
                                                    p: '3px',
                                                    border: '1px solid var(--mui-palette-border-strong)',
                                                    backgroundColor: 'var(--mui-palette-background-paper)',
                                                    transition: 'all 0.15s ease',
                                                    '&:hover': { borderColor: 'var(--crm-blue-300)', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.15)' },
                                                }}
                                            >
                                                <Box sx={{ width: '100%', height: '100%', borderRadius: '4px', backgroundColor: option.color }} />
                                            </ButtonBase>
                                        </Tooltip>
                                    </Box>
                                ))
                            )}
                        </Box>
                    </Box>

                    {/* ── Right: currency + options ── */}
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={sectionLabelSx}>Select Currency Field (Optional)</Typography>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            value={draft.currencyFieldKey}
                            onChange={(e) => setDraft((prev) => ({ ...prev, currencyFieldKey: e.target.value }))}
                            disabled={busy || currencyFields.length === 0}
                            helperText={
                                currencyFields.length === 0
                                    ? 'Add an Amount field to this module’s form to total it on the cards.'
                                    : 'Each card also shows the total of this field.'
                            }
                            slotProps={{ select: { displayEmpty: true } }}
                        >
                            <MenuItem value="">
                                <Typography component="span" sx={{ color: 'var(--mui-palette-text-muted)', fontSize: 'inherit' }}>
                                    None (counts only)
                                </Typography>
                            </MenuItem>
                            {currencyFields.map((f) => (
                                <MenuItem key={f.fieldKey} value={f.fieldKey}>
                                    {f.label}
                                </MenuItem>
                            ))}
                        </TextField>

                        <Typography sx={{ ...sectionLabelSx, mt: 2.25 }}>Options</Typography>
                        <Box sx={{ display: 'grid', gap: 1.25 }}>
                            <OptionToggle
                                label="Enable List View Column Color"
                                description="The field's column in the list shows each value in its color."
                                checked={draft.listViewColor}
                                disabled={busy}
                                onChange={(checked) => setDraft((prev) => ({ ...prev, listViewColor: checked }))}
                            />
                            <OptionToggle
                                label="Enable Drawer View Column Color"
                                description="The record's drawer shows the value in its color."
                                checked={draft.drawerViewColor}
                                disabled={busy}
                                onChange={(checked) => setDraft((prev) => ({ ...prev, drawerViewColor: checked }))}
                            />
                        </Box>
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 2.5, py: 2, gap: 1 }}>
                {config && (
                    <Button
                        onClick={handleReset}
                        disabled={busy}
                        startIcon={<RestartAltIcon />}
                        sx={{
                            mr: 'auto',
                            textTransform: 'none',
                            fontWeight: 600,
                            color: 'var(--mui-palette-text-secondary)',
                            '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
                        }}
                    >
                        Reset to default
                    </Button>
                )}
                <Button
                    onClick={onClose}
                    disabled={busy}
                    variant="outlined"
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: '8px',
                        color: 'var(--crm-slate-700)',
                        borderColor: 'var(--mui-palette-border-strong)',
                        '&:hover': {
                            borderColor: 'var(--crm-blue-300)',
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            color: 'var(--crm-text-blue-700)',
                        },
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={busy || !draft.fieldKey}
                    variant="contained"
                    startIcon={saveMutation.isPending ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: '8px',
                        px: 3,
                        boxShadow: 'none',
                        color: '#ffffff',
                        background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
                            boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
                        },
                    }}
                >
                    Save
                </Button>
            </DialogActions>

            <Popover
                open={Boolean(colorAnchor && pickingOption)}
                anchorEl={colorAnchor?.el}
                onClose={() => setColorAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                    paper: {
                        sx: { mt: 0.75, p: 1.5, borderRadius: '10px', border: '1px solid var(--mui-palette-border-main)', width: 236 },
                    },
                }}
            >
                {pickingOption && (
                    <>
                        <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', mb: 1 }}>
                            {pickingOption.label}
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 0.75 }}>
                            {SCORECARD_PALETTE.map((c) => {
                                const selected = c.hex.toLowerCase() === pickingOption.color.toLowerCase();
                                return (
                                    <Tooltip key={c.hex} title={c.name}>
                                        <ButtonBase
                                            aria-label={c.name}
                                            onClick={() => {
                                                updateOption(pickingOption.value, { color: c.hex });
                                                setColorAnchor(null);
                                            }}
                                            sx={{
                                                width: 22,
                                                height: 22,
                                                borderRadius: '6px',
                                                backgroundColor: c.hex,
                                                outline: selected ? '2px solid var(--crm-slate-900)' : 'none',
                                                outlineOffset: 2,
                                                transition: 'transform 0.12s ease',
                                                '&:hover': { transform: 'scale(1.15)' },
                                            }}
                                        />
                                    </Tooltip>
                                );
                            })}
                        </Box>
                        <Box
                            component="label"
                            sx={{
                                mt: 1.5,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                cursor: 'pointer',
                                fontSize: '0.76rem',
                                fontWeight: 600,
                                color: 'var(--crm-slate-700)',
                                '&:hover': { color: 'var(--crm-text-blue-700)' },
                            }}
                        >
                            <ColorizeOutlinedIcon sx={{ fontSize: 16 }} />
                            Custom color
                            <Box
                                component="input"
                                type="color"
                                value={pickingOption.color}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    updateOption(pickingOption.value, { color: e.target.value.toUpperCase() })
                                }
                                sx={{ ml: 'auto', width: 34, height: 24, p: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                            />
                        </Box>
                    </>
                )}
            </Popover>
        </>
    );
}

function OptionToggle({
    label,
    description,
    checked,
    disabled,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <Box
            component="label"
            sx={{
                ...panelSx,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.75,
                py: 1.25,
                cursor: disabled ? 'default' : 'pointer',
                transition: 'border-color 0.15s ease, background-color 0.15s ease',
                ...(checked && { borderColor: 'var(--mui-palette-primary-softBorder)', backgroundColor: 'var(--mui-palette-primary-soft)' }),
            }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{label}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>{description}</Typography>
            </Box>
            <Switch checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        </Box>
    );
}
