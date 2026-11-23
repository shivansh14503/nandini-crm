'use client';

import React, { useState } from 'react';
import { Autocomplete, Box, Button, ButtonBase, IconButton, MenuItem, Switch, TextField, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import {
    BADGE_STYLES,
    LIMITS,
    SECTION_STYLES,
    cloneSection,
    type BadgeStyle,
    type DrawerBadge,
    type DrawerBlock,
    type DrawerFieldBlock,
    type DrawerLayoutDocument,
    type DrawerSection,
    type FieldDisplay,
    type SectionStyle,
} from '@/lib/drawer-layout';
import type { FieldType } from '@/types/formConfig.types';
import { BADGE_STYLE_LABELS, SECTION_STYLE_LABELS, defaultDisplayFor, newLayoutId, type AddressDef, type DrawerFieldDef } from '@/components/common/Drawer/layout';
import { inputSx, primaryButtonSx, secondaryButtonSx } from '../builderUi';
import { AvatarPicker } from './AvatarPicker';
import type { CanvasTab } from './BuilderCanvas';
import { findBadge, findBlock, findSection, insertSection, moveBadge, moveBlock, moveSection, type LayoutEditor, type Selection } from './layoutEditor';

/**
 * Right panel of the Drawer Layout builder: settings of whatever is selected on the drawer (header, a badge, a
 * section or one of its blocks), with buttons to move things for anyone who'd rather not drag (touch, keyboard).
 */

// ─── Small controls ─────────────────────────────────────────────────────────────

function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mui-palette-text-secondary)' }}>{title}</Typography>
            {children}
            {hint && <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>{hint}</Typography>}
        </Box>
    );
}

function Toggle({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{label}</Typography>
                {hint && <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>{hint}</Typography>}
            </Box>
            <Switch size="small" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} slotProps={{ input: { 'aria-label': label } }} />
        </Box>
    );
}

function Segmented<T extends string | number>({ value, options, onChange, disabled, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean; label: string }) {
    return (
        <Box role="radiogroup" aria-label={label} sx={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 0.5, p: 0.4, borderRadius: '9px', backgroundColor: 'var(--mui-palette-background-subtle)', border: '1px solid var(--mui-palette-border-main)' }}>
            {options.map(([v, text]) => {
                const on = v === value;
                return (
                    <ButtonBase
                        key={String(v)}
                        role="radio"
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => onChange(v)}
                        sx={{
                            py: 0.55,
                            px: 0.5,
                            borderRadius: '7px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            color: on ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                            backgroundColor: on ? 'var(--mui-palette-background-paper)' : 'transparent',
                            border: on ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                            '&:hover': on ? undefined : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                            '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                        }}
                    >
                        {text}
                    </ButtonBase>
                );
            })}
        </Box>
    );
}

function TextInput({ label, value, onChange, max, placeholder, multiline, disabled }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; multiline?: boolean; disabled?: boolean }) {
    return (
        <TextField
            size="small"
            fullWidth
            label={label}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            multiline={multiline}
            minRows={multiline ? 3 : undefined}
            onChange={(e) => onChange(e.target.value.slice(0, max))}
            sx={inputSx}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: max } }}
            helperText={value.length > max * 0.8 ? `${value.length} / ${max}` : undefined}
        />
    );
}

function FieldSelect({ fields, value, onChange, label, disabled }: { fields: DrawerFieldDef[]; value: string; onChange: (f: DrawerFieldDef) => void; label: string; disabled?: boolean }) {
    const current = fields.find((f) => f.key === value) ?? null;
    return (
        <Autocomplete<DrawerFieldDef, false, false, false>
            size="small"
            options={fields}
            value={current}
            disabled={disabled}
            groupBy={(f) => f.group}
            getOptionLabel={(f) => f.label}
            isOptionEqualToValue={(a, b) => a.key === b.key}
            onChange={(_e, f) => f && onChange(f)}
            renderInput={(params) => <TextField {...params} label={label} placeholder={current ? undefined : value || 'Pick a field'} sx={inputSx} slotProps={{ ...params.slotProps, inputLabel: { ...params.slotProps?.inputLabel, shrink: true } }} />}
        />
    );
}

function SelectInput<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean }) {
    return (
        <TextField select size="small" fullWidth label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} sx={inputSx}>
            {options.map(([v, text]) => (
                <MenuItem key={v} value={v} sx={{ fontSize: '0.84rem' }}>
                    {text}
                </MenuItem>
            ))}
        </TextField>
    );
}

const iconButtonSx = {
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

function MoveButtons({ onBack, onForward, backDisabled, forwardDisabled, horizontal, disabled }: { onBack: () => void; onForward: () => void; backDisabled: boolean; forwardDisabled: boolean; horizontal?: boolean; disabled?: boolean }) {
    const Back = horizontal ? ArrowBackRoundedIcon : ArrowUpwardRoundedIcon;
    const Forward = horizontal ? ArrowForwardRoundedIcon : ArrowDownwardRoundedIcon;
    return (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={horizontal ? 'Move left' : 'Move up'} arrow>
                <span>
                    <IconButton size="small" aria-label={horizontal ? 'Move left' : 'Move up'} disabled={disabled || backDisabled} onClick={onBack} sx={iconButtonSx}>
                        <Back sx={{ fontSize: 17 }} />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title={horizontal ? 'Move right' : 'Move down'} arrow>
                <span>
                    <IconButton size="small" aria-label={horizontal ? 'Move right' : 'Move down'} disabled={disabled || forwardDisabled} onClick={onForward} sx={iconButtonSx}>
                        <Forward sx={{ fontSize: 17 }} />
                    </IconButton>
                </span>
            </Tooltip>
        </Box>
    );
}

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
    return (
        <Button
            size="small"
            variant="outlined"
            disabled={disabled}
            startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />}
            onClick={onClick}
            sx={{
                ...secondaryButtonSx,
                alignSelf: 'flex-start',
                '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)', borderColor: 'var(--mui-palette-error-softBorder)' },
            }}
        >
            {label}
        </Button>
    );
}

// ─── Options ────────────────────────────────────────────────────────────────────

const DISPLAY_LABELS: Record<FieldDisplay, string> = {
    standard: 'Label and value',
    large: 'Large value',
    emphasis: 'Brand highlight',
    chip: 'Chip',
    chips: 'Chips (one per value)',
    quote: 'Quote box',
    channel: 'Call / email row with buttons',
    person: 'User with role and department',
    code: 'Code pill with copy button',
    masked: 'Hidden until revealed (last 4 shown)',
};

function displaysFor(type: FieldType | undefined): FieldDisplay[] {
    const list: FieldDisplay[] = ['standard', 'large', 'emphasis', 'chip'];
    if (type === 'multiselect' || type === 'email') list.push('chips');
    if (type === 'text' || type === 'textarea' || type === 'uppercase') list.push('quote');
    if (type === 'phone' || type === 'email') list.push('channel');
    if (type === 'lookup') list.push('person');
    if (type === 'text' || type === 'uppercase' || type === 'number') list.push('code', 'masked');
    return list;
}

const STYLE_SWATCH: Record<SectionStyle, { bg: string; border: string }> = {
    card: { bg: 'var(--mui-palette-background-paper)', border: '1px solid var(--mui-palette-border-strong)' },
    subtle: { bg: 'var(--mui-palette-background-subtle)', border: '1px solid var(--mui-palette-border-strong)' },
    highlight: { bg: 'var(--mui-palette-primary-soft)', border: '1px solid var(--mui-palette-primary-softBorder)' },
    attention: { bg: 'var(--mui-palette-warning-soft)', border: '1px solid var(--mui-palette-warning-softBorder)' },
    plain: { bg: 'transparent', border: '1px dashed var(--mui-palette-border-strong)' },
};

const countBlocks = (doc: DrawerLayoutDocument) => Object.values(doc.tabs).reduce((n, sections) => n + sections.reduce((m, s) => m + s.blocks.length, 0), 0);

const titleCase = (text: string) => (text === text.toUpperCase() ? text.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, s: string, c: string) => s + c.toUpperCase()) : text);

// ─── Panels per selection ───────────────────────────────────────────────────────

interface PanelProps {
    editor: LayoutEditor;
    fields: DrawerFieldDef[];
    addresses: AddressDef[];
    tabs: CanvasTab[];
    readOnly: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

function HeaderSettings({ editor, fields, readOnly, title, hotAvatarAvailable, onAddBadge }: PanelProps & { title: string; hotAvatarAvailable: boolean; onAddBadge: () => void }) {
    const { doc, edit, select } = editor;
    const { header } = doc;
    const label = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
    return (
        <>
            <Group title="Title" hint="The big line at the top of the drawer.">
                <FieldSelect label="Field" fields={fields} value={header.titleField} disabled={readOnly} onChange={(f) => edit((d) => void (d.header.titleField = f.key))} />
            </Group>
            <Group title="Subtitle" hint={`Shown under the title, joined with •. Up to ${LIMITS.subtitleFields}; empty values are skipped.`}>
                {header.subtitleFields.map((key, i) => (
                    <Box key={`${key}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <FieldSelect label={`Value ${i + 1}`} fields={fields} value={key} disabled={readOnly} onChange={(f) => edit((d) => void (d.header.subtitleFields[i] = f.key))} />
                        </Box>
                        <Tooltip title={`Remove ${label(key)}`} arrow>
                            <span>
                                <IconButton size="small" aria-label={`Remove ${label(key)} from the subtitle`} disabled={readOnly} onClick={() => edit((d) => void d.header.subtitleFields.splice(i, 1))} sx={iconButtonSx}>
                                    <CloseRoundedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
                ))}
                {header.subtitleFields.length < LIMITS.subtitleFields && (
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
                        disabled={readOnly}
                        onClick={() => {
                            const next = fields.find((f) => f.key !== header.titleField && !header.subtitleFields.includes(f.key));
                            if (next) edit((d) => void d.header.subtitleFields.push(next.key));
                        }}
                        sx={{ ...secondaryButtonSx, alignSelf: 'flex-start' }}
                    >
                        Add a value
                    </Button>
                )}
            </Group>
            <Group title="Avatar">
                <AvatarPicker value={header.avatar} title={title} disabled={readOnly} onChange={(avatar) => edit((d) => void (d.header.avatar = avatar))} />
                {hotAvatarAvailable && (
                    <Toggle label="Red while Hot" hint="The avatar turns red while the lead's Rating is Hot." checked={header.hotAvatar} disabled={readOnly} onChange={(v) => edit((d) => void (d.header.hotAvatar = v))} />
                )}
            </Group>
            <Group title={`Badges (${header.badges.length} / ${LIMITS.badges})`} hint="Click a badge to change it. Drag badges on the drawer to reorder them.">
                {header.badges.map((b) => (
                    <ButtonBase
                        key={b.id}
                        onClick={() => select({ kind: 'badge', id: b.id })}
                        sx={{
                            justifyContent: 'space-between',
                            gap: 1,
                            px: 1.25,
                            py: 0.75,
                            borderRadius: '8px',
                            border: '1px solid var(--mui-palette-border-main)',
                            fontFamily: 'inherit',
                            textAlign: 'left',
                            '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                        }}
                    >
                        <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                            {b.prefix}
                            {label(b.field)}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }}>
                            {b.style === 'auto' ? 'Value colours' : BADGE_STYLE_LABELS[b.style]}
                        </Typography>
                    </ButtonBase>
                ))}
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
                    disabled={readOnly || header.badges.length >= LIMITS.badges}
                    onClick={onAddBadge}
                    sx={{ ...secondaryButtonSx, alignSelf: 'flex-start' }}
                >
                    Add badge
                </Button>
            </Group>
        </>
    );
}

function BadgeSettings({ editor, fields, readOnly, badge, index, onRemove }: PanelProps & { badge: DrawerBadge; index: number; onRemove: () => void }) {
    const { doc, edit } = editor;
    const update = (patch: Partial<DrawerBadge>, key?: string) =>
        edit(
            (d) => {
                const at = findBadge(d, badge.id);
                if (at) Object.assign(d.header.badges[at.index], patch);
            },
            key ? { coalesceKey: `${badge.id}:${key}` } : undefined,
        );
    return (
        <>
            <Group title="Value">
                <FieldSelect label="Field" fields={fields} value={badge.field} disabled={readOnly} onChange={(f) => update({ field: f.key, style: f.key === 'rating' || f.key === 'status' ? 'auto' : badge.style })} />
                <TextInput label="Text before the value" placeholder="e.g. Rating: " value={badge.prefix} max={LIMITS.badgePrefix} disabled={readOnly} onChange={(v) => update({ prefix: v }, 'prefix')} />
            </Group>
            <Group title="Colour" hint={badge.style === 'auto' ? 'Rating uses Hot / Warm / Cold colours, a scorecard uses its grade colour, Status is green, anything else grey.' : undefined}>
                <SelectInput<BadgeStyle> label="Colour" value={badge.style} options={BADGE_STYLES.map((s) => [s, BADGE_STYLE_LABELS[s]] as const)} disabled={readOnly} onChange={(v) => update({ style: v })} />
            </Group>
            <Toggle label="Hide when empty" hint="Off: shows a dash when the record has no value." checked={badge.hideEmpty} disabled={readOnly} onChange={(v) => update({ hideEmpty: v })} />
            <Group title="Position">
                <MoveButtons
                    horizontal
                    disabled={readOnly}
                    backDisabled={index === 0}
                    forwardDisabled={index >= doc.header.badges.length - 1}
                    onBack={() => edit((d) => moveBadge(d, badge.id, index - 1))}
                    onForward={() => edit((d) => moveBadge(d, badge.id, index + 2))}
                />
            </Group>
            <RemoveButton label="Remove badge" disabled={readOnly} onClick={onRemove} />
        </>
    );
}

function SectionSettings({
    editor,
    tabs,
    readOnly,
    notify,
    section,
    tab,
    index,
    onRemove,
    onShowTab,
    onSavePiece,
    savingPiece,
}: PanelProps & {
    section: DrawerSection;
    tab: string;
    index: number;
    onRemove: () => void;
    onShowTab: (tab: string) => void;
    onSavePiece: (name: string, section: DrawerSection) => Promise<boolean>;
    savingPiece: boolean;
}) {
    const { doc, edit } = editor;
    const [pieceName, setPieceName] = useState('');
    const count = doc.tabs[tab]?.length ?? 0;
    const update = (patch: Partial<DrawerSection>, key?: string) =>
        edit(
            (d) => {
                const at = findSection(d, section.id);
                if (at) Object.assign(at.section, patch);
            },
            key ? { coalesceKey: `${section.id}:${key}` } : undefined,
        );

    const duplicate = () => {
        if (count >= LIMITS.sectionsPerTab) return notify(`A tab can have at most ${LIMITS.sectionsPerTab} sections.`, 'warning');
        if (countBlocks(doc) + section.blocks.length > LIMITS.totalBlocks) return notify(`A drawer can have at most ${LIMITS.totalBlocks} items.`, 'warning');
        const copy = cloneSection(section, newLayoutId);
        edit((d) => insertSection(d, tab, index + 1, copy), { select: { kind: 'section', id: copy.id } });
    };

    const suggestedName = section.piece || titleCase(section.title.trim()) || 'My piece';

    return (
        <>
            <Group title="Title" hint="Leave empty for a section without a title bar.">
                <TextInput label="Section title" value={section.title} max={LIMITS.sectionTitle} disabled={readOnly} onChange={(v) => update({ title: v }, 'title')} />
            </Group>
            <Group title="Columns">
                <Segmented<1 | 2>
                    label="Columns"
                    value={section.columns}
                    disabled={readOnly}
                    options={[
                        [1, 'One column'],
                        [2, 'Two columns'],
                    ]}
                    onChange={(v) => update({ columns: v })}
                />
            </Group>
            <Group title="Look">
                <Box role="radiogroup" aria-label="Section look" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 0.75 }}>
                    {SECTION_STYLES.map((style) => {
                        const on = section.style === style;
                        return (
                            <ButtonBase
                                key={style}
                                role="radio"
                                aria-checked={on}
                                disabled={readOnly}
                                onClick={() => update({ style })}
                                sx={{
                                    flexDirection: 'column',
                                    gap: 0.5,
                                    p: 0.75,
                                    borderRadius: '9px',
                                    fontFamily: 'inherit',
                                    border: on ? '2px solid var(--crm-fill-blue-600)' : '1px solid var(--mui-palette-border-main)',
                                    boxShadow: on ? '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.15)' : 'none',
                                    '&:hover': { borderColor: 'var(--crm-blue-300)' },
                                    '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.3)' },
                                }}
                            >
                                <Box sx={{ width: '100%', height: 26, borderRadius: '6px', backgroundColor: STYLE_SWATCH[style].bg, border: STYLE_SWATCH[style].border }} />
                                <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: on ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)' }}>{SECTION_STYLE_LABELS[style]}</Typography>
                            </ButtonBase>
                        );
                    })}
                </Box>
            </Group>
            <Toggle label="Hide when empty" hint="Hides the whole section when none of its fields has a value." checked={section.hideEmpty} disabled={readOnly} onChange={(v) => update({ hideEmpty: v })} />
            <Group title="Position">
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <MoveButtons
                        disabled={readOnly}
                        backDisabled={index === 0}
                        forwardDisabled={index >= count - 1}
                        onBack={() => edit((d) => moveSection(d, section.id, tab, index - 1))}
                        onForward={() => edit((d) => moveSection(d, section.id, tab, index + 2))}
                    />
                    {tabs.length > 1 && (
                        <Box sx={{ flex: '1 1 150px', minWidth: 0 }}>
                            <SelectInput
                                label="Tab"
                                value={tab}
                                disabled={readOnly}
                                options={tabs.map((t) => [t.key, t.label] as const)}
                                onChange={(next) => {
                                    if (next === tab) return;
                                    if ((doc.tabs[next]?.length ?? 0) >= LIMITS.sectionsPerTab) return notify(`A tab can have at most ${LIMITS.sectionsPerTab} sections.`, 'warning');
                                    edit((d) => moveSection(d, section.id, next, d.tabs[next]?.length ?? 0));
                                    onShowTab(next);
                                }}
                            />
                        </Box>
                    )}
                </Box>
            </Group>
            {!readOnly && (
                <Group title="Save as piece" hint="Keeps a copy in Pieces so you can add it again, here or later.">
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                        <TextField
                            size="small"
                            fullWidth
                            value={pieceName}
                            placeholder={suggestedName || 'Piece name'}
                            onChange={(e) => setPieceName(e.target.value.slice(0, LIMITS.pieceName))}
                            sx={inputSx}
                            slotProps={{ htmlInput: { 'aria-label': 'Piece name', maxLength: LIMITS.pieceName } }}
                        />
                        <Button
                            size="small"
                            variant="contained"
                            disabled={savingPiece || section.blocks.length === 0}
                            startIcon={<ExtensionOutlinedIcon sx={{ fontSize: 16 }} />}
                            onClick={async () => {
                                const ok = await onSavePiece((pieceName.trim() || suggestedName || 'My piece').slice(0, LIMITS.pieceName), section);
                                if (ok) setPieceName('');
                            }}
                            sx={{ ...primaryButtonSx, flexShrink: 0, whiteSpace: 'nowrap' }}
                        >
                            Save
                        </Button>
                    </Box>
                </Group>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" disabled={readOnly} startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 16 }} />} onClick={duplicate} sx={secondaryButtonSx}>
                    Duplicate
                </Button>
                <RemoveButton label="Remove section" disabled={readOnly} onClick={onRemove} />
            </Box>
        </>
    );
}

function BlockSettings({
    editor,
    fields,
    addresses,
    tabs,
    readOnly,
    block,
    section,
    index,
    onRemove,
}: PanelProps & { block: DrawerBlock; section: DrawerSection; index: number; onRemove: () => void }) {
    const { doc, edit } = editor;
    const update = (patch: Partial<DrawerBlock>, key?: string) =>
        edit(
            (d) => {
                const at = findBlock(d, block.id);
                if (at) Object.assign(at.block, patch);
            },
            key ? { coalesceKey: `${block.id}:${key}` } : undefined,
        );
    const tabLabel = (key: string) => tabs.find((t) => t.key === key)?.label ?? key;
    const sectionOptions = Object.entries(doc.tabs).flatMap(([tab, sections]) =>
        tabs.some((t) => t.key === tab) ? sections.map((s) => [s.id, `${tabLabel(tab)} › ${s.title.trim() || 'Untitled section'}`] as const) : [],
    );

    const position = (
        <Group title="Position">
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <MoveButtons
                    disabled={readOnly}
                    backDisabled={index === 0}
                    forwardDisabled={index >= section.blocks.length - 1}
                    onBack={() => edit((d) => moveBlock(d, block.id, section.id, index - 1))}
                    onForward={() => edit((d) => moveBlock(d, block.id, section.id, index + 2))}
                />
                {sectionOptions.length > 1 && (
                    <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
                        <SelectInput
                            label="Section"
                            value={section.id}
                            disabled={readOnly}
                            options={sectionOptions}
                            onChange={(target) => {
                                if (target === section.id) return;
                                edit((d) => moveBlock(d, block.id, target, findSection(d, target)?.section.blocks.length ?? 0));
                            }}
                        />
                    </Box>
                )}
            </Box>
        </Group>
    );

    if (block.type === 'field') {
        const def = fields.find((f) => f.key === block.field);
        const displays = displaysFor(def?.type);
        if (!displays.includes(block.display)) displays.push(block.display);
        const setField = (f: DrawerFieldDef) => {
            const allowed = displaysFor(f.type);
            update({ field: f.key, display: allowed.includes(block.display) ? block.display : defaultDisplayFor(f.type) } as Partial<DrawerFieldBlock>);
        };
        return (
            <>
                <Group title="Value">
                    <FieldSelect label="Field" fields={fields} value={block.field} disabled={readOnly} onChange={setField} />
                    <SelectInput<FieldDisplay> label="Look" value={block.display} disabled={readOnly} options={displays.map((d) => [d, DISPLAY_LABELS[d]] as const)} onChange={(v) => update({ display: v } as Partial<DrawerFieldBlock>)} />
                </Group>
                <Group title="Label">
                    <Toggle label="Show label" checked={block.showLabel} disabled={readOnly} onChange={(v) => update({ showLabel: v } as Partial<DrawerFieldBlock>)} />
                    {block.showLabel && (
                        <TextInput label="Label text" placeholder={def?.label ?? 'Field label'} value={block.label} max={LIMITS.fieldLabel} disabled={readOnly} onChange={(v) => update({ label: v } as Partial<DrawerFieldBlock>, 'label')} />
                    )}
                </Group>
                {section.columns === 2 && (
                    <Group title="Width">
                        <Segmented<'half' | 'full'>
                            label="Width"
                            value={block.width}
                            disabled={readOnly}
                            options={[
                                ['half', 'One column'],
                                ['full', 'Whole row'],
                            ]}
                            onChange={(v) => update({ width: v } as Partial<DrawerFieldBlock>)}
                        />
                    </Group>
                )}
                <Group title="When empty">
                    <Toggle label="Hide when empty" checked={block.hideEmpty} disabled={readOnly} onChange={(v) => update({ hideEmpty: v } as Partial<DrawerFieldBlock>)} />
                    {!block.hideEmpty && (
                        <TextInput label="Text to show" placeholder="Not provided" value={block.emptyText} max={LIMITS.emptyText} disabled={readOnly} onChange={(v) => update({ emptyText: v } as Partial<DrawerFieldBlock>, 'emptyText')} />
                    )}
                </Group>
                <Toggle label="Double-click to copy" hint="Users can copy the value with a double-click." checked={block.copy} disabled={readOnly} onChange={(v) => update({ copy: v } as Partial<DrawerFieldBlock>)} />
                {position}
                <RemoveButton label="Remove field" disabled={readOnly} onClick={onRemove} />
            </>
        );
    }

    return (
        <>
            {block.type === 'heading' && (
                <Group title="Heading">
                    <TextInput label="Text" value={block.text} max={LIMITS.heading} disabled={readOnly} onChange={(v) => update({ text: v }, 'text')} />
                </Group>
            )}
            {block.type === 'text' && (
                <Group title="Static text" hint="The same text on every record, e.g. a note for the team.">
                    <TextInput label="Text" value={block.text} max={LIMITS.text} multiline disabled={readOnly} onChange={(v) => update({ text: v }, 'text')} />
                </Group>
            )}
            {block.type === 'address' && (
                <Group title="Address">
                    <SelectInput label="Which address" value={block.prefix} disabled={readOnly} options={addresses.map((a) => [a.prefix, a.label] as const)} onChange={(v) => update({ prefix: v })} />
                    <TextInput label="Text when empty" placeholder="No address" value={block.emptyText} max={LIMITS.emptyText} disabled={readOnly} onChange={(v) => update({ emptyText: v }, 'emptyText')} />
                </Group>
            )}
            {block.type === 'customFields' && (
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 }}>
                    Lists every custom field that has &ldquo;Visible in Drawer&rdquo; switched on and isn&apos;t placed anywhere else on this drawer. New custom fields show up here on
                    their own, so keep it somewhere on the drawer. Place a custom field elsewhere and it leaves this list.
                </Typography>
            )}
            {block.type === 'lineItems' && (
                <Group title="Line items" hint="Every product and service on the record, one card each with quantity, price, discount and tax.">
                    <TextInput label="Text when there are none" placeholder="No line items yet." value={block.emptyText} max={LIMITS.emptyText} disabled={readOnly} onChange={(v) => update({ emptyText: v }, 'emptyText')} />
                </Group>
            )}
            {block.type === 'totals' && (
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 }}>
                    Gross total, item and lump-sum discounts, subtotal, tax and the grand total of the record&apos;s line items.
                </Typography>
            )}
            {block.type === 'divider' && <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>A thin line between the items above and below it.</Typography>}
            {position}
            <RemoveButton label="Remove" disabled={readOnly} onClick={onRemove} />
        </>
    );
}

// ─── Panel ──────────────────────────────────────────────────────────────────────

export function selectionTitle(selection: Selection | null, doc: DrawerLayoutDocument, fields: DrawerFieldDef[]): string {
    if (!selection) return 'Settings';
    if (selection.kind === 'header') return 'Header';
    if (selection.kind === 'badge') return 'Badge';
    if (selection.kind === 'section') return 'Section';
    const block = findBlock(doc, selection.id)?.block;
    if (!block) return 'Settings';
    if (block.type === 'field') return fields.find((f) => f.key === block.field)?.label ?? 'Field';
    return { heading: 'Heading', text: 'Static text', divider: 'Divider', address: 'Address', customFields: 'Other custom fields', lineItems: 'Line items', totals: 'Totals' }[block.type];
}

export function BuilderSettings({
    editor,
    fields,
    addresses,
    tabs,
    readOnly,
    notify,
    title,
    hotAvatarAvailable,
    onAddBadge,
    onRemove,
    onShowTab,
    onSavePiece,
    savingPiece,
    onClose,
}: PanelProps & {
    title: string;
    hotAvatarAvailable: boolean;
    onAddBadge: () => void;
    onRemove: (selection: Selection) => void;
    onShowTab: (tab: string) => void;
    onSavePiece: (name: string, section: DrawerSection) => Promise<boolean>;
    savingPiece: boolean;
    onClose?: () => void;
}) {
    const { doc, selection, select } = editor;
    const base: PanelProps = { editor, fields, addresses, tabs, readOnly, notify };
    let body: React.ReactNode = null;

    if (selection?.kind === 'header') {
        body = <HeaderSettings {...base} title={title} hotAvatarAvailable={hotAvatarAvailable} onAddBadge={onAddBadge} />;
    } else if (selection?.kind === 'badge') {
        const at = findBadge(doc, selection.id);
        if (at) body = <BadgeSettings key={at.badge.id} {...base} badge={at.badge} index={at.index} onRemove={() => onRemove(selection)} />;
    } else if (selection?.kind === 'section') {
        const at = findSection(doc, selection.id);
        if (at)
            body = (
                <SectionSettings
                    key={at.section.id}
                    {...base}
                    section={at.section}
                    tab={at.tab}
                    index={at.index}
                    onRemove={() => onRemove(selection)}
                    onShowTab={onShowTab}
                    onSavePiece={onSavePiece}
                    savingPiece={savingPiece}
                />
            );
    } else if (selection?.kind === 'block') {
        const at = findBlock(doc, selection.id);
        if (at) body = <BlockSettings key={at.block.id} {...base} block={at.block} section={at.section} index={at.index} onRemove={() => onRemove(selection)} />;
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                <Typography noWrap sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                    {selectionTitle(selection, doc, fields)}
                </Typography>
                {(selection || onClose) && (
                    <Tooltip title="Close" arrow>
                        <IconButton
                            size="small"
                            aria-label="Close settings"
                            onClick={() => (onClose ? onClose() : select(null))}
                            sx={{ color: 'var(--mui-palette-text-muted)', '&:hover': { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' } }}
                        >
                            <CloseRoundedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            {body ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{body}</Box>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, color: 'var(--mui-palette-text-secondary)' }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <TouchAppOutlinedIcon sx={{ fontSize: 20, color: 'var(--crm-text-blue-600)', mt: 0.2 }} />
                        <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.5 }}>Click any part of the drawer to change it: the header, a badge, a section&apos;s title bar, or a field.</Typography>
                    </Box>
                    <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.78rem', lineHeight: 1.6 }}>
                        <li>Drag fields, blocks and pieces from the left onto the drawer, or press their + button.</li>
                        <li>Drag sections by their handle and fields by themselves to move them.</li>
                        <li>Delete removes what&apos;s selected; Ctrl + Z undoes.</li>
                        <li>Empty fields fold away for each record unless you turn that off.</li>
                    </Box>
                    <Button size="small" variant="outlined" onClick={() => select({ kind: 'header' })} sx={{ ...secondaryButtonSx, alignSelf: 'flex-start' }}>
                        Edit the header
                    </Button>
                </Box>
            )}
        </Box>
    );
}
