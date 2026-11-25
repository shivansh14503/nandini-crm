'use client';

import React, { useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
    Box,
    Button,
    ButtonBase,
    Checkbox,
    Drawer,
    IconButton,
    ListSubheader,
    MenuItem,
    Popover,
    Switch,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ColorizeOutlinedIcon from '@mui/icons-material/ColorizeOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { SCORECARD_MODULES } from '@/components/common/scorecard/scorecardModules';
import {
    SCORECARD_PALETTE,
    scorecardChipSx,
    scorecardCurrencyFields,
    scorecardDropdownFields,
    suggestColor,
} from '@/components/common/scorecard/scorecardUtils';
import { ROUTES } from '@/config/constants';
import { CRM_MODULE_LABELS, type CrmModuleKey, type FormConfigsPayload } from '@/types/formConfig.types';
import { DragHandle, inputSx, panelHeaderSx, surfaceSx } from '../form-customization/builderUi';
import { useDragReorder } from '../form-customization/useDragReorder';
import { draftOptionsFor, type DraftOption, type ScorecardDraft } from './scorecardDraft';

/**
 * Admin › List Scorecards: the editor of one module's cards. "Cards" picks the dropdown the cards count by, the
 * "All" card's wording, and each option's card (order, shown or hidden, color); "Totals & colors" picks what each
 * card totals and where else the colors show. Every change goes into the draft; nothing is saved here.
 */

const fieldLabelSx = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.5 } as const;
const helperSx = { fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)', mt: 0.5 } as const;

/** Outlined icon button (Move up / Move down); 32 px tap target on touch screens. */
const iconButtonSx = {
    width: { xs: 32, md: 28 },
    height: { xs: 32, md: 28 },
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

/** Small text action in a panel toolbar (Show all, Hide all, Suggest colors). */
const toolbarButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.75rem',
    minHeight: 32,
    px: 1,
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

export interface ScorecardEditorProps {
    module: CrmModuleKey;
    configs: FormConfigsPayload | null;
    draft: ScorecardDraft;
    /** What is saved (switching back to its field brings back its order and colors). */
    base: ScorecardDraft;
    /** A change to the cards' settings (makes them the admin's own cards). */
    edit: (patch: Partial<ScorecardDraft>) => void;
    disabled: boolean;
    /** The module has saved settings (otherwise the color switches apply only once saved). */
    saved: boolean;
}

/** The two editor panels, side by side from tablets up. */
export function ScorecardEditor(props: ScorecardEditorProps) {
    return (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.25fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
            <CardsPanel {...props} />
            <TotalsPanel {...props} />
        </Box>
    );
}

function PanelHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
    return (
        <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="h2" sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>
                    {title}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>{description}</Typography>
            </Box>
            {action}
        </Box>
    );
}

function CardsPanel({ module, configs, draft, base, edit, disabled }: ScorecardEditorProps) {
    const info = SCORECARD_MODULES[module];
    const dropdownFields = useMemo(() => scorecardDropdownFields(configs, module), [configs, module]);
    const [colorTarget, setColorTarget] = useState<{ el: HTMLElement; value: string } | null>(null);

    const options = draft.options;
    const shownCount = options.filter((o) => !o.hidden).length;
    const rows = useMemo(() => options.map((o) => ({ ...o, id: o.value })), [options]);

    const setOptions = (next: DraftOption[]) => edit({ options: next });
    const updateOption = (value: string, patch: Partial<DraftOption>) => setOptions(options.map((o) => (o.value === value ? { ...o, ...patch } : o)));
    const move = (index: number, by: -1 | 1) => {
        const target = index + by;
        if (target < 0 || target >= options.length) return;
        const next = [...options];
        [next[index], next[target]] = [next[target], next[index]];
        setOptions(next);
    };

    // `rows`, not the hook's `orderedItems`: a drop updates the draft in the same render, and `orderedItems` would
    // bring a dropped order back if Discard returns the cards to the order they had before that drop.
    const { getRowDragProps, getRowDragSx } = useDragReorder({
        items: rows,
        canDrag: !disabled && rows.length > 1,
        onReorder: (ids) => {
            const byValue = new Map(options.map((o) => [o.value, o]));
            setOptions(ids.map((id) => byValue.get(id)).filter((o): o is DraftOption => Boolean(o)));
        },
    });

    const changeField = (fieldKey: string) =>
        edit({
            fieldKey,
            // Back on the saved field: its saved order and colors. Another field: its dropdown order, keeping the
            // color of any value both fields share.
            options: fieldKey === base.fieldKey ? base.options : draftOptionsFor(configs, module, fieldKey, options, 'dropdown'),
        });

    const picking = colorTarget ? options.find((o) => o.value === colorTarget.value) : undefined;
    const fieldMissing = Boolean(draft.fieldKey) && !dropdownFields.some((f) => f.fieldKey === draft.fieldKey);

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
            <PanelHeader title="Cards" description="One card per option of a dropdown field, after the “All” card." />
            <Box sx={{ p: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="label" htmlFor="scorecard-field" sx={fieldLabelSx}>
                        Count records by <Box component="span" sx={{ color: 'var(--mui-palette-error-main)' }}>*</Box>
                    </Typography>
                    <TextField
                        id="scorecard-field"
                        select
                        fullWidth
                        size="small"
                        value={fieldMissing ? '' : draft.fieldKey}
                        onChange={(e) => changeField(e.target.value)}
                        disabled={disabled || dropdownFields.length === 0}
                        error={fieldMissing}
                        sx={inputSx}
                        slotProps={{ select: { displayEmpty: true } }}
                    >
                        {dropdownFields.length === 0 && (
                            <MenuItem value="" disabled sx={{ fontSize: '0.85rem' }}>
                                No dropdown fields
                            </MenuItem>
                        )}
                        {dropdownFields.map((f) => (
                            <MenuItem key={f.fieldKey} value={f.fieldKey} sx={{ fontSize: '0.85rem' }}>
                                {f.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Typography sx={helperSx}>
                        {dropdownFields.length === 0 ? (
                            <>The {CRM_MODULE_LABELS[module]} form has no dropdown fields yet. </>
                        ) : fieldMissing ? (
                            <>The saved field is no longer on the form. Pick another. </>
                        ) : null}
                        <Box
                            component={NextLink}
                            href={ROUTES.FORM_CUSTOMIZATION}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.25,
                                color: 'var(--crm-text-blue-700)',
                                fontWeight: 600,
                                textDecoration: 'none',
                                '&:hover': { color: 'var(--crm-text-blue-600)', textDecoration: 'underline' },
                            }}
                        >
                            Manage fields and options
                            <OpenInNewRoundedIcon sx={{ fontSize: 12 }} />
                        </Box>
                    </Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="label" htmlFor="scorecard-all-label" sx={fieldLabelSx}>
                        “All” card label
                    </Typography>
                    <TextField
                        id="scorecard-all-label"
                        fullWidth
                        size="small"
                        value={draft.allLabel}
                        placeholder={info.allLabel}
                        onChange={(e) => edit({ allLabel: e.target.value })}
                        disabled={disabled}
                        sx={inputSx}
                        slotProps={{ htmlInput: { maxLength: 60 } }}
                    />
                    <Typography sx={helperSx}>Leave empty for “{info.allLabel}”.</Typography>
                </Box>
            </Box>

            <Box
                sx={{
                    px: 2,
                    py: 0.75,
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 0.5,
                    borderTop: '1px solid var(--mui-palette-border-light)',
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                }}
            >
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--crm-slate-700)', mr: 'auto' }}>
                    {shownCount} of {options.length} options shown as cards
                </Typography>
                <Button
                    size="small"
                    startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 15 }} />}
                    onClick={() => setOptions(options.map((o) => ({ ...o, hidden: false })))}
                    disabled={disabled || shownCount === options.length}
                    sx={toolbarButtonSx}
                >
                    Show all
                </Button>
                <Button
                    size="small"
                    startIcon={<VisibilityOffOutlinedIcon sx={{ fontSize: 15 }} />}
                    onClick={() => setOptions(options.map((o) => ({ ...o, hidden: true })))}
                    disabled={disabled || shownCount === 0}
                    sx={toolbarButtonSx}
                >
                    Hide all
                </Button>
                <Tooltip title="Give every card a color from the palette" arrow>
                    <span>
                        <Button
                            size="small"
                            startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 15 }} />}
                            onClick={() => setOptions(options.map((o, i) => ({ ...o, color: suggestColor(o.label, i) })))}
                            disabled={disabled || options.length === 0}
                            sx={toolbarButtonSx}
                        >
                            Suggest colors
                        </Button>
                    </span>
                </Tooltip>
            </Box>

            <Box sx={{ maxHeight: { md: 460 }, overflowY: { md: 'auto' }, py: 0.5 }} role="list" aria-label="Cards in order">
                {options.length === 0 ? (
                    <Typography sx={{ p: 2, fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {draft.fieldKey ? 'This dropdown has no options yet.' : 'Pick a field to set up its cards.'}
                    </Typography>
                ) : (
                    rows.map((option, index) => (
                        <Box
                            key={option.value}
                            role="listitem"
                            {...getRowDragProps(option)}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: { xs: 0.5, sm: 0.75 },
                                pl: { xs: 0.75, sm: 1.25 },
                                pr: { xs: 1, sm: 1.5 },
                                py: 0.25,
                                minHeight: 44,
                                backgroundColor: 'var(--mui-palette-background-paper)',
                                '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
                                ...getRowDragSx(option),
                            }}
                        >
                            <DragHandle disabled={disabled || options.length < 2} title="Drag to reorder" />
                            <Tooltip title={option.hidden ? 'Show a card for this option' : 'Hide its card'} arrow>
                                <Checkbox
                                    size="small"
                                    checked={!option.hidden}
                                    onChange={(e) => updateOption(option.value, { hidden: !e.target.checked })}
                                    disabled={disabled}
                                    slotProps={{ input: { 'aria-label': `Show a card for ${option.label}` } }}
                                />
                            </Tooltip>
                            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75, opacity: option.hidden ? 0.55 : 1 }}>
                                <Box component="span" sx={[scorecardChipSx(option.color) as object, { maxWidth: '100%', minWidth: 0 }]}>
                                    <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: option.color, flexShrink: 0 }} />
                                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {option.label}
                                    </Box>
                                </Box>
                                {option.removed && (
                                    <Tooltip title="Archived in the dropdown. Records that still have it keep this color." arrow>
                                        <Typography component="span" sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)', flexShrink: 0 }}>
                                            archived
                                        </Typography>
                                    </Tooltip>
                                )}
                            </Box>
                            <Tooltip title="Move up" arrow>
                                <span>
                                    <IconButton
                                        size="small"
                                        aria-label={`Move ${option.label} up`}
                                        disabled={disabled || index === 0}
                                        onClick={() => move(index, -1)}
                                        sx={iconButtonSx}
                                    >
                                        <ArrowUpwardRoundedIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title="Move down" arrow>
                                <span>
                                    <IconButton
                                        size="small"
                                        aria-label={`Move ${option.label} down`}
                                        disabled={disabled || index === options.length - 1}
                                        onClick={() => move(index, 1)}
                                        sx={iconButtonSx}
                                    >
                                        <ArrowDownwardRoundedIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title="Change color" arrow>
                                <ButtonBase
                                    onClick={(e) => setColorTarget({ el: e.currentTarget, value: option.value })}
                                    disabled={disabled}
                                    aria-label={`Color for ${option.label}`}
                                    sx={{
                                        ml: { xs: 0.25, sm: 0.5 },
                                        width: { xs: 40, md: 46 },
                                        height: { xs: 32, md: 28 },
                                        flexShrink: 0,
                                        borderRadius: '8px',
                                        p: '3px',
                                        border: '1px solid var(--mui-palette-border-strong)',
                                        backgroundColor: 'var(--mui-palette-background-paper)',
                                        transition: 'all 0.15s ease',
                                        '&:hover': { borderColor: 'var(--crm-blue-300)', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.15)' },
                                        '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                    }}
                                >
                                    <Box sx={{ width: '100%', height: '100%', borderRadius: '5px', backgroundColor: option.color }} />
                                </ButtonBase>
                            </Tooltip>
                        </Box>
                    ))
                )}
            </Box>
            {options.length > 0 && shownCount === 0 && (
                <Typography sx={{ px: 2, pb: 1.5, fontSize: '0.75rem', color: 'var(--crm-amber-700)' }}>
                    Every option is hidden, so the list shows only the “All” card.
                </Typography>
            )}

            <ColorPicker
                anchor={colorTarget?.el ?? null}
                option={picking}
                onClose={() => setColorTarget(null)}
                onPick={(color, close) => {
                    if (!picking) return;
                    updateOption(picking.value, { color });
                    if (close) setColorTarget(null);
                }}
            />
        </Box>
    );
}

/**
 * The palette and a custom color for one option: a popover beside the swatch, or a bottom sheet on phones (bigger
 * swatches to tap).
 */
function ColorPicker({
    anchor,
    option,
    onClose,
    onPick,
}: {
    anchor: HTMLElement | null;
    option: DraftOption | undefined;
    onClose: () => void;
    /** `close`: a palette pick closes the picker; the custom color input keeps it open while dragging. */
    onPick: (color: string, close: boolean) => void;
}) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const open = Boolean(anchor && option);

    const content = option && (
        <>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', mb: 1 }}>{option.label}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: phone ? 1 : 0.75 }}>
                {SCORECARD_PALETTE.map((c) => {
                    const selected = c.hex.toLowerCase() === option.color.toLowerCase();
                    return (
                        <Tooltip key={c.hex} title={c.name}>
                            <ButtonBase
                                aria-label={c.name}
                                aria-pressed={selected}
                                onClick={() => onPick(c.hex, true)}
                                sx={{
                                    width: phone ? '100%' : 22,
                                    height: phone ? 34 : 22,
                                    borderRadius: '6px',
                                    backgroundColor: c.hex,
                                    outline: selected ? '2px solid var(--crm-slate-900)' : 'none',
                                    outlineOffset: 2,
                                    transition: 'transform 0.12s ease',
                                    '&:hover': { transform: 'scale(1.12)' },
                                    '&.Mui-focusVisible': { outline: '2px solid var(--crm-text-blue-600)' },
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
                    minHeight: 32,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    fontSize: '0.78rem',
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
                    value={option.color}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPick(e.target.value.toUpperCase(), false)}
                    sx={{ ml: 'auto', width: 40, height: 28, p: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                />
            </Box>
        </>
    );

    if (phone) {
        return (
            <Drawer
                anchor="bottom"
                open={open}
                onClose={onClose}
                slotProps={{
                    paper: {
                        sx: {
                            p: 2,
                            pb: 3,
                            borderTopLeftRadius: '16px',
                            borderTopRightRadius: '16px',
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            backgroundImage: 'none',
                        },
                    },
                }}
            >
                <Box sx={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'var(--mui-palette-border-strong)', mx: 'auto', mb: 1.5 }} />
                {content}
            </Drawer>
        );
    }
    return (
        <Popover
            open={open}
            anchorEl={anchor}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
                paper: {
                    sx: {
                        mt: 0.75,
                        p: 1.5,
                        width: 240,
                        borderRadius: '10px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        backgroundImage: 'none',
                    },
                },
            }}
        >
            {content}
        </Popover>
    );
}

function TotalsPanel({ module, configs, draft, edit, disabled, saved }: ScorecardEditorProps) {
    const builtInAmounts = SCORECARD_MODULES[module].amounts;
    // A form field a built-in total already reads (Contracts' Contract Value) is offered once, as that total.
    const currencyFields = useMemo(() => {
        const covered = new Set(builtInAmounts?.map((a) => a.fieldKey).filter(Boolean));
        return scorecardCurrencyFields(configs, module).filter((f) => !covered.has(f.fieldKey));
    }, [configs, module, builtInAmounts]);
    const [defaultAmount, ...otherAmounts] = builtInAmounts ?? [];
    const offered =
        !draft.currencyFieldKey ||
        otherAmounts.some((a) => a.key === draft.currencyFieldKey) ||
        currencyFields.some((f) => f.fieldKey === draft.currencyFieldKey);

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
            <PanelHeader title="Totals & colors" description="What each card adds up, and where else the colors show." />
            <Box sx={{ p: 2, display: 'grid', gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="label" htmlFor="scorecard-currency" sx={fieldLabelSx}>
                        Total on each card
                    </Typography>
                    <TextField
                        id="scorecard-currency"
                        select
                        fullWidth
                        size="small"
                        value={draft.currencyFieldKey}
                        onChange={(e) => edit({ currencyFieldKey: e.target.value })}
                        disabled={disabled || (currencyFields.length === 0 && otherAmounts.length === 0 && !draft.currencyFieldKey)}
                        error={!offered}
                        sx={inputSx}
                        slotProps={{ select: { displayEmpty: true, MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } } } }}
                    >
                        <MenuItem value="" sx={{ fontSize: '0.85rem' }}>
                            {defaultAmount ? (
                                <>
                                    {defaultAmount.label}
                                    <Typography component="span" sx={{ ml: 0.75, color: 'var(--mui-palette-text-muted)', fontSize: 'inherit' }}>
                                        (default)
                                    </Typography>
                                </>
                            ) : (
                                <Typography component="span" sx={{ color: 'var(--mui-palette-text-muted)', fontSize: 'inherit' }}>
                                    None (counts only)
                                </Typography>
                            )}
                        </MenuItem>
                        {otherAmounts.map((a) => (
                            <MenuItem key={a.key} value={a.key} sx={{ fontSize: '0.85rem' }}>
                                {a.label}
                            </MenuItem>
                        ))}
                        {otherAmounts.length > 0 && currencyFields.length > 0 && (
                            <ListSubheader
                                sx={{
                                    lineHeight: '32px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: 'var(--mui-palette-text-secondary)',
                                    backgroundColor: 'var(--mui-palette-background-paper)',
                                }}
                            >
                                Form fields
                            </ListSubheader>
                        )}
                        {currencyFields.map((f) => (
                            <MenuItem key={f.fieldKey} value={f.fieldKey} sx={{ fontSize: '0.85rem' }}>
                                {f.label}
                            </MenuItem>
                        ))}
                        {/* A saved pick that is no longer offered still shows (and can be changed). */}
                        {!offered && (
                            <MenuItem value={draft.currencyFieldKey} sx={{ display: 'none' }}>
                                {draft.currencyFieldKey} (no longer on the form)
                            </MenuItem>
                        )}
                    </TextField>
                    <Typography sx={helperSx}>
                        {!offered
                            ? 'This field is no longer on the form. Pick another total.'
                            : defaultAmount
                              ? 'Each card shows the total of this value for its records.'
                              : currencyFields.length === 0
                                ? 'Add an Amount field to this form to total it on the cards.'
                                : 'Each card also shows the total of this field.'}
                    </Typography>
                </Box>

                <ColorToggle
                    label="Color the list column"
                    description="The field's column in the list shows each value in its card color."
                    checked={draft.listViewColor}
                    disabled={disabled}
                    onChange={(checked) => edit({ listViewColor: checked })}
                />
                <ColorToggle
                    label="Color the record drawer"
                    description="The record's side drawer shows the value in its card color."
                    checked={draft.drawerViewColor}
                    disabled={disabled}
                    onChange={(checked) => edit({ drawerViewColor: checked })}
                />
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                    {saved
                        ? 'These two keep working when the cards are switched off.'
                        : 'Nothing is saved for this list yet: these apply once you save. They keep working when the cards are switched off.'}
                </Typography>
            </Box>
        </Box>
    );
}

function ColorToggle({
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
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.75,
                py: 1.25,
                borderRadius: '10px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-paper)',
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
