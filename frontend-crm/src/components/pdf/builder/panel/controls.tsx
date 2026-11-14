'use client';

import React, { useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    FormControl,
    IconButton,
    InputAdornment,
    MenuItem,
    Select,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import type { Box as BoxSpacing, Style } from '@/lib/pdf-document';

/** Compact controls for the Styling panel. All are controlled; `disabled` mirrors read-only templates. */

export const labelSx = { fontSize: '0.74rem', fontWeight: 600, color: 'var(--crm-slate-600)' } as const;
const smallInputSx = {
    '& .MuiOutlinedInput-root': { borderRadius: '7px', fontSize: '0.8rem', backgroundColor: 'var(--mui-palette-background-paper)' },
    '& .MuiOutlinedInput-input': { py: '6px', px: '8px' },
    '& .MuiInputAdornment-root p': { fontSize: '0.72rem' },
} as const;

export function PanelSection({ title, children, defaultExpanded = false }: { title: string; children: React.ReactNode; defaultExpanded?: boolean }) {
    return (
        <Accordion
            defaultExpanded={defaultExpanded}
            disableGutters
            elevation={0}
            square
            slotProps={{ transition: { unmountOnExit: true } }}
            sx={{ borderBottom: '1px solid var(--mui-palette-border-main)', '&::before': { display: 'none' }, backgroundColor: 'transparent' }}
        >
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2, minHeight: 46, '& .MuiAccordionSummary-content': { my: 1 } }}>
                <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--mui-palette-text-primary)' }}>{title}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>{children}</AccordionDetails>
        </Accordion>
    );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography component="label" sx={labelSx}>
                {label}
            </Typography>
            {children}
            {hint && <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)' }}>{hint}</Typography>}
        </Box>
    );
}

/** Text input that commits on every keystroke but keeps its own state while focused. */
export function TextInput({ value, onChange, disabled, placeholder, multiline, ariaLabel, maxLength }: { value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string; multiline?: boolean; ariaLabel: string; maxLength?: number }) {
    return (
        <TextField
            size="small"
            fullWidth
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            multiline={multiline}
            minRows={multiline ? 2 : undefined}
            onChange={(e) => onChange(e.target.value)}
            slotProps={{ htmlInput: { 'aria-label': ariaLabel, maxLength } }}
            sx={smallInputSx}
        />
    );
}

/** Number input: empty → `undefined` when `optional`; values are clamped on blur. */
export function NumberInput({
    value,
    onChange,
    min,
    max,
    step = 1,
    unit,
    disabled,
    ariaLabel,
    optional,
    width,
}: {
    value: number | undefined;
    onChange: (v: number | undefined) => void;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
    ariaLabel: string;
    optional?: boolean;
    width?: number | string;
}) {
    const shownValue = value === undefined ? '' : String(value);
    // Local text while typing; re-synced when the value changes from outside (undo, another control).
    const [draft, setDraft] = useState({ for: shownValue, text: shownValue });
    if (draft.for !== shownValue) setDraft({ for: shownValue, text: shownValue });
    const text = draft.text;
    const setText = (next: string) => setDraft((d) => ({ ...d, text: next }));
    const commit = (raw: string, clamp: boolean) => {
        if (raw.trim() === '') {
            if (optional) onChange(undefined);
            return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (clamp) onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
        else if (n >= min && n <= max) onChange(Math.round(n * 100) / 100);
    };
    return (
        <TextField
            size="small"
            type="number"
            value={text}
            disabled={disabled}
            placeholder={optional ? 'auto' : undefined}
            onChange={(e) => {
                setText(e.target.value);
                commit(e.target.value, false);
            }}
            onBlur={() => {
                commit(text, true);
                setText(shownValue);
            }}
            slotProps={{
                htmlInput: { 'aria-label': ariaLabel, min, max, step },
                input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
            }}
            sx={{ ...smallInputSx, width: width ?? '100%' }}
        />
    );
}

export function SelectInput<T extends string | number>({ value, onChange, options, disabled, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean; ariaLabel: string }) {
    return (
        <FormControl size="small" fullWidth disabled={disabled}>
            <Select
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
                inputProps={{ 'aria-label': ariaLabel }}
                sx={{ borderRadius: '7px', fontSize: '0.8rem', backgroundColor: 'var(--mui-palette-background-paper)', '& .MuiSelect-select': { py: '6px', px: '8px' } }}
            >
                {options.map((o) => (
                    <MenuItem key={String(o.value)} value={o.value} sx={{ fontSize: '0.82rem' }}>
                        {o.label}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}

export function SwitchRow({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', fontWeight: 600 }}>{label}</Typography>
                {hint && <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)' }}>{hint}</Typography>}
            </Box>
            <Switch size="small" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} slotProps={{ input: { 'aria-label': label } }} />
        </Box>
    );
}

export function Segmented<T extends string>({ value, onChange, options, disabled, ariaLabel }: { value: T | undefined; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; title?: string }[]; disabled?: boolean; ariaLabel: string }) {
    return (
        <ToggleButtonGroup
            exclusive
            size="small"
            value={value ?? null}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={(_e, next: T | null) => next && onChange(next)}
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: '0.74rem', py: 0.4, px: 1, flex: 1 }, width: '100%' }}
        >
            {options.map((o) => (
                <ToggleButton key={o.value} value={o.value} aria-label={o.title ?? String(o.value)}>
                    {o.title ? (
                        <Tooltip title={o.title} arrow>
                            <Box component="span" sx={{ display: 'flex' }}>
                                {o.label}
                            </Box>
                        </Tooltip>
                    ) : (
                        o.label
                    )}
                </ToggleButton>
            ))}
        </ToggleButtonGroup>
    );
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Hex colour with a native picker; optional "Accent" token and "None". */
export function ColorInput({ value, onChange, accent, allowAccent = true, allowNone = true, disabled, ariaLabel }: { value: string | undefined; onChange: (v: string | undefined) => void; accent: string; allowAccent?: boolean; allowNone?: boolean; disabled?: boolean; ariaLabel: string }) {
    const shown = value === 'accent' ? accent : value && value !== 'transparent' ? value : '';
    const external = value === 'accent' ? 'accent' : (value ?? '');
    const [draft, setDraft] = useState({ for: external, text: external });
    if (draft.for !== external) setDraft({ for: external, text: external });
    const text = draft.text;
    const setText = (next: string) => setDraft((d) => ({ ...d, text: next }));
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
                component="label"
                sx={{ position: 'relative', width: 30, height: 30, flexShrink: 0, borderRadius: '7px', border: '1px solid var(--mui-palette-border-strong)', cursor: disabled ? 'default' : 'pointer', overflow: 'hidden', background: shown || 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 0 0 / 10px 10px' }}
            >
                <input
                    type="color"
                    aria-label={ariaLabel}
                    disabled={disabled}
                    value={HEX.test(shown) && shown.length === 7 ? shown : '#000000'}
                    onChange={(e) => onChange(e.target.value)}
                    style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'inherit' }}
                />
            </Box>
            <TextField
                size="small"
                value={text}
                disabled={disabled}
                placeholder={allowNone ? 'none' : '#000000'}
                onChange={(e) => {
                    const v = e.target.value.trim();
                    setText(v);
                    if (HEX.test(v)) onChange(v);
                    else if (v === 'accent' && allowAccent) onChange('accent');
                    else if (v === '' && allowNone) onChange(undefined);
                }}
                slotProps={{ htmlInput: { 'aria-label': `${ariaLabel} (hex)` } }}
                sx={{ ...smallInputSx, flex: 1 }}
            />
            {allowAccent && (
                <Tooltip title="Use the theme accent colour" arrow>
                    <Box
                        component="button"
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange('accent')}
                        sx={{ px: 0.75, height: 30, borderRadius: '7px', border: `1px solid ${value === 'accent' ? 'var(--mui-palette-primary-main)' : 'var(--mui-palette-border-strong)'}`, backgroundColor: value === 'accent' ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--crm-slate-700)', cursor: 'pointer' }}
                    >
                        Accent
                    </Box>
                </Tooltip>
            )}
        </Box>
    );
}

/** Four-side spacing editor (mm) with a link toggle for equal sides. */
export function SpacingInput({ value, onChange, disabled, ariaLabel, max = 50 }: { value: BoxSpacing | undefined; onChange: (v: BoxSpacing | undefined) => void; disabled?: boolean; ariaLabel: string; max?: number }) {
    const v = value ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const [linked, setLinked] = useState(v.top === v.right && v.right === v.bottom && v.bottom === v.left);
    const set = (side: keyof BoxSpacing, n: number | undefined) => {
        const num = n ?? 0;
        const next = linked ? { top: num, right: num, bottom: num, left: num } : { ...v, [side]: num };
        onChange(next.top || next.right || next.bottom || next.left ? next : undefined);
    };
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, flex: 1 }}>
                {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                    <Box key={side}>
                        <Typography sx={{ fontSize: '0.64rem', color: 'var(--mui-palette-text-muted)', textAlign: 'center', textTransform: 'capitalize' }}>{side}</Typography>
                        <NumberInput value={v[side]} onChange={(n) => set(side, n)} min={0} max={max} step={0.5} disabled={disabled} ariaLabel={`${ariaLabel} ${side} (mm)`} />
                    </Box>
                ))}
            </Box>
            <Tooltip title={linked ? 'Edit sides separately' : 'Same value on all sides'} arrow>
                <IconButton size="small" aria-label={linked ? 'Unlink sides' : 'Link sides'} aria-pressed={linked} onClick={() => setLinked((l) => !l)} sx={{ mb: '3px', color: linked ? 'var(--crm-text-blue-700)' : 'var(--mui-palette-text-muted)' }}>
                    {linked ? <LinkRoundedIcon sx={{ fontSize: 18 }} /> : <LinkOffRoundedIcon sx={{ fontSize: 18 }} />}
                </IconButton>
            </Tooltip>
        </Box>
    );
}

// ─── Style editor (shared by sections, columns and blocks) ──────────────────────

export type StyleGroup = 'typography' | 'background' | 'spacing' | 'border' | 'layout';

const ALIGN_OPTIONS = [
    { value: 'left' as const, label: 'Left' },
    { value: 'center' as const, label: 'Center' },
    { value: 'right' as const, label: 'Right' },
    { value: 'justify' as const, label: 'Justify' },
];

export function StyleEditor({
    style,
    onChange,
    accent,
    disabled,
    groups,
    kind,
}: {
    style: Style;
    /** Receives a patch; `undefined` values remove the property. */
    onChange: (patch: Partial<Style>) => void;
    accent: string;
    disabled?: boolean;
    groups: StyleGroup[];
    kind: 'section' | 'column' | 'block';
}) {
    const border = style.border ?? { width: 0, style: 'solid' as const, color: 'var(--crm-slate-300)', radius: 0, sides: { top: true, right: true, bottom: true, left: true } };
    const setBorder = (patch: Partial<typeof border>) => {
        const next = { ...border, ...patch };
        onChange({ border: next.width === 0 && next.radius === 0 ? undefined : next });
    };
    return (
        <>
            {groups.includes('typography') && (
                <PanelSection title="Typography">
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <Field label="Font size">
                            <NumberInput value={style.fontSize} onChange={(v) => onChange({ fontSize: v })} min={5} max={48} step={0.5} unit="pt" optional disabled={disabled} ariaLabel="Font size" />
                        </Field>
                        <Field label="Line height">
                            <NumberInput value={style.lineHeight} onChange={(v) => onChange({ lineHeight: v })} min={0.8} max={3} step={0.1} optional disabled={disabled} ariaLabel="Line height" />
                        </Field>
                    </Box>
                    <Field label="Weight / style">
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Segmented
                                value={style.fontWeight}
                                onChange={(v) => onChange({ fontWeight: v === style.fontWeight ? undefined : v })}
                                options={[
                                    { value: 'normal', label: 'Regular' },
                                    { value: 'bold', label: 'Bold' },
                                ]}
                                disabled={disabled}
                                ariaLabel="Font weight"
                            />
                            <Segmented
                                value={style.fontStyle}
                                onChange={(v) => onChange({ fontStyle: v === style.fontStyle ? undefined : v })}
                                options={[
                                    { value: 'normal', label: 'Upright' },
                                    { value: 'italic', label: 'Italic' },
                                ]}
                                disabled={disabled}
                                ariaLabel="Font style"
                            />
                        </Box>
                    </Field>
                    <Field label="Text colour">
                        <ColorInput value={style.color} onChange={(v) => onChange({ color: v })} accent={accent} disabled={disabled} ariaLabel="Text colour" />
                    </Field>
                    <Field label="Alignment">
                        <Segmented value={style.textAlign} onChange={(v) => onChange({ textAlign: v })} options={ALIGN_OPTIONS} disabled={disabled} ariaLabel="Text alignment" />
                    </Field>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <Field label="Letter spacing">
                            <NumberInput value={style.letterSpacing} onChange={(v) => onChange({ letterSpacing: v || undefined })} min={0} max={10} step={0.5} unit="px" optional disabled={disabled} ariaLabel="Letter spacing" />
                        </Field>
                        <Field label="Case">
                            <SelectInput
                                value={style.textTransform ?? 'none'}
                                onChange={(v) => onChange({ textTransform: v === 'none' ? undefined : v })}
                                options={[
                                    { value: 'none', label: 'As typed' },
                                    { value: 'uppercase', label: 'UPPERCASE' },
                                ]}
                                disabled={disabled}
                                ariaLabel="Text case"
                            />
                        </Field>
                    </Box>
                </PanelSection>
            )}
            {groups.includes('background') && (
                <PanelSection title="Background">
                    <Field label="Background colour">
                        <ColorInput value={style.background} onChange={(v) => onChange({ background: v })} accent={accent} disabled={disabled} ariaLabel="Background colour" />
                    </Field>
                </PanelSection>
            )}
            {groups.includes('layout') && (
                <PanelSection title="Layout">
                    {kind === 'block' && (
                        <Field label="Width" hint="Of the column; empty = full width">
                            <NumberInput value={style.width} onChange={(v) => onChange({ width: v === 100 ? undefined : v })} min={5} max={100} unit="%" optional disabled={disabled} ariaLabel="Block width" />
                        </Field>
                    )}
                    {kind === 'block' && (
                        <Field label="Position" hint={style.width && style.width < 100 ? 'Where the block sits in its column' : 'Set a width below 100% to move the block left, centre or right'}>
                            <Segmented
                                value={style.blockAlign ?? 'left'}
                                onChange={(v) => onChange({ blockAlign: v === 'left' ? undefined : v })}
                                options={[
                                    { value: 'left', label: 'Left' },
                                    { value: 'center', label: 'Centre' },
                                    { value: 'right', label: 'Right' },
                                ]}
                                disabled={disabled || !style.width || style.width >= 100}
                                ariaLabel="Block position"
                            />
                        </Field>
                    )}
                    {kind === 'column' && (
                        <Field label="Vertical alignment">
                            <Segmented
                                value={style.verticalAlign ?? 'top'}
                                onChange={(v) => onChange({ verticalAlign: v === 'top' ? undefined : v })}
                                options={[
                                    { value: 'top', label: 'Top' },
                                    { value: 'middle', label: 'Middle' },
                                    { value: 'bottom', label: 'Bottom' },
                                ]}
                                disabled={disabled}
                                ariaLabel="Vertical alignment"
                            />
                        </Field>
                    )}
                    <Field label="Minimum height">
                        <NumberInput value={style.minHeight} onChange={(v) => onChange({ minHeight: v || undefined })} min={0} max={300} unit="mm" optional disabled={disabled} ariaLabel="Minimum height" />
                    </Field>
                    <SwitchRow label="Keep on one page" hint="Avoid splitting it across a page break" checked={Boolean(style.avoidPageBreak)} onChange={(v) => onChange({ avoidPageBreak: v || undefined })} disabled={disabled} />
                </PanelSection>
            )}
            {groups.includes('spacing') && (
                <PanelSection title="Spacing">
                    <Field label="Padding (inside, mm)">
                        <SpacingInput value={style.padding} onChange={(v) => onChange({ padding: v })} disabled={disabled} ariaLabel="Padding" />
                    </Field>
                    {kind !== 'column' && (
                        <Field label="Margin (outside, mm)">
                            <SpacingInput value={style.margin} onChange={(v) => onChange({ margin: v })} disabled={disabled} ariaLabel="Margin" />
                        </Field>
                    )}
                </PanelSection>
            )}
            {groups.includes('border') && (
                <PanelSection title="Borders">
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <Field label="Width">
                            <NumberInput value={border.width} onChange={(v) => setBorder({ width: v ?? 0 })} min={0} max={10} step={0.5} unit="px" disabled={disabled} ariaLabel="Border width" />
                        </Field>
                        <Field label="Corner radius">
                            <NumberInput value={border.radius} onChange={(v) => setBorder({ radius: v ?? 0 })} min={0} max={40} unit="px" disabled={disabled} ariaLabel="Corner radius" />
                        </Field>
                    </Box>
                    <Field label="Style">
                        <Segmented
                            value={border.style}
                            onChange={(v) => setBorder({ style: v })}
                            options={[
                                { value: 'solid', label: 'Solid' },
                                { value: 'dashed', label: 'Dashed' },
                                { value: 'dotted', label: 'Dotted' },
                            ]}
                            disabled={disabled}
                            ariaLabel="Border style"
                        />
                    </Field>
                    <Field label="Colour">
                        <ColorInput value={border.color} onChange={(v) => setBorder({ color: v ?? '#cbd5e1' })} accent={accent} allowNone={false} disabled={disabled} ariaLabel="Border colour" />
                    </Field>
                    <Field label="Sides">
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                                <ToggleButton
                                    key={side}
                                    size="small"
                                    value={side}
                                    selected={border.sides[side]}
                                    disabled={disabled}
                                    onChange={() => setBorder({ sides: { ...border.sides, [side]: !border.sides[side] } })}
                                    sx={{ flex: 1, textTransform: 'capitalize', fontSize: '0.72rem', py: 0.3 }}
                                >
                                    {side}
                                </ToggleButton>
                            ))}
                        </Box>
                    </Field>
                </PanelSection>
            )}
        </>
    );
}
